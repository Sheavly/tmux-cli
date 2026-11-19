/**
 * Keys that were taken off things the user may need (leaving, opening a chat) are a way to get
 * stuck, so a start says so and waits for a yes. `acceptUnboundKeys` in the config, or `--yes`,
 * says it was meant; without a terminal to ask on, a start that is not accepted does not go on.
 *
 * What it needs from outside is passed in, so that it can be tried without a terminal.
 */
export async function keysAccepted(params: {
  warnings: string[];
  /** The config says the warnings were meant. */
  acceptUnboundKeys: boolean;
  /** `--yes` was given. */
  yes: boolean;
  /** Whether there is a terminal to ask on. */
  interactive: boolean;
  /** Asks a question and gives the answer. */
  ask: (question: string) => Promise<string>;
  /** Says something to the user. */
  tell: (line: string) => void;
}): Promise<boolean> {
  const { warnings, acceptUnboundKeys, yes, interactive, ask, tell } = params;

  if (warnings.length === 0 || acceptUnboundKeys) return true;

  tell('Some keys are not bound:');

  for (const warning of warnings) tell(`  - ${warning}`);

  if (yes) return true;

  if (!interactive) {
    throw new Error('Pass --yes, or set "acceptUnboundKeys": true in the config, to start anyway.');
  }

  return /^y(es)?$/i.test((await ask('Start anyway? [y/N] ')).trim());
}
