import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export type FakeRequest = {
  method: string;
  path: string;
  token: string;
  body: string;
  /** The `Last-Event-ID` header of a stream that resumes. */
  lastEventId?: string;
};

/** What the fake answers: a status and a JSON body, or an event stream it sends and then ends. */
export type FakeAnswer = { status: number; body: unknown } | { status: 200; sse: string };

/** The frames of entries as the server sends them: an `entry` event whose `id` is the `seq`. */
export function sseOf(entries: readonly object[]): string {
  return entries
    .map((entry, seq) => `event: entry\nid: ${seq}\ndata: ${JSON.stringify({ ...entry, seq })}\n\n`)
    .join('');
}

/**
 * A server on a free local port that answers like the harness's: `answers` by `<METHOD> <path>`
 * (a missing one is a 404 in the harness's error shape), and 401 for any other token than `token`.
 */
export type FakeServer = {
  url: string;
  token: string;
  requests: FakeRequest[];
  answers: Map<string, FakeAnswer>;
  close: () => Promise<void>;
};

export async function startFakeServer(token = 'a'.repeat(40)): Promise<FakeServer> {
  const requests: FakeRequest[] = [];
  const answers = new Map<string, FakeAnswer>();
  const server: Server = createServer((request, response) => {
    void readBody(request).then((body) => {
      const lastEventId = request.headers['last-event-id'];
      const seen: FakeRequest = {
        method: request.method ?? '',
        path: request.url ?? '',
        token: (request.headers.authorization ?? '').replace('Bearer ', ''),
        body,
        ...(typeof lastEventId === 'string' ? { lastEventId } : {}),
      };

      requests.push(seen);

      const answer =
        seen.token === token
          ? (answers.get(`${seen.method} ${seen.path}`) ?? {
              status: 404,
              body: { error: { code: 'not_found', message: 'no such conversation' } },
            })
          : { status: 401, body: { error: { code: 'unauthorized', message: 'unauthorized' } } };

      if ('sse' in answer) {
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        response.end(answer.sse);

        return;
      }

      response.writeHead(answer.status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(answer.body));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    token,
    requests,
    answers,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) chunks.push(chunk as Buffer);

  return Buffer.concat(chunks).toString('utf8');
}
