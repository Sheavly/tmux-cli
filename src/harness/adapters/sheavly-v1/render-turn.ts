/**
 * Prints a stored conversation from one entry on, the way the harness's terminal chat drew it
 * live: its chat look for the tool lines and its Markdown for the reply. The harness's own
 * `replay` command prints the plain log instead (no Markdown, no colours), so this does what the
 * chat screen does with the same pieces.
 *
 * It must run under the harness's own TypeScript runner (`tsx --conditions=@sheavly/source`),
 * which is what can load its sources. It only reads: the stored stream, never a backend or model.
 *
 *   tsx render-turn.ts <conversation folder> <first seq>
 *
 * Environment: RECAP_HARNESS_DIR (the harness checkout), RECAP_COLUMNS (the width to draw for) and
 * RECAP_PROMPT (what the user asked in that turn, which the stream doesn't hold; optional).
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// What the harness's sources look like belongs to the harness and changes with it. These are
// only the parts used here; a harness that changed one breaks this script, which the recap's
// caller survives by falling back to the plain log.
type Palette = unknown;
type Entry = { seq: number; sessionId?: string };
type Reply = { push(text: string): string; pause(): string; flush(): string };
type RenderModule = {
  Renderer: new (
    write: (text: string) => void,
    look: unknown,
    reply: { write: (text: string) => void; end: () => void },
  ) => { entry(entry: Entry, main: string | undefined): void };
};
type MarkdownModule = {
  MarkdownStream: new (params: {
    render: (text: string) => string;
    drawFence: (info: string) => unknown;
  }) => Reply;
};

const [folder, from = '0'] = process.argv.slice(2);
const harnessDir = process.env.RECAP_HARNESS_DIR;

if (!folder || !harnessDir) throw new Error('Usage: render-turn <conversation folder> <first seq>');

const sources = path.join(harnessDir, 'apps/terminal/src');

async function load<T>(file: string): Promise<T> {
  const loaded: unknown = await import(pathToFileURL(path.join(sources, file)).href);

  return loaded as T;
}

const [render, look, markdown, renderMarkdown, codeFence, palette, stored, view] =
  await Promise.all([
    load<RenderModule>('render/render.service.ts'),
    load<{ createChatLook(palette: Palette): unknown }>('render/chat-look.utils.ts'),
    load<MarkdownModule>('markdown/markdown-stream.service.ts'),
    load<{ renderMarkdown(params: { markdown: string; width: number; palette: Palette }): string }>(
      'markdown/render-markdown.utils.ts',
    ),
    load<{ CodeFence: new (params: { info: string; width: number; palette: Palette }) => unknown }>(
      'markdown/code-fence.service.ts',
    ),
    load<{ defaultPalette: Palette }>('theme/palette.utils.ts'),
    load<{ readStoredStream(folder: string): Promise<{ entries: Entry[] }> }>(
      'replay/stored-stream.helper.ts',
    ),
    load<{ echoText(params: { text: string; palette: Palette }): string }>('tui/view.utils.ts'),
  ]);

const width = Math.max(20, Number(process.env.RECAP_COLUMNS) || 100);
const colours = palette.defaultPalette;
const out = (text: string): void => {
  process.stdout.write(text);
};

const reply = new markdown.MarkdownStream({
  render: (text) => renderMarkdown.renderMarkdown({ markdown: text, width, palette: colours }),
  drawFence: (info) => new codeFence.CodeFence({ info, width, palette: colours }),
});
// The chat screen pauses a reply that something else interrupts, and ends it when it is over.
const renderer = new render.Renderer(
  (text) => {
    out(reply.pause());
    out(text);
  },
  look.createChatLook(colours),
  {
    write: (text) => out(reply.push(text)),
    end: () => out(reply.flush()),
  },
);
const stream = await stored.readStoredStream(folder);
const main = stream.entries[0]?.sessionId;

if (process.env.RECAP_PROMPT) {
  out(`${view.echoText({ text: process.env.RECAP_PROMPT, palette: colours })}\n`);
}

for (const entry of stream.entries) {
  if (entry.seq >= Number(from)) renderer.entry(entry, main);
}

out(reply.flush());
out('\n');
