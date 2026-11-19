import { fileURLToPath } from 'node:url';

/** The program tmux runs for each of our keys and panes is this same CLI, with a command. */
const CLI_SCRIPT = fileURLToPath(new URL('../cli.ts', import.meta.url));

/** A failure would close a popup before it could be read, so wait for a key. */
const WAIT_FOR_KEY = "|| { printf '\\nPress enter to close.'; read -r _; }";

function shell(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function cliCommand(subcommand: string): string {
  return `${shell(process.execPath)} ${shell(CLI_SCRIPT)} ${subcommand}`;
}

export function sidebarCommand(): string[] {
  const run = `${cliCommand('sidebar')}; status=$?; printf '\\nsidebar exited (%s). Press enter to close.' "$status"; read -r _`;

  return ['sh', '-c', run];
}

/** The shell command that shows a file in the viewer (run by tmux in a popup). */
export function viewCommand(file: string): string {
  return `${cliCommand(`view ${shell(file)}`)} ${WAIT_FOR_KEY}`;
}

/** The shell command the numbered-lines key runs: the lines of the chat that had the keyboard. */
export function linesCommand(): string {
  return `${cliCommand('lines')} ${WAIT_FOR_KEY}`;
}

/** The shell command the copy-at-newest key runs, given the chat's pane id: copy mode at the newest line. */
export function copyCommand(): string {
  return cliCommand('copy');
}

/** The shell command Esc runs in a chat, given its pane id: a second Esc clears the prompt. */
export function escapeCommand(): string {
  return cliCommand('escape');
}

/** The shell command that prints a stored chat's last messages; the chat id is added to it. */
export function recapCommand(): string {
  return cliCommand('recap');
}

/** The shell command that draws a spinner in its pane until the chat starting there has written. */
export function loaderCommand(): string {
  return cliCommand('loader');
}
