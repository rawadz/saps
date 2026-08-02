/* eslint-disable no-console */
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { ARGON2_OPTIONS } from '../src/data/infrastructure/argon.options';
import { validatePassword } from '../src/domain/auth/password-policy';

/**
 * Seeds the three bootstrap accounts: Super Admin, Branch Head, HR officer.
 *
 *  • Passwords come ONLY from environment variables — never hard-coded here.
 *  • Each initial password is validated against the password policy; the seed
 *    refuses to run with a weak one.
 *  • All three accounts are created active and with mustChangePassword = true,
 *    so the holder is forced to set a new password on first login.
 *  • Idempotent: re-running never overwrites an existing account's password.
 *
 * Run with:  npx prisma db seed   (loads .env automatically)
 */

const prisma = new PrismaClient();

interface SeedAccount {
  label: string;
  role: Role;
  username: string;
  password: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env var ${name} for seeding.`);
  }
  return value;
}

function envOr(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

async function upsertAccount(account: SeedAccount): Promise<void> {
  // Enforce the password policy on the INITIAL password too.
  const policy = validatePassword(account.password, {
    username: account.username,
  });
  if (!policy.valid) {
    throw new Error(
      `Initial password for ${account.label} violates policy: ${policy.errors.join(
        ', ',
      )}`,
    );
  }

  const passwordHash = await argon2.hash(account.password, ARGON2_OPTIONS);

  // Idempotent: create if missing; do NOT reset an existing account on re-run.
  await prisma.user.upsert({
    where: { username: account.username },
    update: {},
    create: {
      username: account.username,
      passwordHash,
      role: account.role,
      isAccountActivated: true, // bootstrap accounts are active out of the box
      mustChangePassword: true, // forced change on first login
    },
  });

  // Never log the password — only the (non-secret) username and role.
  console.log(`Seeded ${account.label}: ${account.username} [${account.role}]`);
}

async function main(): Promise<void> {
  const accounts: SeedAccount[] = [
    {
      label: 'Super Admin',
      role: Role.super_admin,
      username: envOr('SEED_SUPER_ADMIN_USERNAME', 'superadmin'),
      password: requireEnv('SEED_SUPER_ADMIN_PASSWORD'),
    },
    {
      label: 'Branch Head',
      role: Role.branch_head,
      username: envOr('SEED_BRANCH_HEAD_USERNAME', 'branch.head'),
      password: requireEnv('SEED_BRANCH_HEAD_PASSWORD'),
    },
    {
      label: 'HR Officer',
      role: Role.hr,
      username: envOr('SEED_HR_USERNAME', 'hr.officer'),
      password: requireEnv('SEED_HR_PASSWORD'),
    },
  ];

  for (const account of accounts) {
    await upsertAccount(account);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err: unknown) => {
    console.error(`Seed failed: ${(err as Error).message}`);
    await prisma.$disconnect();
    process.exit(1);
  });
