import { fromTerminal, isPrintable, typedText } from '../keys/key.ts';
import type { ActionId } from '../keys/registry.ts';
import { withoutLastGrapheme } from '../terminal/width.utils.ts';
import type { Key } from './keys.ts';

/** The query after this key, or nothing when the key doesn't edit it. */
export function editedQuery(
  query: string,
  action: ActionId | undefined,
  key: Key,
): string | undefined {
  if (action === 'text.erase') return withoutLastGrapheme(query);

  const read = fromTerminal(key);

  return read !== undefined && isPrintable(read) ? query + typedText(read) : undefined;
}
