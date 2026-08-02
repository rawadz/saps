import { buildEmployeeWhere, NEVER_MATCH_HASH } from './employee-where.builder';

// Fake, deterministic hash so we can assert the exact id predicate.
const fakeHash = (v: string): string => `H:${v}`;

describe('buildEmployeeWhere', () => {
  it('returns no OR when there is no query', () => {
    const where = buildEmployeeWhere({}, fakeHash);
    expect(where.OR).toBeUndefined();
  });

  it('maps the status buckets to column predicates', () => {
    expect(buildEmployeeWhere({ status: 'banned' }, fakeHash)).toMatchObject({
      isEntryBlocked: true,
    });
    expect(buildEmployeeWhere({ status: 'active' }, fakeHash)).toMatchObject({
      isEntryBlocked: false,
      status: 'active',
    });
    expect(buildEmployeeWhere({ status: 'inactive' }, fakeHash)).toMatchObject({
      isEntryBlocked: false,
      status: { not: 'active' },
    });
  });

  it('builds an AND of normalized tokens for a multi-word (triple) name', () => {
    // Word order differs from any stored order; tokens are ANDed so it still matches.
    const where = buildEmployeeWhere({ nameQuery: 'علي أحمد' }, fakeHash);
    expect(where.OR).toHaveLength(1);
    const nameBranch = where.OR![0] as { AND: unknown[] };
    expect(nameBranch.AND).toEqual([
      { fullNameNormalized: { contains: 'علي' } },
      { fullNameNormalized: { contains: 'احمد' } }, // alef folded
    ]);
  });

  it('does NOT add an id branch for an Arabic term', () => {
    const where = buildEmployeeWhere({ nameQuery: 'محمد' }, fakeHash);
    expect(where.OR).toHaveLength(1); // name branch only
    expect(JSON.stringify(where.OR)).not.toContain('selfIdSearchHash');
  });

  it('adds an EXACT id branch (raw term) for an ID-shaped term, plus the name branch', () => {
    const where = buildEmployeeWhere({ nameQuery: 'EMP-20001' }, fakeHash);
    expect(where.OR).toEqual([
      { AND: [{ fullNameNormalized: { contains: 'emp-20001' } }] }, // lowercased name token
      { selfIdSearchHash: 'H:EMP-20001' }, // raw, case-preserved, exact
    ]);
  });

  it('does not add an id branch for a non-ID-shaped term (too short / spaces)', () => {
    expect(JSON.stringify(buildEmployeeWhere({ nameQuery: 'ab' }, fakeHash).OR)).not.toContain(
      'selfIdSearchHash',
    );
    expect(
      JSON.stringify(buildEmployeeWhere({ nameQuery: 'a b c' }, fakeHash).OR),
    ).not.toContain('H:');
  });

  it('combines a status filter with the search OR', () => {
    const where = buildEmployeeWhere({ status: 'active', nameQuery: 'علي' }, fakeHash);
    expect(where.isEntryBlocked).toBe(false);
    expect(where.status).toBe('active');
    expect(where.OR).toBeDefined();
  });

  it('matches nothing for a non-empty but unmatchable term', () => {
    // Pure combining marks normalize to '' → no tokens, not ID-shaped → sentinel.
    const where = buildEmployeeWhere({ nameQuery: 'ًٌٍ' }, fakeHash);
    expect(where.OR).toEqual([{ selfIdSearchHash: NEVER_MATCH_HASH }]);
  });
});
