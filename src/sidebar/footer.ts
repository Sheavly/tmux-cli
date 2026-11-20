import { elsewhereHint, runningElsewhere } from '../profiles/profiles.ts';
import { footerHints, hintKey } from './help.ts';
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

  if (mode.kind === 'move' || mode.kind === 'confirm-quit') return plainFooter(ctx);

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

  if (mode.kind === 'files') {
    // What is typed, with its end in view; before anything is typed, say that typing searches.
    const typed = mode.query === '' ? '' : takeLastColumns(`/ ${mode.query}_`, width);
    const first = typed || state.message || 'type to search';

    return [truncateLine(first, width), footerHints.files(bindings, { typed: mode.query !== '' })];
  }

  if (mode.kind === 'browse' && mode.typedPath !== undefined) {
    // The first line is for why a path could not be opened; what is typed keeps its end in view.
    const typed = takeLastColumns(`path: ${mode.typedPath}_`, width);

    return [
      truncateLine(state.message, width),
      truncateLine(typed, width),
      footerHints.browserPath(bindings),
    ];
  }

  if (mode.kind === 'browse' && mode.filtering) {
    const typed = mode.query === '' ? '' : takeLastColumns(`/ ${mode.query}_`, width);

    return [
      truncateLine(typed || state.message || 'type to filter', width),
      footerHints.browserFilter(bindings, { typed: mode.query !== '' }),
    ];
  }

  if (mode.kind === 'profiles') return ['', footerHints.profiles(bindings)];

  return listFooter(ctx);
}

/** The footers that are a fixed line and the keys that work: placing a folder, and the quit question. */
function plainFooter(ctx: SidebarContext): string[] {
  const { bindings } = ctx;

  if (ctx.state.mode.kind === 'move') {
    return ['Moving folder (pinned *)', footerHints.move(bindings)];
  }

  return ['Stop every chat and quit?', footerHints.confirmQuit(bindings)];
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

  const problems =
    state.problems.length > 0 ? `${state.problems.length} unreadable chat file(s)` : '';

  return [runningOnlyNote(ctx), problems].filter((part) => part !== '').join(' · ');
}

/** Says the list is filtered, so a short list is not taken for lost chats. */
function runningOnlyNote(ctx: SidebarContext): string {
  if (!ctx.state.runningOnly) return '';

  const key = hintKey(ctx.bindings, 'list.runningOnly');

  return key === '' ? 'active chats only' : `active chats only - ${key}: all`;
}
