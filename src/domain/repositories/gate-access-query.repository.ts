import { GateDirection } from '../entities/gate.entity';

/**
 * عقد الاستعلام (القراءة) لبوابات الموظف المصرّح بها — طبقة domain خالصة، منفصل عن
 * GateAccessRepository (نفس فصل CQRS المتّبع في GateRepository/GateQueryRepository).
 * تملك domain هذا العقد، وتنفّذه طبقة data عبر join على جدول الربط employee_gate_access.
 *
 * صفوف البوابات لا تحمل حقولاً حسّاسة/مشفّرة، فلا حاجة لقيد allowlist حسّاس هنا.
 */

/** صفّ واحد من بوابات الموظف المصرّح بها — تفاصيل عرض كافية للوحة الإسناد. */
export interface EmployeeGateRow {
  gateId: string; // معرّف البوابة (UUID)
  name: string;
  direction: GateDirection;
  isActive: boolean;
  assignedAt: Date; // متى مُنحت هذه البوابة لهذا الموظف
}

export interface GateAccessQueryRepository {
  /**
   * إرجاع البوابات المصرّح بها لموظف بدلالة selfId، مرتّبة بالاسم، للعرض في لوحة
   * الإسناد. قراءة فقط — لا تكتب أبداً. تُرجع [] إن لم تكن هناك منح.
   */
  listGatesForEmployee(selfId: string): Promise<EmployeeGateRow[]>;
}

// رمز الحقن — Symbol كي لا تستورد domain إطار NestJS.
export const GATE_ACCESS_QUERY_REPOSITORY = Symbol('GateAccessQueryRepository');
