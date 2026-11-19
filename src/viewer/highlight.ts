import { execFile } from 'node:child_process';
import path from 'node:path';
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { bundledLanguages } from 'shiki/langs';
import { bundledThemes } from 'shiki/themes';

/** A run of text in one colour. */
export type Piece = { text: string; color?: string; bold: boolean; italic: boolean };

/** Beyond these a file stays plain, so a huge one cannot stall the viewer. */
export const MAX_HIGHLIGHT_LINES = 4_000;
const MAX_HIGHLIGHT_BYTES = 400 * 1024;

const DARK_THEME = 'night-owl';
const LIGHT_THEME = 'night-owl-light';

/** Files known by their whole name rather than an extension. */
const BY_NAME: Record<string, string> = {
  dockerfile: 'docker',
  makefile: 'make',
  '.gitignore': 'ini',
  '.env': 'ini',
};

const FONT_ITALIC = 1;
const FONT_BOLD = 2;

/** The shiki language for a file, or undefined for one we do not know (it is then shown plain). */
function languageOf(file: string): string | undefined {
  const name = path.basename(file).toLowerCase();
  const known = bundledLanguages as Record<string, unknown>;
  const byName = BY_NAME[name];

  if (byName) return byName;

  const extension = path.extname(name).slice(1);

  return extension !== '' && extension in known ? extension : undefined;
}

/** Whether a `#rrggbb` background is a light one, so a light theme is used on it. */
export function isLight(background: string | undefined): boolean {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(background ?? '');

  if (!match) return false;

  const [red, green, blue] = [match[1], match[2], match[3]].map((part) =>
    Number.parseInt(part as string, 16),
  ) as [number, number, number];

  return (0.299 * red + 0.587 * green + 0.114 * blue) / 255 > 0.5;
}

/** The terminal's background as the session recorded it, or undefined if it is not known. */
export function recordedBackground(): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile('tmux', ['show-options', '-gqv', '@sheavly_background'], (error, stdout) => {
      resolve(error || stdout.trim() === '' ? undefined : stdout.trim());
    });
  });
}

/**
 * The code as coloured runs, one array per line; undefined when the file is too big, of a language
 * we do not know, or anything about highlighting fails. The viewer then shows it plain.
 */
export async function highlight(params: {
  file: string;
  code: string;
  light: boolean;
}): Promise<Piece[][] | undefined> {
  const { file, code, light } = params;
  const language = languageOf(file);
  const grammar = language ? (bundledLanguages as Record<string, never>)[language] : undefined;

  if (!language || !grammar || code.length > MAX_HIGHLIGHT_BYTES) return undefined;

  try {
    const theme = light ? LIGHT_THEME : DARK_THEME;
    const highlighter = await createHighlighterCore({
      themes: [bundledThemes[theme]],
      langs: [grammar],
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    });
    const lines = highlighter.codeToTokensBase(code, { lang: language, theme });

    return lines.map((line) =>
      line.map((token) => ({
        text: token.content,
        ...(token.color ? { color: token.color } : {}),
        bold: ((token.fontStyle ?? 0) & FONT_BOLD) !== 0,
        italic: ((token.fontStyle ?? 0) & FONT_ITALIC) !== 0,
      })),
    );
  } catch {
    return undefined;
  }
}

/** `#rrggbb` as the escape sequence that sets a 24-bit foreground colour. */
export function colorCode(color: string): string {
  const value = Number.parseInt(color.slice(1, 7), 16);

  return `\u001b[38;2;${(value >> 16) & 255};${(value >> 8) & 255};${value & 255}m`;
}
