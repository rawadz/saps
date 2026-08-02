import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '../auth/role';
import {
  GateAccessRepository,
  GATE_ACCESS_REPOSITORY,
} from '../repositories/gate-access.repository';
import {
  EmployeeRepository,
  EMPLOYEE_REPOSITORY,
} from '../repositories/employee.repository';
import {
  GateRepository,
  GATE_REPOSITORY,
} from '../repositories/gate.repository';

// الإسناد يُعرّف صلاحية دخول — صلاحية حسّاسة، فنُبقي مجموعة الأدوار ضيّقة. ثابت خاصّ
// بهذا الفعل لئلّا يوسّعه سهواً تعديلٌ مستقبليّ لمجموعة أدوار مشتركة أخرى.
const GATE_ASSIGN_ROLES: Role[] = ['super_admin', 'branch_head'];

export interface AssignEmployeeGatesInput {
  actingRole: Role;
  actingUserId: string;
  selfId: string;
  gateIds: string[];
}

/**
 * إسناد مجموعة البوابات المصرّح للموظف بالعبور منها (استبدال كامل للمجموعة الحالية).
 * لا شيء يُكتب في الباركود — هذه «منحة عبور» تُقرأ حيّةً لحظة المسح (المرحلة ٤). الدور
 * يُعاد فحصه هنا (دفاع بالعمق فوق حارس @Roles)، ووجود الموظف وكل بوابة يُتحقّق منه على
 * مستوى التطبيق فوق قيد المفتاح الأجنبيّ في القاعدة.
 */
@Injectable()
export class AssignEmployeeGatesUseCase {
  constructor(
    @Inject(GATE_ACCESS_REPOSITORY)
    private readonly gateAccess: GateAccessRepository,
    @Inject(EMPLOYEE_REPOSITORY)
    private readonly employees: EmployeeRepository,
    @Inject(GATE_REPOSITORY)
    private readonly gates: GateRepository,
  ) {}

  async execute(input: AssignEmployeeGatesInput): Promise<void> {
    // 1) فحص الدور (دفاع بالعمق فوق @Roles على المتحكّم).
    if (!GATE_ASSIGN_ROLES.includes(input.actingRole)) {
      throw new ForbiddenException('NOT_AUTHORIZED_TO_ASSIGN_GATES');
    }

    // 2) تحقّق المدخلات.
    if (!Array.isArray(input.gateIds)) {
      throw new BadRequestException('INVALID_GATE_IDS');
    }
    // المفتاح المركّب (employee_id, gate_id) يرفض التكرار أصلاً؛ التنظيف هنا يجعل
    // التحقّق والعدّ والرسائل دقيقة، ويتجنّب فحص البوابة نفسها مرّتين.
    const uniqueGateIds = [...new Set(input.gateIds)];

    // 3) تحقّق وجود الموظف.
    const employee = await this.employees.findByEmployeeId(input.selfId);
    if (!employee) {
      throw new NotFoundException('EMPLOYEE_NOT_FOUND');
    }

    // 4) تحقّق وجود كل بوابة قبل المنح — نمنع منح بوابة غير موجودة (سلامة مرجعية على
    //    مستوى التطبيق، برسالة واضحة بدل خطأ قيد FK خام).
    for (const gateId of uniqueGateIds) {
      const gate = await this.gates.findById(gateId);
      if (!gate) {
        throw new NotFoundException('GATE_NOT_FOUND');
      }
    }

    // 5) اكتب الاستبدال الكامل (ذرّيّ في طبقة data)؛ لا نسجّل selfId في أي log.
    await this.gateAccess.setGatesForEmployee({
      selfId: input.selfId,
      gateIds: uniqueGateIds,
      assignedBy: input.actingUserId,
    });
  }
}
