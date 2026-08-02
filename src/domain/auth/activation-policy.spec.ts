import { canActivate } from './activation-policy';

describe('canActivate (activation hierarchy)', () => {
  it('lets Super Admin activate any role', () => {
    for (const target of [
      'branch_head',
      'supervisor',
      'guard',
      'permit_officer',
      'hr',
      'employee',
    ] as const) {
      expect(canActivate('super_admin', target)).toBe(true);
    }
  });

  it('lets a branch head activate supervisors, HR heads and everyone below', () => {
    expect(canActivate('branch_head', 'supervisor')).toBe(true);
    expect(canActivate('branch_head', 'guard')).toBe(true);
    expect(canActivate('branch_head', 'employee')).toBe(true);
    expect(canActivate('branch_head', 'hr_head')).toBe(true);
    // but not a peer branch head, a super admin, or a department manager
    expect(canActivate('branch_head', 'branch_head')).toBe(false);
    expect(canActivate('branch_head', 'super_admin')).toBe(false);
    expect(canActivate('branch_head', 'department_manager')).toBe(false);
  });

  it('lets a supervisor activate guards, permit officers and employees only', () => {
    expect(canActivate('supervisor', 'guard')).toBe(true);
    expect(canActivate('supervisor', 'permit_officer')).toBe(true);
    expect(canActivate('supervisor', 'employee')).toBe(true);
    expect(canActivate('supervisor', 'supervisor')).toBe(false);
    expect(canActivate('supervisor', 'branch_head')).toBe(false);
  });

  it('lets HR activate guards, permit officers and employees only', () => {
    expect(canActivate('hr', 'guard')).toBe(true);
    expect(canActivate('hr', 'employee')).toBe(true);
    expect(canActivate('hr', 'supervisor')).toBe(false);
  });

  it('does not let guards, permit officers or employees activate anyone', () => {
    expect(canActivate('guard', 'employee')).toBe(false);
    expect(canActivate('permit_officer', 'employee')).toBe(false);
    expect(canActivate('employee', 'employee')).toBe(false);
  });
});
