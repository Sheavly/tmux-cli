/** Text for a terminal that keeps its line breaks and tabs and loses every other control character. */
export function cleanText(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '');
}

/** A label is shown on a terminal: control characters (escape sequences) are not allowed in it. */
export function cleanLabel(text: string): string {
  return text
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
