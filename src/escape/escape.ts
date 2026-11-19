import type { Tmux } from '../tmux/tmux.ts';
import { cleanText } from '../viewer/diff.ts';
import { stripEscapes } from '../terminal/ansi.ts';

/** How long a first Esc waits for a second one. */
const DOUBLE_ESC_MS = 400;

/** The pane option that holds when the Esc still waiting for a second one was pressed. */
const PENDING_OPTION = '@sheavly_esc';

/**
 * What Esc does in a chat. With nothing typed (or when the harness can't say) it goes straight to
 * the chat. With text in the prompt the first Esc waits `windowMs`: a second one in that time
 * clears the prompt and neither reaches the chat; without one the waiting Esc is sent after all.
 *
 * Each key press is its own process (`run-shell -b`), so the first one sleeps and the second one
 * finds the time of the first in a pane option and takes it away, which tells the first not to send.
 */
export async function runEscape(params: {
  tmux: Tmux;
  pane: string;
  /** From the harness adapter: what is typed in the input box, undefined when it can't tell. */
  promptText?: ((rows: readonly string[]) => string | undefined) | undefined;
  /** From the harness adapter: the keys that empty a prompt holding this text. */
  clearPromptKeys?: ((text: string) => string[]) | undefined;
  windowMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<void> {
  const {
    tmux,
    pane,
    windowMs = DOUBLE_ESC_MS,
    now = Date.now,
    sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  } = params;
  const sendEscape = (): Promise<string> => tmux.run(['send-keys', '-t', pane, 'Escape']);

  try {
    const text = await typedText({ ...params, tmux });

    if (text === undefined || text === '' || !params.clearPromptKeys) {
      await sendEscape();

      return;
    }

    const pending = Number(
      (await tmux.run(['show-options', '-pqv', '-t', pane, PENDING_OPTION])).trim(),
    );
    const at = now();

    if (pending > 0 && at - pending < windowMs) {
      await tmux.run(['set-option', '-pu', '-t', pane, PENDING_OPTION]);
      await tmux.run(['send-keys', '-t', pane, ...params.clearPromptKeys(text)]);

      return;
    }

    await tmux.run(['set-option', '-p', '-t', pane, PENDING_OPTION, String(at)]);
    await sleep(windowMs);

    const still = (await tmux.run(['show-options', '-pqv', '-t', pane, PENDING_OPTION])).trim();

    if (still !== String(at)) return;

    await tmux.run(['set-option', '-pu', '-t', pane, PENDING_OPTION]);
    await sendEscape();
  } catch {
    // The key must not be lost because the screen could not be read; a gone pane fails here too.
    await sendEscape().catch(() => '');
  }
}

async function typedText(params: {
  tmux: Tmux;
  pane: string;
  promptText?: ((rows: readonly string[]) => string | undefined) | undefined;
}): Promise<string | undefined> {
  if (!params.promptText) return undefined;

  const screen = await params.tmux.run(['capture-pane', '-p', '-t', params.pane]);
  const rows = screen.split('\n').map((row) => cleanText(stripEscapes(row)));

  return params.promptText(rows);
}
