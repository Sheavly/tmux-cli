import { stripEscapes } from '../../../terminal/ansi.ts';
import { cleanLabel, cleanText } from '../../../terminal/text.ts';
import { truncateColumns } from '../../../terminal/width.utils.ts';
import { style } from '../../../viewer/row-render.ts';
import { styleMarkdown } from './markdown-text.ts';

/** How much of the task a sub-agent was given is repeated at the top, in rows. */
const TASK_ROWS = 6;
/** The inputs that say what a tool call is about, when it has no description. */
const SUMMARY_KEYS = ['description', 'command', 'path', 'url', 'query', 'pattern', 'title'];

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Text from the model or a tool is untrusted for a terminal: no escape sequences reach it. */
function safeText(value: unknown): string {
  return typeof value === 'string' ? cleanText(stripEscapes(value)) : '';
}

function taskBlock(content: unknown): string {
  const rows = safeText(content)
    .split('\n')
    .map((row) => row.trimEnd());
  const shown = rows.slice(0, TASK_ROWS);
  const more = rows.length > TASK_ROWS ? [`${style.dim}…${style.reset}`] : [];

  return `${[`${style.bold}Task${style.reset}`, ...shown, ...more, ''].join('\n')}\n`;
}

function callSummary(input: unknown): string {
  const fields = asRecord(input);

  for (const key of SUMMARY_KEYS) {
    const value = fields?.[key];

    if (typeof value === 'string' && cleanLabel(value) !== '') return cleanLabel(value);
  }

  return '';
}

function callRows(params: { calls: unknown; columns: number }): string[] {
  if (!Array.isArray(params.calls)) return [];

  return params.calls.map((call: unknown) => {
    const { name, input } = asRecord(call) ?? {};
    const summary = callSummary(input);
    const tool = typeof name === 'string' ? cleanLabel(name) : '';
    const text = truncateColumns(`▸ ${tool}  ${summary}`, params.columns);

    return `${style.dim}${text}${style.reset}`;
  });
}

function assistantBlock(params: { entry: Record<string, unknown>; columns: number }): string {
  const { entry, columns } = params;
  const text = safeText(entry.content).trim();
  const rows = [
    ...(text === '' ? [] : [styleMarkdown(text), '']),
    ...callRows({ calls: entry.toolCalls, columns }),
  ];

  return rows.length === 0 ? '' : `${rows.join('\n')}\n`;
}

function toolRow(params: { entry: Record<string, unknown>; columns: number }): string {
  const { entry, columns } = params;
  const first = safeText(entry.content)
    .split('\n')
    .map((row) => cleanLabel(row))
    .find((row) => row !== '');
  const failed = entry.isError === true;
  const text = truncateColumns(`  ${failed ? '✗' : '↳'} ${first ?? ''}`, columns);

  return `${failed ? style.red : style.dim}${text}${style.reset}\n`;
}

/**
 * What one line of a sub-agent's history looks like on the screen: the task it was given, what it
 * says, the tools it calls (one row each) and the first row of what they answer. The other user
 * messages are context the harness adds, not conversation, so they are left out. Empty for a line
 * that is not a record or has nothing to show.
 */
export function renderAgentLine(params: { line: string; columns: number }): string {
  const { line, columns } = params;
  let record: Record<string, unknown> | undefined;

  try {
    record = asRecord(JSON.parse(line));
  } catch {
    return '';
  }

  const entry = asRecord(record?.entry);

  if (!entry) return '';

  if (entry.role === 'user') return record?.seq === 0 ? taskBlock(entry.content) : '';

  if (entry.role === 'assistant') return assistantBlock({ entry, columns });

  return entry.role === 'tool' ? toolRow({ entry, columns }) : '';
}
