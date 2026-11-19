import { fromTerminal } from '../keys/key.ts';
import type { ActionId } from '../keys/registry.ts';
import type { Key } from './keys.ts';
import { paint, screenCodes } from './render.ts';
import { MODE_NAMES } from './sidebar.constants.ts';
import type { Mode, SidebarContext } from './sidebar.types.ts';
import { takeColumns } from '../terminal/width.utils.ts';

/** What a key read from the terminal does on the screen the sidebar is showing. */
export function actionFor(
  ctx: SidebarContext,
  screen: Mode['kind'],
  key: Key,
): ActionId | undefined {
  return ctx.bindings.action(MODE_NAMES[screen], fromTerminal(key) ?? '');
}

/** Writes the lines unless they are what is on screen already; says whether it wrote them. */
export function emit(ctx: SidebarContext, lines: string[]): boolean {
  const output = paint(lines);

  if (output === ctx.state.lastPaint) return false;

  ctx.state.lastPaint = output;
  process.stdout.write(output);

  return true;
}

export function clearScreen(ctx: SidebarContext): void {
  ctx.state.lastPaint = '';
  process.stdout.write(screenCodes.clear);
}

/** Changes the screen shown, from a clean one. */
export function switchTo(ctx: SidebarContext, mode: Mode): void {
  ctx.state.mode = mode;
  clearScreen(ctx);
}

/** Says something in the footer, and draws it. */
export function say(ctx: SidebarContext, text: string): void {
  ctx.state.message = text;
  ctx.draw();
}

/** How many rows a page up or down moves: the screen, less its title and footer. */
export function pageSize(): number {
  return process.stdout.rows - 4;
}

export function truncateLine(text: string, width: number): string {
  return takeColumns(text, width);
}

/** The columns an item may use: the screen, less the divider and the two leading spaces. */
export function itemWidth(ctx: SidebarContext): number {
  return process.stdout.columns - (ctx.divider ? 2 : 0) - 2;
}
