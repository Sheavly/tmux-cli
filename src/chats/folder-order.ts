import { isRecord, readOptionalText, writeJsonFile } from '../config/json-file.ts';

/** The moved folders of each profile, by profile id; `''` is the id when the harness has none. */
export type FolderOrders = Record<string, string[]>;

/**
 * The folders the user moved, in the order they put them, per profile, kept in a file of our own
 * (`folder-order.json` next to the config file) as `{"profile": ["/path/a", "/path/b"]}`.
 * An older file holding one array, shared by every profile, is read as no moved folders.
 */
export async function readFolderOrders(file: string): Promise<FolderOrders> {
  const text = await readOptionalText(file);

  if (text === undefined) return {};

  const value: unknown = JSON.parse(text);

  if (Array.isArray(value)) return {};

  if (!isRecord(value)) throw new Error(`${file} must hold a JSON object`);

  const orders: FolderOrders = {};

  for (const [profile, folders] of Object.entries(value)) {
    if (Array.isArray(folders)) {
      orders[profile] = folders.filter((entry): entry is string => typeof entry === 'string');
    }
  }

  return orders;
}

export async function writeFolderOrders(params: {
  file: string;
  orders: FolderOrders;
}): Promise<void> {
  await writeJsonFile(params.file, params.orders);
}
