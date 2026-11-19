import type { ActionId } from '../keys/registry.ts';

/**
 * How far a navigation key moves the cursor: one row, a page, or all the way to an end (an
 * infinite step, which `clampedStep` brings to the end). Nothing for a key that does not move it.
 */
export function moveFor(params: {
  action: ActionId | undefined;
  /** How many rows a page is. */
  page: number;
}): number | undefined {
  switch (params.action) {
    case 'navigation.up':
      return -1;
    case 'navigation.down':
      return 1;
    case 'navigation.pageUp':
      return -params.page;
    case 'navigation.pageDown':
      return params.page;
    case 'navigation.top':
      return -Infinity;
    case 'navigation.bottom':
      return Infinity;
    default:
      return undefined;
  }
}

/** The cursor after a step, kept within `0` to `last`. */
export function clampedStep(params: { cursor: number; delta: number; last: number }): number {
  return Math.min(Math.max(params.cursor + params.delta, 0), params.last);
}
