import { copyAtNewest, runLines } from '../chat-lines/lines.ts';
import { runEscape } from '../escape/escape.ts';
import { runFollow } from '../follow/follow.ts';
import { runLoader } from '../loader/loader.ts';
import { recapText } from '../recap/recap.ts';
import { MAIN_SESSION } from '../session/panes.ts';
import { runSidebar } from '../sidebar/sidebar.ts';
import { tmuxSucceeds } from '../tmux/tmux.ts';
import { runViewer } from '../viewer/viewer.ts';
import type { CliContext } from './cli.types.ts';
import { viewCommand } from './shell-commands.ts';

type Command = (context: CliContext) => Promise<void>;

/** The first argument, or a usage error: these commands are run by tmux with what they need. */
function required(params: { args: string[]; usage: string }): string {
  const [first] = params.args;

  if (!first) throw new Error(`Usage: sheavly-tmux ${params.usage}`);

  return first;
}

/** Runs in front of a chat that is starting: whatever goes wrong, the chat must still start. */
async function recap(context: CliContext): Promise<void> {
  const chatId = required({ args: context.args, usage: 'recap <conversation id>' });

  try {
    process.stdout.write(await recapText({ adapter: context.adapter, chatId }));
  } catch (caughtError) {
    const reason = caughtError instanceof Error ? caughtError.message : String(caughtError);

    console.error(`(no recap: ${reason})`);
  }
}

/** The pane of a child of a chat: both ids are checked before the adapter sees them. */
async function follow(context: CliContext): Promise<void> {
  const [chatId, childId] = context.args;

  if (!chatId || !childId || !context.adapter.isChatId(chatId)) {
    throw new Error('Usage: sheavly-tmux follow <conversation id> <child id>');
  }

  await runFollow({ adapter: context.adapter, chatId, childId });
}

/** Best effort, in the background of a starting chat: it must never get in the chat's way. */
async function loader(context: CliContext): Promise<void> {
  try {
    await runLoader({ tmux: context.tmux, pane: process.env.TMUX_PANE ?? '' });
  } catch {
    // Nothing to report to: the pane belongs to the chat.
  }
}

async function sidebar(context: CliContext): Promise<void> {
  const { adapter, session, tmux, config } = context;

  await runSidebar({
    adapter,
    session,
    tmux,
    viewCommand,
    bindings: config.keys,
    chatOrder: config.chatOrder,
    mouse: config.mouse,
  });
}

async function lines(context: CliContext): Promise<void> {
  const { adapter, tmux, config, args } = context;

  await runLines({
    tmux,
    pane: args[0] ?? '',
    bindings: config.keys,
    mouse: config.mouse,
    ...(adapter.chromeRows ? { chromeRows: adapter.chromeRows } : {}),
  });
}

async function copy(context: CliContext): Promise<void> {
  const pane = required({ args: context.args, usage: 'copy <pane id>' });

  await copyAtNewest({ tmux: context.tmux, pane, chromeRows: context.adapter.chromeRows });
}

async function escape(context: CliContext): Promise<void> {
  const pane = required({ args: context.args, usage: 'escape <pane id>' });
  const { tmux, adapter } = context;

  await runEscape({
    tmux,
    pane,
    promptText: adapter.promptText,
    clearPromptKeys: adapter.clearPromptKeys,
  });
}

async function view(context: CliContext): Promise<void> {
  const file = required({ args: context.args, usage: 'view <file>' });

  await runViewer({ file, bindings: context.config.keys, mouse: context.config.mouse });
}

async function stop(context: CliContext): Promise<void> {
  const { tmux, session } = context;

  if (!(await tmuxSucceeds(tmux, ['has-session', '-t', `=${MAIN_SESSION}`]))) {
    console.log('No session is running.');

    return;
  }

  await session.stop();
}

/**
 * The commands that do one thing and leave: `stop`, and the ones tmux runs for our keys and panes
 * (`sidebar`, `lines`, `copy`, `escape`, `view`, `recap`, `follow`, `loader`). A map, so a name that is no
 * command (`constructor`) is none.
 */
export const HELPER_COMMANDS: ReadonlyMap<string, Command> = new Map<string, Command>([
  ['recap', recap],
  ['follow', follow],
  ['loader', loader],
  ['sidebar', sidebar],
  ['lines', lines],
  ['copy', copy],
  ['escape', escape],
  ['view', view],
  ['stop', stop],
]);
