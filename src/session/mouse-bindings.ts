import { mouseInUse, type MouseSettings } from '../config/mouse-settings.ts';
import type { Tmux } from '../tmux/tmux.ts';
import { COPY_TABLES } from './copy-mode.ts';

const ROOT_TABLE = 'root';

/** A mouse key of one key table and what it runs; without a command the key is unbound. */
export type MouseKey = { table: string; key: string; command: string[] | undefined };

/**
 * Joins two commands of one binding. From an argument list tmux would take a bare `;` for the end
 * of the `bind-key` itself, so the separator is written the way a shell would pass `\;`.
 */
export const THEN = '\\;';

/** The pane under the mouse gets the keyboard (what a click does for focus). */
const FOCUS_FIRST = ['select-pane', '-t', '=', THEN];

/**
 * Like `FOCUS_FIRST`, except for the sidebar. The click that began a double click already gave it
 * the keyboard, and by now it may have opened a chat and given the keyboard to that; taking it
 * back here would land after the sidebar's own `select-pane` and leave the sidebar focused.
 */
const FOCUS_UNLESS_SIDEBAR = [
  ...['if-shell', '-F', '-t', '=', '#{!=:#{@sheavly_role},sidebar}', 'select-pane -t ='],
  THEN,
];

/**
 * The sidebar always gets the event as it is, whether or not it asked for the mouse (with the
 * `sidebar` action off, or while it is not running, it would otherwise fall into copy mode).
 */
const IS_SIDEBAR = '#{==:#{@sheavly_role},sidebar}';
/** The pane wants the event for itself: it is the sidebar, in a mode (copy mode), or a program asked for the mouse. */
const PANE_TAKES_IT = `#{||:${IS_SIDEBAR},#{||:#{pane_in_mode},#{mouse_any_flag}}}`;
/** As above, and a program on the alternate screen (an editor) has no history to scroll. */
const SCREEN_TAKES_IT = `#{||:#{alternate_on},${PANE_TAKES_IT}}`;

/** What a double or triple click selects, and copies a moment later (so the selection is seen). */
const copySelected = (select: 'select-word' | 'select-line'): string =>
  `copy-mode -H ; send-keys -X ${select} ; run-shell -d 0.3 ; send-keys -X copy-pipe-and-cancel`;

/**
 * Every mouse key of tmux's we have a say in, with what it runs under these settings, or none
 * when its action is off. They are tmux's own default bindings, written out so that an action can
 * be left off without losing the others: tmux's defaults give the keyboard to the pane under the
 * mouse in the middle of selecting and scrolling, which is `focus` and not `copy` or `scroll`.
 *
 * Copying goes through the `copy-command` tmux was given, like the keys of copy mode.
 */
export function mouseKeys(mouse: MouseSettings): MouseKey[] {
  const focus = mouse.focus ? FOCUS_FIRST : [];
  const focusUnlessSidebar = mouse.focus ? FOCUS_UNLESS_SIDEBAR : [];
  const root = (key: string, command: string[] | undefined): MouseKey[] => [
    { table: ROOT_TABLE, key, command },
  ];
  const inCopyMode = (key: string, command: string[] | undefined): MouseKey[] =>
    COPY_TABLES.map((table) => ({ table, key, command }));
  const whenCopying = (command: string[]): string[] | undefined =>
    mouse.copy ? command : undefined;
  const whenScrolling = (command: string[]): string[] | undefined =>
    mouse.scroll ? command : undefined;

  return [
    // The sidebar's width is ours (`keepSidebarWidth`), so tmux's drag of a border is left unbound.
    ...root('MouseDrag1Border', undefined),
    // A click goes to the program in the pane when it asked for the mouse (the sidebar does).
    ...root('MouseDown1Pane', [...focus, 'send-keys', '-M']),
    ...root(
      'MouseDown2Pane',
      whenCopying([...focus, 'if-shell', '-F', PANE_TAKES_IT, 'send-keys -M', 'paste-buffer -p']),
    ),
    ...root(
      'MouseDrag1Pane',
      whenCopying(['if-shell', '-F', PANE_TAKES_IT, 'send-keys -M', 'copy-mode -M']),
    ),
    ...root(
      'DoubleClick1Pane',
      whenCopying([
        ...[...focusUnlessSidebar, 'if-shell', '-F', '-t', '=', PANE_TAKES_IT],
        ...['send-keys -M', copySelected('select-word')],
      ]),
    ),
    ...root(
      'TripleClick1Pane',
      whenCopying([
        ...[...focusUnlessSidebar, 'if-shell', '-F', '-t', '=', PANE_TAKES_IT],
        ...['send-keys -M', copySelected('select-line')],
      ]),
    ),
    ...root(
      'WheelUpPane',
      whenScrolling(['if-shell', '-F', SCREEN_TAKES_IT, 'send-keys -M', 'copy-mode -e']),
    ),
    ...inCopyMode('MouseDown1Pane', mouse.focus ? ['select-pane', '-t', '='] : undefined),
    ...inCopyMode('MouseDrag1Pane', whenCopying([...focus, 'send-keys', '-X', 'begin-selection'])),
    ...inCopyMode('MouseDragEnd1Pane', whenCopying(['send-keys', '-X', 'copy-pipe-and-cancel'])),
    ...inCopyMode(
      'WheelUpPane',
      whenScrolling([...focus, 'send-keys', '-X', '-N', '5', 'scroll-up']),
    ),
    ...inCopyMode(
      'WheelDownPane',
      whenScrolling([...focus, 'send-keys', '-X', '-N', '5', 'scroll-down']),
    ),
    ...inCopyMode(
      'DoubleClick1Pane',
      whenCopying([
        ...focus,
        ...['send-keys', '-X', 'select-word', THEN, 'run-shell', '-d', '0.3', THEN],
        ...['send-keys', '-X', 'copy-pipe-and-cancel'],
      ]),
    ),
    ...inCopyMode(
      'TripleClick1Pane',
      whenCopying([
        ...focus,
        ...['send-keys', '-X', 'select-line', THEN, 'run-shell', '-d', '0.3', THEN],
        ...['send-keys', '-X', 'copy-pipe-and-cancel'],
      ]),
    ),
  ];
}

/**
 * Sets what the mouse does: tmux listens to it only when something uses it, and each key of
 * `mouseKeys` is bound, or unbound for an action that is off. Every start does all of it, so a
 * changed setting takes effect and nothing of the last one stays.
 *
 * One thing stays out of reach: with the mouse off, tmux's right-click menus are not part of this
 * (`lockTmux` has them).
 */
export async function applyMouse(params: { tmux: Tmux; mouse: MouseSettings }): Promise<void> {
  const { tmux, mouse } = params;

  await tmux.run(['set-option', '-g', 'mouse', mouseInUse(mouse) ? 'on' : 'off']);

  for (const { table, key, command } of mouseKeys(mouse)) {
    const target = table === ROOT_TABLE ? ['-n'] : ['-T', table];

    if (command) await tmux.run(['bind-key', ...target, key, ...command]);
    // A key that is not bound is nothing to undo.
    else await tmux.run(['unbind-key', ...target, key]).catch(() => undefined);
  }
}
