import { LOADING_OPTION, MAIN_SESSION } from '../session/panes.ts';
import type { Tmux } from '../tmux/tmux.ts';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const LABEL = 'Loading chat…';
const FRAME_MS = 100;
const GIVE_UP_MS = 120_000;

/**
 * Shows a spinner in the status line until the program started in `pane` has written something.
 * Runs in the background of the pane's shell command, so the chat itself is untouched. The spinner
 * is a tmux option the status line prints, and never text in the pane: a chat that replays a long
 * history scrolls the screen, and text written there would scroll into the history and stay.
 * "Something was written" means the pane shows anything but what it showed when the loader began.
 * The spinner is only up while the pane is the one on screen.
 */
export async function runLoader(params: { tmux: Tmux; pane: string }): Promise<void> {
  const { tmux, pane } = params;
  const parent = process.ppid;
  const started = Date.now();
  const clients = (await tmux.run(['list-clients', '-F', '#{client_name}']))
    .split('\n')
    .filter((name) => name !== '');
  const baseline = await snapshot(tmux, pane);
  let shown = false;
  let frame = 0;

  /** The status line only redraws on its interval, or when a client is told to. */
  async function setStatus(text: string): Promise<void> {
    await tmux.run(['set-option', '-g', LOADING_OPTION, text]);

    for (const client of clients) {
      await tmux.run(['refresh-client', '-S', '-t', client]).catch(() => undefined);
    }
  }

  async function clearStatus(): Promise<void> {
    if (!shown) return;

    shown = false;
    await setStatus('');
  }

  // A pane that is closed takes the loader with it; the status must not keep the spinner.
  for (const signal of ['SIGHUP', 'SIGTERM'] as const) {
    process.once(signal, () => void clearStatus().finally(() => process.exit(0)));
  }

  try {
    while (process.ppid === parent && Date.now() - started < GIVE_UP_MS) {
      if ((await snapshot(tmux, pane)) !== baseline) break;

      if (await isOnScreen(tmux, pane)) {
        shown = true;
        await setStatus(` ${FRAMES[frame++ % FRAMES.length]} ${LABEL} `);
      } else {
        await clearStatus();
      }

      await new Promise((resolve) => setTimeout(resolve, FRAME_MS));
    }
  } finally {
    await clearStatus();
  }
}

async function snapshot(tmux: Tmux, pane: string): Promise<string> {
  const text = await tmux.run(['capture-pane', '-p', '-t', pane]);

  return text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');
}

/** A chat opened and then left for another is parked: its loader has nothing to show. */
async function isOnScreen(tmux: Tmux, pane: string): Promise<boolean> {
  const session = await tmux.run(['display-message', '-p', '-t', pane, '#{session_name}']);

  return session.trim() === MAIN_SESSION;
}
