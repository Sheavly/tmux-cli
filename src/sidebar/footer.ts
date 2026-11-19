import { elsewhereHint, runningElsewhere } from '../profiles/profiles.ts';
import { footerHints } from './help.ts';
import { helpMaxLeft, helpMaxTop } from './help-view.ts';
import { truncateLine } from './screen.ts';
import type { SidebarContext } from './sidebar.types.ts';
import { takeLastColumns } from '../terminal/width.utils.ts';

/** The footer of the screen on show: its keys, and what it has to say. */
export function footer(ctx: SidebarContext): string[] {
  const { bindings, state } = ctx;
  const { mode } = state;
  const width = process.stdout.columns;

  if (mode.kind === 'rename') {
    // The end of the text stays in view while typing, so a long name never hides the cursor.
    const typed = takeLastColumns(`${mode.text}_`, width);

    return ['new name:', typed, footerHints.rename(bindings)].map((line) =>
      truncateLine(line, width),
    );
  }

  if (mode.kind === 'search') {
    const typed = takeLastColumns(`/ ${mode.query}_`, width);

    return [truncateLine(typed, width), footerHints.search(bindings)];
  }

  if (mode.kind === 'help') {
    return [
      '',
      footerHints.help(bindings, {
        horizontal: helpMaxLeft(ctx, mode) > 0,
        vertical: helpMaxTop(ctx, mode) > 0,
      }),
    ];
  }

  if (mode.kind === 'confirm-delete') {
    return [
      truncateLine(`Delete "${mode.row.label}"?`, width),
      footerHints.confirmDelete(bindings),
    ];
  }

  if (mode.kind === 'confirm-quit') {
    return ['Stop every chat and quit?', footerHints.confirmQuit(bindings)];
  }

  if (mode.kind === 'files') {
    // What is typed, with its end in view; before anything is typed, say that typing searches.
    const typed = mode.query === '' ? '' : takeLastColumns(`/ ${mode.query}_`, width);
    const first = typed || state.message || 'type to search';

    return [truncateLine(first, width), footerHints.files(bindings, { typed: mode.query !== '' })];
  }

  if (mode.kind === 'profiles') return ['', footerHints.profiles(bindings)];

  return listFooter(ctx);
}

/**
 * Chats running where the list doesn't show them are said just above the help: in the status line
 * when it has nothing else to say, otherwise on a line of its own.
 */
function listFooter(ctx: SidebarContext): string[] {
  const { state, bindings } = ctx;
  const width = process.stdout.columns;
  const elsewhere = elsewhereHint(
    runningElsewhere({ panes: state.panes, chats: state.chats, active: state.activeProfile }),
  );
  const status = footerStatus(ctx);
  const helpHint = footerHints.list(bindings);

  if (!elsewhere) return [truncateLine(status, width), helpHint];

  return status
    ? [truncateLine(status, width), truncateLine(elsewhere, width), helpHint]
    : [truncateLine(elsewhere, width), helpHint];
}

function footerStatus(ctx: SidebarContext): string {
  const { state } = ctx;

  if (state.message) return state.message;

  return state.problems.length > 0 ? `${state.problems.length} unreadable chat file(s)` : '';
}
