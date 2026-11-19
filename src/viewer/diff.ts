/** What a `git diff -U0` says about a file, in terms of the file as it is now. */
export type FileDiff = {
  /** Line numbers (1-based) that were added or changed. */
  added: Set<number>;
  /** Lines that were removed, keyed by the line number they sat in front of. */
  removed: Map<number, string[]>;
};

export type ViewRow =
  | { kind: 'line'; number: number; text: string; added: boolean }
  | { kind: 'removed'; text: string };

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function emptyDiff(): FileDiff {
  return { added: new Set(), removed: new Map() };
}

/** Reads a zero-context unified diff of one file. */
export function parseDiff(text: string): FileDiff {
  const diff = emptyDiff();
  let inHunk = false;
  let next = 0;

  for (const line of text.split('\n')) {
    const header = HUNK.exec(line);

    if (header) {
      const start = Number(header[3]);
      const count = header[4] === undefined ? 1 : Number(header[4]);

      // A hunk that adds nothing names the line before the spot, so the removal sits after it.
      next = count === 0 ? start + 1 : start;
      inHunk = true;
      continue;
    }

    if (!inHunk) continue;

    if (line.startsWith('+')) diff.added.add(next++);
    else if (line.startsWith('-')) {
      const lines = diff.removed.get(next) ?? [];

      lines.push(line.slice(1));
      diff.removed.set(next, lines);
    }
  }

  return diff;
}

/** A diff that calls every line added, for a file git does not know yet. */
export function allAdded(lineCount: number): FileDiff {
  const diff = emptyDiff();

  for (let number = 1; number <= lineCount; number++) diff.added.add(number);

  return diff;
}

/** The file's lines with the removed ones put back in where they were. */
export function buildRows(params: { lines: string[]; diff: FileDiff }): ViewRow[] {
  const { lines, diff } = params;
  const rows: ViewRow[] = [];

  lines.forEach((text, index) => {
    const number = index + 1;

    for (const removed of diff.removed.get(number) ?? []) {
      rows.push({ kind: 'removed', text: removed });
    }

    rows.push({ kind: 'line', number, text, added: diff.added.has(number) });
  });

  // Removals past the last line.
  for (const removed of diff.removed.get(lines.length + 1) ?? []) {
    rows.push({ kind: 'removed', text: removed });
  }

  return rows;
}

/** Where each run of changed rows starts, to jump between them. */
export function changeStarts(rows: ViewRow[]): number[] {
  const starts: number[] = [];

  rows.forEach((row, index) => {
    const changed = row.kind === 'removed' || row.added;
    const before = rows[index - 1];
    const previousChanged = before !== undefined && (before.kind === 'removed' || before.added);

    if (changed && !previousChanged) starts.push(index);
  });

  return starts;
}

/** Tabs become spaces and control characters (escape sequences) are dropped. */
export function cleanText(text: string): string {
  return text.replaceAll('\t', '    ').replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
}
