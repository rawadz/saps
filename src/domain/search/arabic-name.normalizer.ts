/**
 * Pure Arabic name normalization for search — no framework, no I/O.
 *
 * Employee full names are stored plaintext, but operators type them with wildly
 * varying orthography: hamza seats (alef variants), taa-marbuta vs haa, alef-maqsura
 * vs yaa, tatweel, and optional harakat. A raw `ILIKE '%q%'` folds none of these, so
 * a correctly-spelled query misses. We normalize BOTH the stored name (on write, into
 * `full_name_normalized`) and the query tokens with the SAME function here, so they
 * compare on equal footing.
 *
 * Every rule is deterministic and idempotent: normalize(normalize(x)) === normalize(x).
 * All Arabic code points are \u escapes on purpose — literal combining marks in source
 * are invisible and easy to corrupt, and a mis-typed range could strip base letters.
 */

// Combining marks ONLY: U+0610-U+061A (signs), U+064B-U+065F (harakat), U+0670
// (superscript alef), U+06D6-U+06ED (Quranic marks). The gaps skip the base-letter
// block U+0621-U+064A so LETTERS are never removed.
const HARAKAT = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g; // kashida elongation
const ALEF_SEATS = /[آأإٱ]/g; // آ أ إ ٱ -> ا

/** Fold Arabic orthographic variants + diacritics to a canonical, lowercased form. */
export function normalizeArabicName(input: string): string {
  if (!input) return '';
  return input
    .normalize('NFKC')
    .replace(TATWEEL, '')
    .replace(HARAKAT, '')
    .replace(ALEF_SEATS, 'ا') // -> bare alef
    .replace(/ى/g, 'ي') // alef-maqsura -> yaa
    .replace(/ة/g, 'ه') // taa-marbuta -> haa
    .replace(/ؤ/g, 'و') // waw-hamza -> waw
    .replace(/ئ/g, 'ي') // yaa-hamza -> yaa
    .replace(/\s+/g, ' ') // collapse interior whitespace
    .trim()
    .toLowerCase(); // folds Latin letters in mixed/transliterated names; no-op for Arabic
}

/**
 * normalizeArabicName + split on whitespace -> deduped, non-empty tokens.
 * Order-free: the caller ANDs the tokens as substrings, so word order and spacing
 * no longer matter. Capped so a pathological query can't explode the predicate.
 */
export function tokenizeName(input: string): string[] {
  const normalized = normalizeArabicName(input);
  if (!normalized) return [];
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const t of normalized.split(' ')) {
    if (t && !seen.has(t)) {
      seen.add(t);
      tokens.push(t);
      if (tokens.length >= 10) break;
    }
  }
  return tokens;
}
