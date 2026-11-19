import type { PaneInfo } from '../session/panes.ts';

/** A chat pane parked off screen, as `listPanes` reads it; `over` is what a test is about. */
export function fakePane(over: Partial<PaneInfo> = {}): PaneInfo {
  return {
    id: '%1',
    session: 'sheavly-parked',
    role: 'chat',
    dead: false,
    deadStatus: 0,
    chat: '',
    profile: '',
    workspace: '/w',
    startedAt: 1,
    pid: 1,
    ...over,
  };
}
