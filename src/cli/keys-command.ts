import { createInterface } from 'node:readline/promises';
import type { Config } from '../config/config.ts';
import { keysAccepted } from '../keys/accept.ts';

/** Asks about keys left unbound, on the terminal (see `keysAccepted`). */
export function confirmKeys(params: { config: Config; yes: boolean }): Promise<boolean> {
  const { config, yes } = params;

  return keysAccepted({
    warnings: config.keyWarnings,
    acceptUnboundKeys: config.acceptUnboundKeys,
    yes,
    interactive: process.stdin.isTTY,
    tell: (line) => {
      console.error(line);
    },
    ask: async (question) => {
      const input = createInterface({ input: process.stdin, output: process.stderr });

      try {
        return await input.question(question);
      } finally {
        input.close();
      }
    },
  });
}

/** Every action with its keys: what `sheavly-tmux keys` prints. */
export function describeKeys(bindings: Config['keys']): string {
  const actions = bindings.list();
  const width = Math.max(...actions.map((action) => action.id.length));
  const lines = actions.map((action) => {
    const keys = action.keys.length > 0 ? action.keys.join(' ') : '(unbound)';
    const changed = action.keys.join(' ') === action.defaults.join(' ') ? '' : '  *';

    return `${action.id.padEnd(width)}  ${keys.padEnd(18)} ${action.description}${changed}`;
  });
  const note = bindings.copyMode
    ? ''
    : '\nOur copy-mode keys are off ("copyMode": false); tmux\'s own apply.';

  return `${lines.join('\n')}\n\n* differs from the default${note}`;
}
