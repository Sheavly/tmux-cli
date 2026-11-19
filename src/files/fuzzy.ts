const BOUNDARY = new Set(['/', '.', '_', '-', ' ']);

/**
 * How well `term` matches `text` as a subsequence (its letters in order, anywhere), or undefined
 * when it doesn't match. Higher is better: compact matches, letters that follow each other, and
 * letters that start a word or the file's name score more. Case is ignored.
 */
export function fuzzyScore(term: string, text: string): number | undefined {
  const whole = matchScore(term, text);
  const name = text.slice(text.lastIndexOf('/') + 1);

  if (name === text) return whole;

  // A term that fits inside the file's own name is what the user most likely means.
  const inName = matchScore(term, name);

  return inName === undefined ? whole : Math.max(whole ?? -Infinity, inName + NAME_BONUS);
}

const NAME_BONUS = 15;

function matchScore(term: string, text: string): number | undefined {
  const needle = Array.from(term.toLowerCase());
  const hay = Array.from(text.toLowerCase());

  if (needle.length === 0) return 0;

  // Forward to find where a match can end, then back to tighten it to the shortest window.
  let at = 0;

  for (const char of needle) {
    at = hay.indexOf(char, at);

    if (at === -1) return undefined;

    at += 1;
  }

  const end = at;
  let start = end;

  for (let index = needle.length - 1; index >= 0; index--) {
    start = hay.lastIndexOf(needle[index] as string, start - 1);
  }

  const nameStart = hay.lastIndexOf('/') + 1;
  let score = 0;
  let next = start;

  for (const char of needle) {
    const found = hay.indexOf(char, next);
    const previous = hay[found - 1];

    score += 10;

    if (found === next && found > start) score += 8;

    if (found === 0 || (previous !== undefined && BOUNDARY.has(previous))) score += 6;

    if (found >= nameStart) score += 2;

    next = found + 1;
  }

  // A match squeezed into a short window beats one spread across the path.
  return score - (end - start - needle.length) - start / 100;
}

/**
 * Every space-separated word of the query must match; the score is their sum. A query with no
 * words matches everything equally.
 */
export function queryScore(query: string, text: string): number | undefined {
  let total = 0;

  for (const term of query.split(/\s+/).filter((word) => word !== '')) {
    const score = fuzzyScore(term, text);

    if (score === undefined) return undefined;

    total += score;
  }

  return total;
}

/** The items that match the query, best first; ties keep their order. */
export function filterBy<T>(params: { items: T[]; query: string; text: (item: T) => string }): T[] {
  const { items, query, text } = params;

  if (query.trim() === '') return items;

  return items
    .map((item, index) => ({ item, index, score: queryScore(query, text(item)) }))
    .filter(
      (entry): entry is { item: T; index: number; score: number } => entry.score !== undefined,
    )
    .toSorted((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}
