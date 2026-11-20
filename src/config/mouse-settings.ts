import { isRecord } from './json-file.ts';

/**
 * What the mouse can do, one switch each:
 * - `scroll`: the wheel scrolls the chat's history, the sidebar's list, the file viewer and the
 *   numbered lines;
 * - `copy`: dragging (or double or triple clicking) selects text and copies it;
 * - `focus`: clicking a pane gives it the keyboard;
 * - `sidebar`: clicking a chat in the sidebar selects it, and clicking the selected one opens it.
 */
export type MouseSettings = {
  scroll: boolean;
  copy: boolean;
  focus: boolean;
  sidebar: boolean;
};

const ACTIONS = ['scroll', 'copy', 'focus', 'sidebar'] as const;

/** The default: every mouse action on. */
export const MOUSE_ALL: MouseSettings = { scroll: true, copy: true, focus: true, sidebar: true };

const MOUSE_NONE: MouseSettings = { scroll: false, copy: false, focus: false, sidebar: false };

/** Whether any mouse action is on, so tmux has to listen to the mouse at all. */
export function mouseInUse(mouse: MouseSettings): boolean {
  return ACTIONS.some((action) => mouse[action]);
}

/**
 * Reads the `mouse` of the config file: `true` or `false` for all of it, or an object that turns
 * single actions off (or on); what the object leaves out stays on. Like the rest of the file, a
 * mistake is an error rather than a quiet default.
 */
export function parseMouseSettings(params: { file: string; value: unknown }): MouseSettings {
  const { file, value } = params;

  if (typeof value === 'boolean') return value ? MOUSE_ALL : MOUSE_NONE;

  if (!isRecord(value)) {
    throw new Error(`${file}: "mouse" must be true, false or an object of ${ACTIONS.join(', ')}`);
  }

  const settings = { ...MOUSE_ALL };

  for (const [name, setting] of Object.entries(value)) {
    const action = ACTIONS.find((known) => known === name);

    if (!action) {
      throw new Error(`${file}: mouse.${name}: unknown action (one of ${ACTIONS.join(', ')})`);
    }

    if (typeof setting !== 'boolean') {
      throw new Error(`${file}: "mouse.${name}" must be true or false`);
    }

    settings[action] = setting;
  }

  return settings;
}
