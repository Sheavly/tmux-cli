import { browserHelp, listHelp } from './help.ts';
import type { HelpView, SidebarContext } from './sidebar.types.ts';

/** The lines of the help for the screen it was opened from. */
export function helpLines(ctx: SidebarContext, view: HelpView): string[] {
  const { adapter, bindings } = ctx;

  if (view.back.kind === 'browse') return browserHelp(bindings);

  return listHelp({
    bindings,
    profiles: Boolean(adapter.listProfiles),
    deleting: Boolean(adapter.deleteChat),
    files: Boolean(adapter.edits),
    chatEscape: Boolean(adapter.promptText && adapter.clearPromptKeys),
  });
}

/** Columns of an item that fit: the screen, less the divider and the two leading spaces. */
function helpRoom(ctx: SidebarContext): number {
  return Math.max(1, process.stdout.columns - (ctx.divider ? 2 : 0) - 2);
}

/** How far the help can be scrolled to the right: how much of its longest line does not fit. */
export function helpMaxLeft(ctx: SidebarContext, view: HelpView): number {
  const longest = Math.max(0, ...helpLines(ctx, view).map((line) => Array.from(line).length));

  return Math.max(0, longest - helpRoom(ctx));
}

/** The title takes a row and the footer two, the rest is for lines. */
export function helpMaxTop(ctx: SidebarContext, view: HelpView): number {
  return Math.max(0, helpLines(ctx, view).length - Math.max(1, process.stdout.rows - 3));
}
