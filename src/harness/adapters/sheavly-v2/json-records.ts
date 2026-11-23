export type JsonRecord = Record<string, unknown>;

/** The objects in the array an answer holds under `key`; an answer without the array is refused. */
export function records(value: unknown, key: string): JsonRecord[] {
  const list = (value as JsonRecord | null)?.[key];

  if (!Array.isArray(list)) throw new Error(`sheavly server answered without "${key}"`);

  return list.filter((item): item is JsonRecord => typeof item === 'object' && item !== null);
}
