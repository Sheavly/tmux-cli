import type { Tmux } from '../tmux/tmux.ts';
import { MAIN_SESSION, PARKING_SESSION, listPanes } from './panes.ts';

const IDLE = ['sh', '-c', 'exec tail -f /dev/null'];

type Size = { cols: number; rows: number };

/** A pane's own option, which is how we know what a pane is: `@sheavly_role`, `@sheavly_chat`. */
export async function tagPane(params: {
  tmux: Tmux;
  paneId: string;
  option: string;
  value: string;
}): Promise<void> {
  const { tmux, paneId, option, value } = params;

  await tmux.run(['set-option', '-p', '-t', paneId, `@sheavly_${option}`, value]);
}

/** The session that holds every chat that is off screen, started with one idle pane to keep it. */
export async function createParking(params: { tmux: Tmux; size: Size }): Promise<void> {
  const { tmux, size } = params;
  const anchor = await tmux.run([
    ...['new-session', '-d', '-P', '-F', '#{pane_id}', '-s', PARKING_SESSION],
    ...['-n', 'anchor', '-x', String(size.cols), '-y', String(size.rows), ...IDLE],
  ]);

  await tagPane({ tmux, paneId: anchor.trim(), option: 'role', value: 'anchor' });
}

/** The session you attach to: the sidebar, and the placeholder beside it. Returns the sidebar. */
export async function createMain(params: {
  tmux: Tmux;
  size: Size;
  sidebarCommand: string[];
  /** What the pane beside the sidebar runs while no chat is on screen. */
  placeholder: string[];
}): Promise<string> {
  const { tmux, size, sidebarCommand, placeholder } = params;
  const sidebar = (
    await tmux.run([
      ...['new-session', '-d', '-P', '-F', '#{pane_id}', '-s', MAIN_SESSION, '-n', 'chats'],
      ...['-x', String(size.cols), '-y', String(size.rows), ...sidebarCommand],
    ])
  ).trim();

  await tagPane({ tmux, paneId: sidebar, option: 'role', value: 'sidebar' });
  await addPlaceholder({ tmux, sidebarId: sidebar, placeholder });

  return sidebar;
}

/** The placeholder beside the sidebar, for a session that is new or that lost its content pane. */
async function addPlaceholder(params: {
  tmux: Tmux;
  sidebarId: string;
  placeholder: string[];
}): Promise<void> {
  const { tmux, sidebarId, placeholder } = params;
  const content = (
    await tmux.run([
      ...['split-window', '-h', '-d', '-t', sidebarId, '-P', '-F', '#{pane_id}', ...placeholder],
    ])
  ).trim();

  await tagPane({ tmux, paneId: content, option: 'role', value: 'placeholder' });
}

/** A session whose content pane was closed (tmux's own keys can) gets its placeholder back. */
export async function restoreContentPane(params: {
  tmux: Tmux;
  sidebarId: string;
  placeholder: string[];
}): Promise<void> {
  const { tmux, sidebarId, placeholder } = params;
  const panes = await listPanes(tmux);
  const hasContent = panes.some(
    (pane) =>
      pane.session === MAIN_SESSION && (pane.role === 'chat' || pane.role === 'placeholder'),
  );

  if (!hasContent) await addPlaceholder({ tmux, sidebarId, placeholder });
}

/** Keeps the sidebar at its width, now and whenever the window is resized or a client attaches. */
export async function keepSidebarWidth(params: {
  tmux: Tmux;
  sidebarId: string;
  width: number;
}): Promise<void> {
  const { tmux, sidebarId, width } = params;
  const resize = `resize-pane -t ${sidebarId} -x ${width}`;

  // `window-resized` runs after tmux has rescaled the panes, so the width set here is the last
  // word; `client-resized` runs before it and was overwritten.
  for (const hook of ['window-resized', 'client-attached']) {
    await tmux.run(['set-hook', '-g', hook, resize]);
  }

  await tmux.run(resize.split(' '));
}
