import { renderBrowser } from './render.ts';
import { footer } from './footer.ts';
import { helpLines, helpMaxLeft, helpMaxTop } from './help-view.ts';
import { actionFor, emit, switchTo } from './screen.ts';
import { HELP_PAN } from './sidebar.constants.ts';
import type { HelpView, SidebarContext } from './sidebar.types.ts';
import type { Key } from './keys.ts';

/** Opens the help over the screen on show; any key it doesn't scroll by goes back to that. */
export function showHelp(ctx: SidebarContext): void {
  switchTo(ctx, { kind: 'help', back: ctx.state.mode, left: 0, top: 0 });
}

export function drawHelp(ctx: SidebarContext, view: HelpView): void {
  view.left = Math.min(view.left, helpMaxLeft(ctx, view));
  view.top = Math.min(view.top, helpMaxTop(ctx, view));

  const screen = renderBrowser({
    title: 'Help',
    items: helpLines(ctx, view).map((line) => Array.from(line).slice(view.left).join('')),
    cursor: -1,
    scrollTop: view.top,
    width: process.stdout.columns,
    height: process.stdout.rows,
    footer: footer(ctx),
    divider: ctx.divider,
    focus: ctx.state.focus,
  });

  emit(ctx, screen.lines);
}

/** The arrow keys scroll what does not fit; with nothing to scroll, or any other key, it closes. */
export function handleHelp(ctx: SidebarContext, key: Key, view: HelpView): void {
  const pan = (delta: number): void => {
    view.left = Math.min(Math.max(view.left + delta, 0), helpMaxLeft(ctx, view));
  };
  const scroll = (delta: number): void => {
    view.top = Math.min(Math.max(view.top + delta, 0), helpMaxTop(ctx, view));
  };
  const page = Math.max(1, process.stdout.rows - 4);
  const horizontal = helpMaxLeft(ctx, view) > 0;
  const vertical = helpMaxTop(ctx, view) > 0;
  const action = actionFor(ctx, 'help', key);

  if (horizontal && action === 'help.scrollLeft') pan(-HELP_PAN);
  else if (horizontal && action === 'help.scrollRight') pan(HELP_PAN);
  else if (vertical && action === 'help.scrollUp') scroll(-1);
  else if (vertical && action === 'help.scrollDown') scroll(1);
  else if (vertical && action === 'help.pageUp') scroll(-page);
  else if (vertical && action === 'help.pageDown') scroll(page);
  else switchTo(ctx, view.back);
}
