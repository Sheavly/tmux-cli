import { loadConfig, type Config } from '../config/config.ts';
import { createAdapter } from '../harness/index.ts';
import { createSession } from '../session/session.ts';
import { createTmux } from '../tmux/tmux.ts';
import type { CliContext } from './cli.types.ts';
import { HELPER_COMMANDS } from './helper-commands.ts';
import { describeKeys } from './keys-command.ts';
import {
  copyCommand,
  escapeCommand,
  followCommand,
  linesCommand,
  loaderCommand,
  recapCommand,
  sidebarCommand,
} from './shell-commands.ts';
import { startSession } from './start-command.ts';
import { USAGE } from './usage.constants.ts';

const HELP_COMMANDS = ['help', '--help', '-h'];
const YES_FLAGS = ['--yes', '-y'];

/** Runs the command line: the commands that only print, then the helper commands, then a start. */
export async function main(argv: string[]): Promise<void> {
  const yes = argv.some((arg) => YES_FLAGS.includes(arg));
  const [command = 'start', ...args] = argv.filter((arg) => !YES_FLAGS.includes(arg));

  if (HELP_COMMANDS.includes(command)) {
    console.log(USAGE);

    return;
  }

  const config = loadConfig();

  if (command === 'keys') {
    console.log(describeKeys(config.keys));

    return;
  }

  const context = createContext({ config, args, yes });
  const helper = HELPER_COMMANDS.get(command);

  if (helper) {
    await helper(context);

    return;
  }

  await startSession({ command, context });
}

function createContext(params: { config: Config; args: string[]; yes: boolean }): CliContext {
  const { config, args, yes } = params;
  const tmux = createTmux({ socket: config.socket });
  const adapter = createAdapter({ name: config.adapter, settings: config.adapterSettings });
  const session = createSession({
    tmux,
    config,
    adapter,
    bindings: config.keys,
    sidebarCommand: sidebarCommand(),
    linesCommand: linesCommand(),
    copyCommand: copyCommand(),
    ...(adapter.promptText && adapter.clearPromptKeys ? { escapeCommand: escapeCommand() } : {}),
    loaderCommand: loaderCommand(),
    ...(adapter.recap ? { recapCommand: recapCommand() } : {}),
    ...(adapter.children ? { followCommand: followCommand() } : {}),
  });

  return { config, tmux, adapter, session, args, yes };
}
