import { ApiError } from './api-error.errors.ts';
import type { Connection, ConnectionFinder } from './connection.ts';

const REQUEST_TIMEOUT_MS = 15_000;

/** `QUERY` is a read that takes a body (RFC 10008); the harness uses it where a filter is sent. */
export type ApiRequest = { method: 'GET' | 'QUERY' | 'DELETE'; path: string; body?: object };

/** A request whose answer goes on until `signal` aborts or the server ends it. */
export type StreamRequest = {
  path: string;
  body: object;
  /** The `seq` of the last entry got, to resume after it. */
  lastEventId?: number;
  signal: AbortSignal;
};

export type ApiClient = {
  /** Asks the server and returns what it answered, as JSON not yet checked (undefined for a `204`). */
  json: (request: ApiRequest) => Promise<unknown>;
  /** Opens a server-sent event stream (a `QUERY` that stays); read the body of what it returns. */
  stream: (request: StreamRequest) => Promise<Response>;
};

/**
 * A client for the harness's one server. It finds the server on the first request and keeps the
 * connection; a request that fails to reach it, or is refused the token, finds the server again
 * once and retries, since the server may have been restarted (new port, new token) in the meantime.
 */
export function createApiClient(params: { find: ConnectionFinder }): ApiClient {
  let connection: Connection | undefined;

  async function attempt(request: SendRequest, fresh: boolean): Promise<Response> {
    if (!connection || fresh) connection = await params.find();

    const outcome = await send(connection, request);

    if (outcome.kind === 'answer') return outcome.response;

    if (fresh) throw new Error(outcome.message);

    return attempt(request, true);
  }

  return {
    async json(request) {
      const response = await attempt(
        { ...request, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), headers: {} },
        false,
      );

      // A `204` says it is done and has nothing in it to read.
      return response.status === 204 ? undefined : response.json();
    },

    stream: (request) =>
      attempt(
        {
          method: 'QUERY',
          path: request.path,
          body: request.body,
          signal: request.signal,
          headers:
            request.lastEventId === undefined
              ? {}
              : { 'last-event-id': String(request.lastEventId) },
        },
        false,
      ),
  };
}

type SendRequest = ApiRequest & { signal: AbortSignal; headers: Record<string, string> };

type Outcome = { kind: 'answer'; response: Response } | { kind: 'retry'; message: string };

/** One request. A server that can't be reached or refuses the token is worth finding again. */
async function send(connection: Connection, request: SendRequest): Promise<Outcome> {
  let response: Response;

  try {
    response = await fetch(`${connection.url}${request.path}`, {
      method: request.method,
      headers: {
        authorization: `Bearer ${connection.token}`,
        ...(request.body ? { 'content-type': 'application/json' } : {}),
        ...request.headers,
      },
      ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      signal: request.signal,
    });
  } catch (caughtError) {
    // A caller that aborted its own request is not a server that can't be reached.
    if (request.signal.aborted && !isTimeout(request.signal)) throw caughtError;

    return { kind: 'retry', message: `Cannot reach the sheavly server: ${reasonOf(caughtError)}` };
  }

  if (response.status === 401) {
    return { kind: 'retry', message: 'The sheavly server refused the token' };
  }

  if (!response.ok) {
    throw new ApiError({ message: await serverMessage(response), status: response.status });
  }

  return { kind: 'answer', response };
}

function isTimeout(signal: AbortSignal): boolean {
  return (signal.reason as Error | undefined)?.name === 'TimeoutError';
}

/** The server's own words for a failure (`{ error: { code, message } }`), else the status. */
async function serverMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: unknown } };

    if (typeof body.error?.message === 'string') return `sheavly server: ${body.error.message}`;
  } catch {
    // Not the error shape: the status says what there is to say.
  }

  return `sheavly server answered ${response.status}`;
}

function reasonOf(caughtError: unknown): string {
  const { cause } = caughtError as { cause?: { code?: unknown } };

  if (typeof cause?.code === 'string') return cause.code;

  return (caughtError as Error).name;
}
