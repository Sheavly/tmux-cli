import type { ApiClient } from './client.ts';
import { createSseParser } from './sse.utils.ts';

/**
 * Reads a conversation's entries from its event stream until the server ends it, `signal` aborts
 * or `onEntry` returns false. Each entry is the text of the JSON the harness wrote (the same line
 * its own `stream.jsonl` holds) and the `seq` it carried. It starts from the first entry, or after
 * `lastEventId` to resume. Throws what the client throws, an
 * `ApiError` with status 404 for a conversation that is not running.
 */
export async function readEntries(params: {
  client: ApiClient;
  id: string;
  lastEventId?: number | undefined;
  signal: AbortSignal;
  /** Takes in an entry; false when there is no more to read. */
  onEntry: (entry: { text: string; seq: number | undefined }) => boolean;
}): Promise<void> {
  const { client, id, lastEventId, signal, onEntry } = params;
  const response = await client.stream({
    path: `/conversations/${id}/stream`,
    body: { replay: true },
    ...(lastEventId === undefined ? {} : { lastEventId }),
    signal,
  });
  const parser = createSseParser();
  const decoder = new TextDecoder();

  if (!response.body) return;

  const reader: ReadableStreamDefaultReader<Uint8Array> = response.body.getReader();
  let more = true;

  try {
    while (more) {
      const chunk = await reader.read();

      if (chunk.done) return;

      const frames = parser.push(decoder.decode(chunk.value, { stream: true }));

      more = frames.every((frame) =>
        onEntry({ text: frame.data, seq: frame.id === undefined ? undefined : Number(frame.id) }),
      );
    }
  } finally {
    // Leaving early closes the connection, so the server stops sending.
    await reader.cancel().catch(() => undefined);
  }
}
