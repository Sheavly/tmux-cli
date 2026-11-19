import { isRemoteSession } from './capabilities.utils.ts';

const QUERY = '\u001b]11;?\u0007';
const TIMEOUT_MS = 300;
const REPLY = /\u001b\]11;rgba?:([0-9a-f]{1,4})\/([0-9a-f]{1,4})\/([0-9a-f]{1,4})/i;

/** `#rrggbb` from a terminal's answer to the background-colour query, or undefined if it isn't one. */
export function parseBackgroundReply(text: string): string | undefined {
  const match = REPLY.exec(text);

  if (!match) return undefined;

  return `#${[match[1], match[2], match[3]].map((part) => toByte(part as string)).join('')}`;
}

/** Components are 1 to 4 hex digits, each the same fraction of full scale. */
function toByte(part: string): string {
  const scale = 16 ** part.length - 1;
  const value = Math.round((Number.parseInt(part, 16) / scale) * 255);

  return value.toString(16).padStart(2, '0');
}

/**
 * Asks the terminal for its background colour (OSC 11), which is how the pane divider can be drawn
 * in the same colour and so disappear. Undefined when this isn't a terminal or it doesn't answer
 * in time; the caller then keeps tmux's visible divider.
 *
 * Not asked over ssh: an answer that is slower than the wait arrives after we stopped listening and
 * is then written on the screen as text, and the wait cannot be made long enough for every link.
 */
export async function queryBackground(): Promise<string | undefined> {
  const { stdin, stdout } = process;

  if (!stdin.isTTY || !stdout.isTTY) return undefined;

  if (isRemoteSession(process.env)) return undefined;

  stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  stdin.resume();

  try {
    return await new Promise<string | undefined>((resolve) => {
      let received = '';
      const finish = (): void => {
        clearTimeout(timer);
        stdin.off('data', onData);
        resolve(parseBackgroundReply(received));
      };
      const onData = (chunk: string): void => {
        received += chunk;

        if (parseBackgroundReply(received)) finish();
      };
      const timer = setTimeout(finish, TIMEOUT_MS);

      stdin.on('data', onData);
      stdout.write(QUERY);
    });
  } finally {
    stdin.pause();
    stdin.setRawMode(false);
  }
}
