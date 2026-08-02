import { ClassValidatorEmployeeRowValidator } from './class-validator-employee-row.validator';

describe('ClassValidatorEmployeeRowValidator', () => {
  const v = new ClassValidatorEmployeeRowValidator();

  function ok(row: object) {
    return row as unknown;
  }

  // phone is REQUIRED on CreateEmployeeDto and is validated BEFORE fullName /
  // personnelType / optional fields (DTO declaration order), so every row carries a
  // valid phone; otherwise a missing-phone error would mask the field under test.
  const PHONE = '0955000000';

  it('accepts a valid row and returns cleaned data', () => {
    const res = v.validate(
      ok({ selfId: 'EMP-1', phone: PHONE, fullName: 'Sara Q', personnelType: 'civilian' }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.selfId).toBe('EMP-1');
      expect(res.data.fullName).toBe('Sara Q');
      expect(res.data.personnelType).toBe('civilian');
      expect(res.data.phone).toBe(PHONE);
    }
  });

  it('rejects an invalid self id', () => {
    const res = v.validate(
      ok({ selfId: '!!', phone: PHONE, fullName: 'X', personnelType: 'civilian' }),
    );
    expect(res).toEqual({ ok: false, code: 'INVALID_EMPLOYEE_ID' });
  });

  it('rejects a missing phone', () => {
    const res = v.validate(ok({ selfId: 'EMP-2', fullName: 'X', personnelType: 'civilian' }));
    expect(res).toEqual({ ok: false, code: 'INVALID_PHONE' });
  });

  it('rejects a missing full name', () => {
    const res = v.validate(ok({ selfId: 'EMP-2', phone: PHONE, personnelType: 'civilian' }));
    expect(res).toEqual({ ok: false, code: 'INVALID_FULL_NAME' });
  });

  it('rejects an invalid personnel type', () => {
    const res = v.validate(
      ok({ selfId: 'EMP-3', phone: PHONE, fullName: 'X', personnelType: 'alien' }),
    );
    expect(res).toEqual({ ok: false, code: 'INVALID_PERSONNEL_TYPE' });
  });

  it('rejects an invalid military id format', () => {
    const res = v.validate(
      ok({
        selfId: 'EMP-4',
        phone: PHONE,
        fullName: 'X',
        personnelType: 'military',
        militaryId: 'a',
      }),
    );
    expect(res).toEqual({ ok: false, code: 'INVALID_MILITARY_ID' });
  });

  it('rejects a too-long optional field', () => {
    const res = v.validate(
      ok({
        selfId: 'EMP-5',
        phone: PHONE,
        fullName: 'X',
        personnelType: 'civilian',
        commandDepartment: 'a'.repeat(201),
      }),
    );
    expect(res).toEqual({ ok: false, code: 'FIELD_TOO_LONG' });
  });

  it('rejects an unknown extra field (same strictness as single create)', () => {
    const res = v.validate(
      ok({ selfId: 'EMP-6', phone: PHONE, fullName: 'X', personnelType: 'civilian', hacker: 'x' }),
    );
    expect(res.ok).toBe(false);
  });
});
