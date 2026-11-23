/** Ids of a fake chat's sessions: the one the user talks to and a sub-agent it started. */
export const MAIN = '11111111-1111-4111-8111-111111111111';
export const AGENT = '22222222-2222-4222-8222-222222222222';

/** An entry of a conversation's stream; `sseOf` gives it its `seq`. */
function entry(sessionId: string, at: number, rest: Record<string, unknown>): object {
  return { sessionId, at, ...rest };
}

export const sessionStarted = (params: {
  id: string;
  depth: number;
  at: number;
  parentId?: string;
}) =>
  entry(params.id, params.at, {
    kind: 'update',
    update: {
      type: 'session_started',
      session: {
        id: params.id,
        depth: params.depth,
        startedAt: params.at,
        title: params.depth > 1 ? 'explore' : '',
        ...(params.parentId ? { parentId: params.parentId } : {}),
      },
    },
  });

export const sessionEnded = (params: { id: string; depth: number; at: number }) =>
  entry(params.id, params.at, {
    kind: 'update',
    update: {
      type: 'session_ended',
      session: { id: params.id, depth: params.depth, startedAt: 1, title: '' },
    },
  });

export const sessionIdle = (id: string, at: number) =>
  entry(id, at, {
    kind: 'update',
    update: { type: 'session_idle', session: { id, depth: 1, startedAt: 1, title: '' } },
  });

export const approvalRequested = (params: { sessionId: string; at: number }) =>
  entry(params.sessionId, params.at, {
    kind: 'approval',
    update: { type: 'approval_requested', request: { id: 'r1' } },
  });

export const textDelta = (sessionId: string, text: string) =>
  entry(sessionId, 1, { kind: 'event', event: { type: 'text_delta', text } });

export const turnEnd = (sessionId: string) =>
  entry(sessionId, 1, {
    kind: 'event',
    event: { type: 'turn_end', turn: 0, stopReason: 'tool_use' },
  });

/** A batch of tool calls, each `[name, input]`. */
export const toolBatch = (params: { sessionId: string; at: number; calls: [string, object][] }) =>
  entry(params.sessionId, params.at, {
    kind: 'event',
    event: {
      type: 'tool_batch',
      calls: params.calls.map(([name, input], index) => ({
        call: { id: `call-${index}`, name, input },
        description: '',
      })),
    },
  });

export const toolResult = (sessionId: string, content: string) =>
  entry(sessionId, 1, {
    kind: 'event',
    event: {
      type: 'tool_result',
      call: { id: 'call-0', name: 'read_file', input: {} },
      description: '',
      message: { role: 'tool', toolCallId: 'call-0', content, isError: false },
      durationMs: 1,
    },
  });

export const taskStarted = (params: { owner: string; id: string; at: number }) =>
  entry(params.owner, params.at, {
    kind: 'task',
    update: {
      type: 'task_started',
      task: {
        id: params.id,
        kind: 'task',
        description: 'tests',
        command: 'npm test',
        startedAt: params.at,
        status: 'running',
      },
    },
  });
