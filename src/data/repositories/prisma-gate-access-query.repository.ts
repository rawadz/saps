import { Injectable } from '@nestjs/common';
import { GateDirection } from '../../domain/entities/gate.entity';
import {
  EmployeeGateRow,
  GateAccessQueryRepository,
} from '../../domain/repositories/gate-access-query.repository';
import { CryptoService } from '../infrastructure/crypto.service';
import { PrismaService } from '../infrastructure/prisma.service';

/**
 * تنفيذ Prisma لقراءة بوابات الموظف المصرّح بها. الـ selfId مشفّر، فالبحث عبر البصمة
 * الحتمية ثم حلّ الـ id الداخليّ — كما في باقي دوال الموظف. الـ select بقائمة سماح
 * صريحة: معرّف/تاريخ المنحة + حقول عرض البوابة فقط عبر العلاقة المتداخلة؛ لا حقل
 * حسّاس يُقرأ هنا (ولا CryptoService يفكّ شيئاً سوى اشتقاق بصمة البحث).
 */
@Injectable()
export class PrismaGateAccessQueryRepository
  implements GateAccessQueryRepository
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async listGatesForEmployee(selfId: string): Promise<EmployeeGateRow[]> {
    const selfIdSearchHash = this.crypto.deterministicHash(selfId);
    // قراءة دفاعية: موظف غير موجود → قائمة فارغة، لا خطأ.
    const emp = await this.prisma.employee.findUnique({
      where: { selfIdSearchHash },
      select: { id: true },
    });
    if (!emp) return [];

    const rows = await this.prisma.employeeGateAccess.findMany({
      where: { employeeId: emp.id },
      // قائمة سماح صريحة: حقول المنحة + حقول عرض البوابة فقط عبر العلاقة.
      select: {
        gateId: true,
        assignedAt: true,
        gate: { select: { name: true, direction: true, isActive: true } },
      },
      orderBy: { gate: { name: 'asc' } }, // مرتّبة باسم البوابة للعرض
    });

    return rows.map((r) => ({
      gateId: r.gateId,
      name: r.gate.name,
      // النوع توطئة من Prisma enum إلى نوع domain (القيم متطابقة: in/out/both).
      direction: r.gate.direction as GateDirection,
      isActive: r.gate.isActive,
      assignedAt: r.assignedAt,
    }));
  }
}
