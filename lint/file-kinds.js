/**
 * The `<kind>` in `<module>.<kind>.ts`, each with the policy the structure rules read. A file
 * without a kind (`sidebar.ts`) is plain code; one with a kind keeps to what the kind is for.
 *
 * - `maxLines`: lines of code (blank and comment lines aside) before a file is doing more than
 *   one job. `null` is no limit: utils are pure functions that grow with their subject; split
 *   one by responsibility when it does several jobs, not to fit a number.
 *
 * What a kind may hold is checked by the overrides in `eslint.config.js`:
 *
 * - `types`: exported types only, imported with `import type`.
 * - `constants`: exported literal values only (`as const` objects, numbers, strings).
 * - `utils`: pure helpers, no I/O and no process state.
 * - `errors`: error classes.
 * - `fake`: test-only helpers, in a `testing/` folder.
 * - `test`: `node:test` files, in a `__tests__` folder beside the module they test.
 */
const LINES = { SHORT: 150, DEFAULT: 300, TEST: 500, UNLIMITED: null };

export const FILE_KIND_POLICIES = {
  types: { maxLines: LINES.DEFAULT },
  constants: { maxLines: LINES.DEFAULT },
  utils: { maxLines: LINES.UNLIMITED },
  errors: { maxLines: LINES.SHORT },
  fake: { maxLines: LINES.DEFAULT },
  test: { maxLines: LINES.TEST },
};

const FILE_KINDS = Object.keys(FILE_KIND_POLICIES);

/** The folder test files live in, beside the module they test. */
export const TEST_FOLDER = '__tests__';

/** The folder test-only helpers live in. */
export const FAKE_FOLDER = 'testing';

/** Lines of code for a file without a kind. */
export const DEFAULT_MAX_LINES = LINES.DEFAULT;

const KEBAB = '[a-z0-9]+(?:-[a-z0-9]+)*';
const FILE_NAME = new RegExp(`^(${KEBAB})((?:\\.${KEBAB})*)\\.ts$`);

/**
 * What a file name says about the file: `{ kind }` for `tasks.types.ts` (and `kind: null` for a
 * plain `tasks.ts`), or `{ problem }` when the name isn't kebab-case or names a kind we don't have.
 * Only the last dotted part is the kind, so `render-turn.test.ts` and `run.helper.test.ts` are tests.
 */
export function readFileName(fileName) {
  const match = FILE_NAME.exec(fileName);

  if (!match) {
    return {
      problem: `"${fileName}" must be kebab-case and end in .ts: <name>.ts or <name>.<kind>.ts`,
    };
  }

  const kind = (match[2] ?? '').split('.').filter(Boolean).at(-1) ?? null;

  if (kind !== null && !FILE_KINDS.includes(kind)) {
    return { problem: `"${fileName}": "${kind}" is not a file kind (${FILE_KINDS.join(', ')})` };
  }

  return { kind };
}

/** The ESLint globs of one kind's files. */
export function globsOfKind(kind) {
  return [`**/*.${kind}.ts`];
}
