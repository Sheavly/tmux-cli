import type { Tmux } from '../tmux/tmux.ts';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const LABEL = 'Loading chat…';
const FRAME_MS = 100;
const GIVE_UP_MS = 120_000;

/**
 * Draws a spinner in the middle of the pane it runs in, until the program started beside it has
 * written something. Runs in the background of the pane's shell command, so the chat itself is
 * untouched: the spinner is drawn with the cursor saved and restored, and "something was written"
 * means the pane shows anything but what it showed when the loader began (not counting the
 * spinner's own row).
 */
export async function runLoader(params: { tmux: Tmux; pane: string }): Promise<void> {
  const { tmux, pane } = params;
  const parent = process.ppid;
  const started = Date.now();
  const out = (text: string) => process.stdout.write(text);

  /** The screen as rows, with the spinner's row left out so it never counts as a change. */
  async function snapshot(spinnerRow: number): Promise<string> {
    const text = await tmux.run(['capture-pane', '-p', '-t', pane]);

    return text
      .split('\n')
      .map((line, index) => (index === spinnerRow ? '' : line.trimEnd()))
      .join('\n');
  }

  const rowOf = () => Math.max(0, Math.floor((process.stdout.rows || 24) / 2));
  const row = rowOf();
  const baseline = await snapshot(row);
  let frame = 0;

  while (process.ppid === parent && Date.now() - started < GIVE_UP_MS) {
    const columns = process.stdout.columns || 80;
    const text = `${FRAMES[frame++ % FRAMES.length]} ${LABEL}`;
    const column = Math.max(1, Math.floor((columns - text.length) / 2) + 1);

    // Checked before drawing, so a chat that already wrote never gets the spinner over it.
    if ((await snapshot(row)) !== baseline) break;

    out(`\x1b7\x1b[${row + 1};${column}H${text}\x1b8`);
    await new Promise((resolve) => setTimeout(resolve, FRAME_MS));
  }

  // On the normal screen the spinner is wiped; on the alternate one the chat has taken over.
  const alternate = (
    await tmux.run(['display-message', '-p', '-t', pane, '#{alternate_on}'])
  ).trim();

  if (alternate !== '1') out(`\x1b7\x1b[${row + 1};1H\x1b[2K\x1b8`);
}
