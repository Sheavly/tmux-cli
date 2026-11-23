/** One frame of a server-sent event stream that has data: the `id` it carried and its `data`. */
export type SseFrame = { id: string | undefined; data: string };

/**
 * Cuts a server-sent event stream into frames as text arrives in pieces of any size. A frame ends
 * at an empty line (lines end in `\n` or `\r\n`); a line starting with `:` is a comment (the server's
 * heartbeat); several `data:` lines of one frame are joined with a newline. A frame without data
 * (the server's head frame, which a replaying client never gets) gives nothing.
 */
export function createSseParser(): { push: (text: string) => SseFrame[] } {
  let rest = '';
  let data: string[] = [];
  let id: string | undefined;

  function finishFrame(frames: SseFrame[]): void {
    if (data.length > 0) frames.push({ id, data: data.join('\n') });

    data = [];
    id = undefined;
  }

  function takeLine(line: string, frames: SseFrame[]): void {
    if (line === '') {
      finishFrame(frames);

      return;
    }

    if (line.startsWith(':')) return;

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');

    if (field === 'data') data.push(value);
    else if (field === 'id') id = value;
  }

  return {
    push(text) {
      const frames: SseFrame[] = [];
      const lines = (rest + text).split(/\r?\n/);

      // The last piece has no line end yet (a `\r` at its end may be half of a `\r\n`).
      rest = lines.pop() ?? '';

      for (const line of lines) takeLine(line, frames);

      return frames;
    },
  };
}
