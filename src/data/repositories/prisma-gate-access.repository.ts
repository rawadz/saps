import { Injectable } from '@nestjs/common';
import {
  GateAccessRepository,
  SetEmployeeGatesData,
} from '../../domain/repositories/gate-access.repository';
import { CryptoService } from '../infrastructure/crypto.service';
import { PrismaService } from '../infrastructure/prisma.service';

/**
 * تنفيذ Prisma لعقد أمر بوابات الموظف. الـ selfId مشفّر في القاعدة، فالبحث يتمّ عبر
 * البصمة الحتمية (selfIdSearchHash) لا النصّ الصريح — تماماً كباقي دوال الموظف. وجدول
 * الربط مفتاحه employee_id (UUID داخليّ)، لذا نحلّ selfId إلى الـ id الداخليّ قبل الكتابة.
 * لا تُسجَّل أي قيمة حسّاسة (selfId) في أي log.
 */
@Injectable()
export class PrismaGateAccessRepository implements GateAccessRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async setGatesForEmployee(data: SetEmployeeGatesData): Promise<void> {
    // البحث عبر البصمة الحتمية لا عبر النصّ المشفّر؛ لا نسجّل selfId في أي مكان.
    const selfIdSearchHash = this.crypto.deterministicHash(data.selfId);

    // معاملة واحدة تضمن الذرّية: الحذف ثم الإدراج معاً — لا حالة وسطى يراها قارئ
    // متزامن، ولا فقدان للمنح إن فشل الإدراج بعد الحذف.
    await this.prisma.$transaction(async (tx) => {
      // حلّ الـ id الداخليّ (UUID) من البصمة — مفتاح جدول الربط الأجنبيّ.
      const emp = await tx.employee.findUnique({
        where: { selfIdSearchHash },
        select: { id: true },
      });
      // حارس دفاعيّ فقط؛ التحقّق الأساسيّ من وجود الموظف يقع في الـ use-case لاحقاً.
      if (!emp) {
        throw new Error('EMPLOYEE_NOT_FOUND');
      }

      // استبدال كامل للمجموعة: امسح المنح الحالية أوّلاً.
      await tx.employeeGateAccess.deleteMany({ where: { employeeId: emp.id } });

      // أدرج المجموعة الجديدة فقط إن لم تكن فارغة ([] = سحب الكلّ، فلا إدراج).
      if (data.gateIds.length > 0) {
        await tx.employeeGateAccess.createMany({
          data: data.gateIds.map((gateId) => ({
            employeeId: emp.id,
            gateId,
            assignedBy: data.assignedBy ?? null,
          })),
          // درع ضدّ أي gateId مكرّر في المدخل — يبقى الاستبدال خاملاً (idempotent).
          skipDuplicates: true,
        });
      }
    });
  }

  async getGateIdsForEmployee(selfId: string): Promise<string[]> {
    const selfIdSearchHash = this.crypto.deterministicHash(selfId);
    // قراءة دفاعية: موظف غير موجود → [] بدل رمي خطأ.
    const emp = await this.prisma.employee.findUnique({
      where: { selfIdSearchHash },
      select: { id: true },
    });
    if (!emp) return [];

    const rows = await this.prisma.employeeGateAccess.findMany({
      where: { employeeId: emp.id },
      select: { gateId: true },
    });
    return rows.map((r) => r.gateId);
  }

  async hasAnyGateAccess(selfId: string): Promise<boolean> {
    // حلّ selfId إلى المعرّف الداخليّ عبر البصمة الحتمية (لا استعلام على نصّ مشفّر).
    const selfIdSearchHash = this.crypto.deterministicHash(selfId);
    const emp = await this.prisma.employee.findUnique({
      where: { selfIdSearchHash },
      select: { id: true },
    });
    if (!emp) return false; // موظف غير موجود → لا منح (حارس دفاعيّ)

    // فحص وجود ذرّيّ: أوّل صفّ منحة كافٍ — لا حاجة لجلب المجموعة كاملة.
    const first = await this.prisma.employeeGateAccess.findFirst({
      where: { employeeId: emp.id },
      select: { gateId: true },
    });
    return first !== null;
  }

  async hasGateAccess(selfId: string, gateId: string): Promise<boolean> {
    const selfIdSearchHash = this.crypto.deterministicHash(selfId);
    const emp = await this.prisma.employee.findUnique({
      where: { selfIdSearchHash },
      select: { id: true },
    });
    if (!emp) return false;

    // فحص وجود ذرّيّ على المفتاح المركّب (مدخل العميل المولَّد: employeeId_gateId) — O(1).
    const grant = await this.prisma.employeeGateAccess.findUnique({
      where: { employeeId_gateId: { employeeId: emp.id, gateId } },
      select: { gateId: true },
    });
    return grant !== null;
  }
}
