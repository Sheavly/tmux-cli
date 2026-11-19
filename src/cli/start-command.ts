import { spawnSync } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Config } from '../config/config.ts';
import type { HarnessAdapter } from '../harness/adapter.types.ts';
import { readActiveProfile, stateFilePath } from '../profiles/active.ts';
import { MAIN_SESSION } from '../session/panes.ts';
import { queryBackground } from '../terminal/background.ts';
import { pickClipboardCommand, supportsTruecolor } from '../terminal/capabilities.utils.ts';
import { isOnPath } from '../terminal/executables.ts';
import type { TerminalLook } from '../terminal/terminal.types.ts';
import { tmuxVersionProblem } from '../tmux/tmux-version.utils.ts';
import type { CliContext } from './cli.types.ts';
import { confirmKeys } from './keys-command.ts';
import { USAGE } from './usage.constants.ts';

/** The commands that open the session and attach to it. */
const START_COMMANDS = ['start', 'new', 'open'];

/** Opens (or returns to) the session, opens the chat the command names, and attaches this terminal. */
export async function startSession(params: {
  command: string;
  context: CliContext;
}): Promise<void> {
  const { command, context } = params;
  const { config, session, yes } = context;

  if (!START_COMMANDS.includes(command)) {
    throw new Error(`Unknown command "${command}"\n\n${USAGE}`);
  }

  if (!(await confirmKeys({ config, yes }))) {
    process.exitCode = 1;

    return;
  }

  requireTmux();
  await session.ensure(terminalSize(), await lookOf());

  if (command === 'new') await openNew(context);
  else if (command === 'open') await openStored(context);

  attach(config);
}

/** Stops with a clear message when tmux is missing or too old, instead of failing halfway through a start. */
function requireTmux(): void {
  const result = spawnSync('tmux', ['-V'], { encoding: 'utf8' });

  if (result.error) throw new Error('tmux is not installed: sheavly-tmux runs inside it.');

  const problem = tmuxVersionProblem(result.stdout);

  if (problem) throw new Error(problem);
}

/** What the terminal we were started from can do: the CLI is the one process that can ask it. */
async function lookOf(): Promise<TerminalLook> {
  const background = await queryBackground();
  const clipboardCommand = pickClipboardCommand({
    env: process.env,
    platform: process.platform,
    exists: (program) => isOnPath(program, process.env),
  });

  return {
    ...(background ? { background } : {}),
    truecolor: supportsTruecolor(process.env),
    ...(clipboardCommand ? { clipboardCommand } : {}),
  };
}

function terminalSize(): { cols: number; rows: number } {
  return { cols: process.stdout.columns || 200, rows: process.stdout.rows || 50 };
}

async function openNew(context: CliContext): Promise<void> {
  const { adapter, session, args } = context;
  const workspace = await realpath(path.resolve(args[0] ?? process.cwd()));

  if (!(await stat(workspace)).isDirectory()) throw new Error(`Not a folder: ${workspace}`);

  const profile = await savedProfileOf(adapter);

  await session.openChat({ workspace, ...(profile ? { profile } : {}) });
}

async function openStored(context: CliContext): Promise<void> {
  const { adapter, session, args } = context;
  const id = args[0];

  if (!id || !adapter.isChatId(id)) throw new Error('Usage: sheavly-tmux open <conversation-id>');

  const { chats } = await adapter.listChats();
  const chat = chats.find((candidate) => candidate.id === id);

  if (!chat) throw new Error(`No stored chat ${id} under ${adapter.describeStore()}`);

  await session.openChat({
    workspace: chat.workspace,
    chatId: chat.id,
    ...(chat.profile ? { profile: chat.profile } : {}),
  });
}

/**
 * The profile the sidebar last showed, for a new chat started from the command line: the one
 * the user is working on. Only if the harness still has it; none, and so the harness's own
 * choice, when the adapter has no profiles or nothing was chosen yet.
 */
async function savedProfileOf(adapter: HarnessAdapter): Promise<string | undefined> {
  if (!adapter.listProfiles) return undefined;

  const saved = await readActiveProfile({ file: stateFilePath(), adapter: adapter.name });

  if (!saved) return undefined;

  return (await adapter.listProfiles()).some((profile) => profile.id === saved) ? saved : undefined;
}

/**
 * Attaches this terminal; inside another tmux it nests, so TMUX is dropped to allow that. `-u`
 * says the terminal does UTF-8 whatever the locale claims: without it a locale that is not UTF-8
 * (a bare ssh session, a container) makes tmux draw our box lines and arrows as underscores.
 */
function attach(config: Config): void {
  const { TMUX: _outer, ...env } = process.env;
  const result = spawnSync(
    'tmux',
    ['-u', '-L', config.socket, 'attach-session', '-t', MAIN_SESSION],
    { stdio: 'inherit', env },
  );

  if (result.error) throw new Error('Cannot run tmux', { cause: result.error });

  process.exitCode = result.status ?? 1;
}
