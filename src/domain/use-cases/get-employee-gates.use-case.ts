import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '../auth/role';
import {
  EmployeeGateRow,
  GateAccessQueryRepository,
  GATE_ACCESS_QUERY_REPOSITORY,
} from '../repositories/gate-access-query.repository';
import {
  EmployeeRepository,
  EMPLOYEE_REPOSITORY,
} from '../repositories/employee.repository';

// الجلب يكشف صلاحيات دخول الموظف، فنقيّده بنفس أدوار المنح (المعلومة حسّاسة بالقدر نفسه).
const GATE_ASSIGN_ROLES: Role[] = ['super_admin', 'branch_head'];

export interface GetEmployeeGatesInput {
  actingRole: Role;
  selfId: string;
}

/**
 * جلب البوابات المصرّح بها لموظف (للوحة الإسناد). الدور يُعاد فحصه هنا (دفاع بالعمق)،
 * ووجود الموظف يُتحقّق منه أوّلاً لتمييز «موظف غير موجود» (خطأ) عن «موظف بلا منح»
 * (قائمة فارغة = حالة صحيحة).
 */
@Injectable()
export class GetEmployeeGatesUseCase {
  constructor(
    @Inject(GATE_ACCESS_QUERY_REPOSITORY)
    private readonly gateAccessQuery: GateAccessQueryRepository,
    @Inject(EMPLOYEE_REPOSITORY)
    private readonly employees: EmployeeRepository,
  ) {}

  async execute(input: GetEmployeeGatesInput): Promise<EmployeeGateRow[]> {
    // 1) فحص الدور (دفاع بالعمق فوق @Roles على المتحكّم).
    if (!GATE_ASSIGN_ROLES.includes(input.actingRole)) {
      throw new ForbiddenException('NOT_AUTHORIZED_TO_VIEW_GATES');
    }

    // 2) تحقّق وجود الموظف — يميّز الغياب (خطأ) عن غياب المنح ([] حالة صحيحة).
    const employee = await this.employees.findByEmployeeId(input.selfId);
    if (!employee) {
      throw new NotFoundException('EMPLOYEE_NOT_FOUND');
    }

    // 3) أعِد البوابات الممنوحة (قراءة فقط، حقول عرض آمنة).
    return this.gateAccessQuery.listGatesForEmployee(input.selfId);
  }
}
