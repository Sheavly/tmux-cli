/** A plain object: not null, not an array. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The JSON object a file holds. A file that is wrong is an error naming it, not a default: a typo
 * silently falling back would start the wrong thing.
 */
export function parseJsonObject(params: { file: string; text: string }): Record<string, unknown> {
  const { file, text } = params;
  let value: unknown;

  try {
    value = JSON.parse(text);
  } catch (caughtError) {
    throw new Error(`${file} is not valid JSON`, { cause: caughtError });
  }

  if (!isRecord(value)) throw new Error(`${file} must hold a JSON object`);

  return value;
}
