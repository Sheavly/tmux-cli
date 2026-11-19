// Rules chosen because they track measured comprehension cost (cognitive complexity, nesting,
// "atoms of confusion" like nested ternaries and implicit coercion), not style taste.
// Applied after eslint-config-prettier, which would otherwise switch `curly` off.
export const READABILITY_RULES = {
  // Split dense functions into visible steps; all auto-fixable. Prettier keeps blank lines but
  // never adds them.
  '@stylistic/padding-line-between-statements': [
    'error',
    { blankLine: 'always', prev: '*', next: 'return' },
    { blankLine: 'always', prev: 'block-like', next: '*' },
    { blankLine: 'always', prev: '*', next: 'block-like' },
    { blankLine: 'always', prev: ['const', 'let'], next: '*' },
    { blankLine: 'any', prev: ['const', 'let'], next: ['const', 'let'] },
  ],
  'max-depth': ['error', 3],
  'max-nested-callbacks': ['error', 3],
  'sonarjs/cognitive-complexity': ['error', 15],

  // Prefer flat control flow.
  'no-else-return': ['error', { allowElseIf: false }],
  'no-lonely-if': 'error',
  'unicorn/prefer-early-return': 'error',
  'sonarjs/no-collapsible-if': 'error',
  'sonarjs/prefer-single-boolean-return': 'error',
  'sonarjs/prefer-immediate-return': 'error',

  // "Atoms of confusion".
  'no-nested-ternary': 'error',
  'no-unneeded-ternary': 'error',
  'unicorn/no-negated-condition': 'error',
  eqeqeq: 'error',
  'no-implicit-coercion': 'error',
  // `multi-line` keeps one-line guards (`if (!x) return;`) and requires braces otherwise.
  curly: ['error', 'multi-line'],
  'no-param-reassign': 'error',
  // One name for a caught error everywhere, so it never shadows an `error` field or variable.
  'unicorn/catch-error-name': ['error', { name: 'caughtError' }],
};
