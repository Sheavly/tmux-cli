import { filterBy } from '../files/fuzzy.ts';
import type { Bindings } from '../keys/bindings.ts';
import { fromTerminal, isPrintable, typedText } from '../keys/key.ts';
import type { ActionId } from '../keys/registry.ts';
import { withoutLastGrapheme } from '../terminal/width.utils.ts';
import type { Key } from './keys.ts';
import { MODE_NAMES } from './sidebar.constants.ts';
import type { Mode } from './sidebar.types.ts';
import type { Row } from './view.ts';

/**
 * The key of the chat that matches the query best, with the same matching as the file list. The
 * folder comes first so that, as in a path, the label is what counts as the name.
 */
function bestMatch(list: Row[], query: string): string | undefined {
  const [best] = filterBy({
    items: list.filter((row) => row.kind === 'chat'),
    query,
    text: (row) => `${row.workspace}/${row.kind === 'chat' ? row.label : ''}`,
  });

  return best?.key;
}

/** The query after this key, or nothing when the key doesn't edit it. */
function editedQuery(query: string, action: ActionId | undefined, key: Key): string | undefined {
  if (action === 'text.erase') return withoutLastGrapheme(query);

  const read = fromTerminal(key);

  return read !== undefined && isPrintable(read) ? query + typedText(read) : undefined;
}

/** What searching reads and changes of the sidebar; a `SidebarContext` is one. */
export type SearchContext = {
  bindings: Bindings;
  state: { mode: Mode; cursorKey: string };
};

export function startSearch(ctx: SearchContext): void {
  ctx.state.mode = { kind: 'search', query: '', origin: ctx.state.cursorKey };
}

/**
 * Typing moves the cursor to the best matching chat; the rows are not filtered. Enter keeps the
 * cursor where it is without opening anything, Escape puts it back where the search began.
 */
export function handleSearch(ctx: SearchContext, key: Key, list: Row[]): void {
  const { state } = ctx;

  if (state.mode.kind !== 'search') return;

  const { query, origin } = state.mode;
  const action = ctx.bindings.action(MODE_NAMES.search, fromTerminal(key) ?? '');

  if (action === 'text.cancel') {
    state.cursorKey = origin;
    state.mode = { kind: 'list' };

    return;
  }

  if (action === 'text.submit') {
    state.mode = { kind: 'list' };

    return;
  }

  const next = editedQuery(query, action, key);

  if (next === undefined) return;

  state.mode = { kind: 'search', query: next, origin };
  state.cursorKey = (next === '' ? undefined : bestMatch(list, next)) ?? origin;
}
