import { normalizeArabicName, tokenizeName } from './arabic-name.normalizer';

describe('normalizeArabicName', () => {
  it('folds every alef seat to a bare alef', () => {
    const bare = normalizeArabicName('احمد');
    expect(bare).toBe('احمد');
    for (const variant of ['أحمد', 'إحمد', 'آحمد', 'ٱحمد']) {
      expect(normalizeArabicName(variant)).toBe(bare);
    }
  });

  it('folds taa-marbuta to haa and alef-maqsura to yaa', () => {
    expect(normalizeArabicName('فاطمة')).toBe(normalizeArabicName('فاطمه'));
    expect(normalizeArabicName('يحيى')).toBe(normalizeArabicName('يحيي'));
  });

  it('removes tatweel and harakat WITHOUT removing base letters', () => {
    // The critical guard: a buggy combining-mark range would strip letters too.
    expect(normalizeArabicName('محمد')).toBe('محمد'); // 4 letters survive untouched
    expect(normalizeArabicName('مُحَمَّد')).toBe('محمد'); // harakat stripped, letters kept
    expect(normalizeArabicName('محـمـد')).toBe('محمد'); // tatweel stripped
    expect(normalizeArabicName('محمد')).toHaveLength(4);
  });

  it('collapses interior whitespace and trims', () => {
    expect(normalizeArabicName('  علي   حسن  ')).toBe('علي حسن');
  });

  it('lowercases Latin (transliterated names)', () => {
    expect(normalizeArabicName('Ali')).toBe('ali');
  });

  it('is idempotent', () => {
    for (const s of ['أحمد محمد علي', 'مُحَمَّد', '  Ali  BEN  ', 'يحيى']) {
      const once = normalizeArabicName(s);
      expect(normalizeArabicName(once)).toBe(once);
    }
  });

  it('handles empty / whitespace input', () => {
    expect(normalizeArabicName('')).toBe('');
    expect(normalizeArabicName('   ')).toBe('');
  });
});

describe('tokenizeName', () => {
  it('splits a name into order-free normalized tokens', () => {
    expect(tokenizeName('  علي   حسن  محمد ')).toEqual(['علي', 'حسن', 'محمد']);
  });

  it('normalizes each token', () => {
    expect(tokenizeName('أحمد آل علي')).toEqual(['احمد', 'ال', 'علي']);
  });

  it('dedupes repeated tokens', () => {
    expect(tokenizeName('محمد محمد')).toEqual(['محمد']);
  });

  it('returns [] for empty / whitespace', () => {
    expect(tokenizeName('')).toEqual([]);
    expect(tokenizeName('   ')).toEqual([]);
  });

  it('caps at 10 tokens', () => {
    const many = Array.from({ length: 20 }, (_, i) => `t${i}`).join(' ');
    expect(tokenizeName(many)).toHaveLength(10);
  });
});
