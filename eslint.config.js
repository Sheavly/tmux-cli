// ESLint for the whole repository: strict type-aware TypeScript, readability rules that track
// comprehension cost, the file structure rules (`lint/file-kinds.js`) and no inline escape hatches.
// The rule sets live in `lint/`; this file only applies them to the right files.
//
//   npm run lint            check everything
//   npm run lint:fix        apply auto-fixes, then Prettier
//   npm run format          Prettier owns formatting; ESLint never reports on it
import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import prettier from 'eslint-config-prettier';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import {
  DEFAULT_MAX_LINES,
  FAKE_FOLDER,
  FILE_KIND_POLICIES,
  globsOfKind,
  TEST_FOLDER,
} from './lint/file-kinds.js';
import { localPlugin } from './lint/plugin.js';
import { READABILITY_RULES } from './lint/readability.js';
import { TYPESCRIPT_RULES } from './lint/typescript.js';

const TYPED_FILES = ['**/*.ts'];
const JS_FILES = ['**/*.js', '**/*.mjs'];
const SOURCE_FILES = ['src/**/*.ts'];
const TEST_FILES = [`**/${TEST_FOLDER}/**/*.ts`, `**/${FAKE_FOLDER}/**/*.ts`];

function maxLines(max) {
  return max === null ? 'off' : ['error', { max, skipBlankLines: true, skipComments: true }];
}

// Large files are where structure gets lost; split by responsibility before adding more.
// One block per kind, read off FILE_KIND_POLICIES, so a new kind brings its own limit.
const maxLinesPerKind = Object.entries(FILE_KIND_POLICIES).map(([kind, policy]) => ({
  files: globsOfKind(kind),
  rules: { 'max-lines': maxLines(policy.maxLines) },
}));

/** Conventions of every source file. `no-restricted-syntax` is one rule, so kinds add to this list. */
const CONVENTIONS = [
  { selector: 'ExportDefaultDeclaration', message: 'Named exports only.' },
  { selector: 'ExportAllDeclaration', message: 'No barrel files: import from the defining file.' },
  {
    selector: 'ExportNamedDeclaration[source]',
    message: 'No re-exports: import from the defining file.',
  },
];

const IN_TYPES_FILE = [
  {
    selector:
      'ExportNamedDeclaration > :matches(VariableDeclaration, FunctionDeclaration, ClassDeclaration)',
    message: 'A types file exports types only; code goes in a file of its own.',
  },
  {
    selector: "ImportDeclaration[importKind='value']",
    message: 'A types file imports with `import type`.',
  },
];

const IN_CONSTANTS_FILE = [
  {
    selector:
      'ExportNamedDeclaration > :matches(FunctionDeclaration, ClassDeclaration, TSTypeAliasDeclaration, TSInterfaceDeclaration)',
    message: 'A constants file exports literal values only; types go in a *.types.ts file.',
  },
  {
    selector:
      'ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[init.type=/Function/]',
    message: 'A constants file exports literal values only, not functions.',
  },
];

/** A utils file is pure: it reads no file, starts no process and does not touch the environment. */
const IMPURE_MODULES = [
  'node:fs',
  'node:fs/promises',
  'node:child_process',
  'node:net',
  'node:http',
  'node:https',
  'node:os',
  'node:readline',
  'node:readline/promises',
];

export default defineConfig([
  globalIgnores(['coverage/', 'node_modules/']),
  {
    // Exceptions live in `files:` overrides with a reason, where review sees them; never in
    // inline `eslint-disable` comments that silence a rule where nobody looks.
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
  },

  // --- Every file: recommended JS + readability ---
  {
    files: [...TYPED_FILES, ...JS_FILES],
    extends: [js.configs.recommended],
    plugins: { '@stylistic': stylistic, sonarjs, unicorn },
    languageOptions: { globals: globals.node },
    rules: {
      ...READABILITY_RULES,
      'no-console': 'error',
      'prefer-const': 'error',
      'object-shorthand': 'error',
      'max-params': ['error', 4],
    },
  },

  // --- TypeScript: strict + stylistic, type-aware ---
  {
    files: TYPED_FILES,
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: TYPESCRIPT_RULES,
  },

  // --- Structure: `<name>.<kind>.ts`, each kind holds one shape ---
  {
    files: SOURCE_FILES,
    plugins: { local: localPlugin },
    rules: { 'local/file-kind': 'error', 'no-restricted-syntax': ['error', ...CONVENTIONS] },
  },
  { files: TYPED_FILES, rules: { 'max-lines': maxLines(DEFAULT_MAX_LINES) } },
  ...maxLinesPerKind,
  {
    files: globsOfKind('types'),
    rules: {
      'no-restricted-syntax': ['error', ...CONVENTIONS, ...IN_TYPES_FILE],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'separate-type-imports' },
      ],
    },
  },
  {
    files: globsOfKind('constants'),
    rules: { 'no-restricted-syntax': ['error', ...CONVENTIONS, ...IN_CONSTANTS_FILE] },
  },
  {
    files: globsOfKind('utils'),
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: IMPURE_MODULES.map((name) => ({ name, message: 'A utils file is pure: no I/O.' })),
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'A utils file is pure: it does not read the environment.' },
        { name: 'fetch', message: 'A utils file is pure: no I/O.' },
      ],
    },
  },

  // --- The CLI reports to the terminal ---
  { files: ['src/cli.ts', 'src/cli/**/*.ts', '**/*.mjs'], rules: { 'no-console': 'off' } },

  // --- Terminal escape sequences start with a control character, which is the point of these
  // patterns: the code that reads, strips and draws them, and the tests that feed them ---
  {
    files: ['src/terminal/**/*.ts', 'src/sidebar/keys.ts', 'src/viewer/diff.ts', ...TEST_FILES],
    rules: { 'no-control-regex': 'off' },
  },

  // --- Tests: assert known shapes, and nest describe → test → callback → inner callback ---
  {
    files: TEST_FILES,
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      'max-nested-callbacks': ['error', 4],
      // `node:test` runs what `test()` and its hooks return; nothing here needs to await them.
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          allowForKnownSafeCalls: [
            {
              from: 'package',
              package: 'node:test',
              name: ['test', 'describe', 'it', 'before', 'after'],
            },
          ],
        },
      ],
    },
  },

  // --- Formatting is owned by Prettier (.prettierrc.json); keep ESLint out of it ---
  prettier,
  // Re-applied after eslint-config-prettier, which would otherwise switch `curly` off.
  { files: [...TYPED_FILES, ...JS_FILES], rules: { curly: READABILITY_RULES.curly } },
]);
