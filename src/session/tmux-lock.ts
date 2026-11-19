import type { Tmux } from '../tmux/tmux.ts';

/** Where the person's own prefix keys are kept while the session has them switched off. */
const SAVED_PREFIX = '@sheavly_saved_prefix';
const SAVED_PREFIX2 = '@sheavly_saved_prefix2';

/** What a mouse binding of tmux's can do to the layout: menus, splits, new windows, swaps, kills. */
const LAYOUT_COMMAND =
  /\b(?:new-window|new-pane|split-window|break-pane|join-pane|swap-pane|kill-pane|kill-window|display-menu)\b/;
/** A mouse event as a key name: `MouseDown3Pane`, `M-MouseDown3Status`, `DoubleClick1Status`. */
const MOUSE_KEY = /^(?:[CMS]-)*(?:Mouse|Double|Triple|Second)/;
/** A line of `list-keys -T root`: `bind-key [-r] -T root <key> <command>`. */
const ROOT_BINDING = /^bind-key\s+(?:-r\s+)?-T\s+root\s+(\S+)\s+(.*)$/;

/**
 * Switches tmux's own keys and mouse menus off in the session, or back on. The session is the
 * sidebar and one pane beside it, and tmux's defaults can break that: `C-b c` opens a window, `C-b %`
 * splits a pane, a right click offers the same in a menu, and `C-b x` kills a pane we are running.
 * What the session does is done with our own keys, so these are of no use there.
 *
 * Listing the keys to block would not keep up with tmux (each release adds some), so the prefix is
 * switched off whole, which leaves every binding of its table out of reach, and only the mouse
 * bindings that change the layout are unbound.
 */
export async function applyTmuxLock(params: { tmux: Tmux; locked: boolean }): Promise<void> {
  if (params.locked) await lock(params.tmux);
  else await unlock(params.tmux);
}

async function option({ tmux, name }: { tmux: Tmux; name: string }): Promise<string> {
  return (await tmux.run(['show-options', '-gqv', name])).trim();
}

async function lock(tmux: Tmux): Promise<void> {
  // The person's own prefix is written down once, the first time: a start that finds the keys
  // already switched off must not take "None" for what they had.
  if ((await option({ tmux, name: SAVED_PREFIX })) === '') {
    await tmux.run(['set-option', '-g', SAVED_PREFIX, await option({ tmux, name: 'prefix' })]);
    await tmux.run(['set-option', '-g', SAVED_PREFIX2, await option({ tmux, name: 'prefix2' })]);
  }

  await tmux.run(['set-option', '-g', 'prefix', 'None']);
  await tmux.run(['set-option', '-g', 'prefix2', 'None']);
  await unbindLayoutMouseKeys(tmux);
}

/**
 * Gives the person's prefix back. The mouse bindings stay unbound: tmux cannot restore its defaults
 * for them, which a stop and a start does.
 */
async function unlock(tmux: Tmux): Promise<void> {
  const prefix = await option({ tmux, name: SAVED_PREFIX });

  // Never locked by us, so the prefix is the person's own.
  if (prefix === '') return;

  await tmux.run(['set-option', '-g', 'prefix', prefix]);
  await tmux.run(['set-option', '-g', 'prefix2', await option({ tmux, name: SAVED_PREFIX2 })]);
  await tmux.run(['set-option', '-gu', SAVED_PREFIX]);
  await tmux.run(['set-option', '-gu', SAVED_PREFIX2]);
}

async function unbindLayoutMouseKeys(tmux: Tmux): Promise<void> {
  const listing = await tmux.run(['list-keys', '-T', 'root']);

  for (const line of listing.split('\n')) {
    const [, key, command] = ROOT_BINDING.exec(line) ?? [];

    if (key && command && MOUSE_KEY.test(key) && LAYOUT_COMMAND.test(command)) {
      await tmux.run(['unbind-key', '-T', 'root', key]);
    }
  }
}
