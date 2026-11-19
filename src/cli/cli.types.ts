import type { Config } from '../config/config.ts';
import type { HarnessAdapter } from '../harness/adapter.types.ts';
import type { Session } from '../session/session.ts';
import type { Tmux } from '../tmux/tmux.ts';

/** What a command runs with: the config, the harness and tmux it talks to, and its own arguments. */
export type CliContext = {
  config: Config;
  tmux: Tmux;
  adapter: HarnessAdapter;
  session: Session;
  /** The arguments after the command, without the flags. */
  args: string[];
  /** `--yes`: the warnings about keys left unbound are accepted. */
  yes: boolean;
};
