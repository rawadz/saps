import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/data/infrastructure/prisma.service';
import type { CreateEmployeeData } from '../src/domain/repositories/employee.repository';
import { ActivateEmployeeAccountUseCase } from '../src/domain/use-cases/activate-employee-account.use-case';
import { CreateEmployeeUseCase } from '../src/domain/use-cases/create-employee.use-case';
import { GetEmployeeSelfViewUseCase } from '../src/domain/use-cases/get-employee-self-view.use-case';

/* eslint-disable no-console */

/**
 * Standalone TEST-DATA script (NOT part of `prisma db seed`, and it does not touch
 * seed.ts or any application logic). It creates ONE test employee whose Arabic name
 * is taken from THIS UTF-8 source file — so the name is stored correctly, unlike data
 * entered through a console/HTTP client that mangled the UTF-8 into "?????".
 *
 * It boots a Nest application context and calls the REAL use-cases
 * (CreateEmployee + ActivateEmployeeAccount), so encryption, the search hash and the
 * HMAC barcode are produced by exactly the same code paths as the running app.
 *
 *   Run:   npx ts-node prisma/seed-test-employee.ts
 *   Needs: Postgres + Redis running (same as the app) and the admin accounts seeded.
 */

const TEST_EMPLOYEE: CreateEmployeeData = {
  selfId: 'EMP-20001',
  fullName: 'محمد عبدالله الحربي', // correct UTF-8, straight from source — the point
  personnelType: 'civilian',
  commandDepartment: 'إدارة الأمن والحراسات',
};

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService, { strict: false });
    const createEmployee = app.get(CreateEmployeeUseCase, { strict: false });
    const activateEmployee = app.get(ActivateEmployeeAccountUseCase, {
      strict: false,
    });
    const selfView = app.get(GetEmployeeSelfViewUseCase, { strict: false });

    // A real super_admin id is required for the barcode's generated_by FK column.
    const admin = await prisma.user.findFirst({
      where: { role: 'super_admin' },
      select: { id: true },
    });
    if (!admin) {
      throw new Error(
        'No super_admin found. Seed the admin accounts first: npx prisma db seed',
      );
    }

    // 1) Create — idempotent: skip cleanly if it already exists from a prior run.
    try {
      await createEmployee.execute({
        actingRole: 'super_admin',
        data: TEST_EMPLOYEE,
      });
      console.log(`Created employee ${TEST_EMPLOYEE.selfId}.`);
    } catch (err) {
      if (err instanceof Error && err.message === 'EMPLOYEE_ALREADY_EXISTS') {
        console.log(
          `Employee ${TEST_EMPLOYEE.selfId} already exists — re-activating.`,
        );
      } else {
        throw err;
      }
    }

    // 2) Activate — generates + attaches the permanent barcode (idempotent upsert).
    await activateEmployee.execute({
      actingRole: 'super_admin',
      actingUserId: admin.id,
      targetSelfId: TEST_EMPLOYEE.selfId,
    });

    // 3) Read it back to verify the stored name and grab the barcode token.
    const profile = await selfView.execute(TEST_EMPLOYEE.selfId);
    // Code-point check (independent of how this console renders Arabic): are there
    // any Arabic-block characters in the stored name, or did it collapse to "?????"?
    const hasArabic = /[؀-ۿ]/.test(profile.fullName);

    console.log('----------------------------------------------------------------');
    console.log(`Employee:          ${TEST_EMPLOYEE.selfId}`);
    console.log(`Status:            ${profile.status}`);
    console.log(`Name has Arabic:   ${hasArabic ? 'YES' : 'NO'}  (code-point check)`);
    console.log(`Name length:       ${profile.fullName.length} chars`);
    console.log('Barcode token (paste this into the Scan screen):');
    console.log(`  ${profile.barcodeToken ?? '(none)'}`);
    console.log('----------------------------------------------------------------');
    console.log(
      'Confirm the actual Arabic name in the APP (scan the token, or the employee /me/profile) — NOT in this console, which may mis-render Arabic even when the stored value is correct.',
    );
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  console.error(`seed-test-employee failed: ${(err as Error).message}`);
  process.exit(1);
});
