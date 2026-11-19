/** One message of a chat's last stretch, for adapters that can only read the transcript. */
export type RecapMessage = {
  role: 'user' | 'assistant';
  /** Plain text, no escape sequences; may be empty for an assistant that only called tools. */
  text: string;
  /** How many tool calls the assistant made along with it (or after it, before the next message). */
  toolCalls: number;
};

const MAX_RECAP_LINES = 14;

const BOLD = '\u001b[1m';
const DIM = '\u001b[2m';
const CYAN = '\u001b[36m';
const RESET = '\u001b[0m';

/** Puts what a recap shows between a heading and the line that says the chat is starting. */
export function frameRecap(body: string): string {
  return `${DIM}── where this chat left off ──${RESET}\n\n${body.trimEnd()}\n\n${DIM}── resuming ──${RESET}\n\n`;
}

/** What the user wrote, marked like a prompt, and cut to its first lines when it is long. */
export function formatUserMessage(text: string): string {
  const lines = text.split('\n');
  const shown = lines.slice(0, MAX_RECAP_LINES);

  if (lines.length > MAX_RECAP_LINES) {
    shown.push(`${DIM}… ${lines.length - MAX_RECAP_LINES} more lines${RESET}`);
  }

  return shown
    .map((line, index) => (index === 0 ? `${BOLD}${CYAN}›${RESET} ${line}` : `  ${line}`))
    .join('\n');
}

/**
 * Messages as plain text: the fallback when a harness's own rendering can't be had. A long
 * message is cut to its start if the user wrote it and to its end if the assistant did, because
 * the end of an answer is where things were left.
 */
export function formatRecap(messages: readonly RecapMessage[]): string {
  if (messages.length === 0) return '';

  return frameRecap(messages.map(formatMessage).join('\n\n'));
}

function formatMessage(message: RecapMessage): string {
  const name = message.role === 'user' ? `${BOLD}${CYAN}you${RESET}` : `${BOLD}assistant${RESET}`;
  const lines: string[] = [name];

  if (message.text !== '') lines.push(...cut(message));

  if (message.toolCalls > 0) {
    lines.push(
      `${DIM}· ${message.toolCalls} tool call${message.toolCalls === 1 ? '' : 's'}${RESET}`,
    );
  }

  return lines.join('\n');
}

function cut(message: RecapMessage): string[] {
  const lines = message.text.split('\n');

  if (lines.length <= MAX_RECAP_LINES) return lines;

  const hidden = `${DIM}… ${lines.length - MAX_RECAP_LINES} more lines${RESET}`;

  return message.role === 'user'
    ? [...lines.slice(0, MAX_RECAP_LINES), hidden]
    : [hidden, ...lines.slice(-MAX_RECAP_LINES)];
}
