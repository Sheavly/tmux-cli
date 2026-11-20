import { style } from '../../../viewer/row-render.ts';

const CODE = '\u001b[36m';
const HEADING = '\u001b[1;33m';
const FENCE = /^\s*(```|~~~)/;
const HEADING_ROW = /^#{1,6}\s/;
const INLINE = /`([^`\n]+)`|\*\*([^*\n]+)\*\*/g;

function styleInline(row: string): string {
  return row.replace(INLINE, (_whole, code: string | undefined, bold: string | undefined) =>
    code === undefined ? `${style.bold}${bold}${style.reset}` : `${CODE}${code}${style.reset}`,
  );
}

/**
 * Colours the parts of a model's reply that Markdown marks: headings, fenced code, `code` and
 * **bold**. It is a line-by-line approximation, not a parser: only the inline markers are dropped
 * (the colour replaces them), so a reply it misreads is still readable. The text must already be
 * free of escape sequences.
 */
export function styleMarkdown(text: string): string {
  let inFence = false;

  return text
    .split('\n')
    .map((row) => {
      if (FENCE.test(row)) {
        inFence = !inFence;

        return `${style.dim}${row}${style.reset}`;
      }

      if (inFence) return `${CODE}${row}${style.reset}`;

      if (HEADING_ROW.test(row)) return `${HEADING}${row}${style.reset}`;

      return styleInline(row);
    })
    .join('\n');
}
