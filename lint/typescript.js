/** On top of typescript-eslint's `strictTypeChecked` + `stylisticTypeChecked`. */
export const TYPESCRIPT_RULES = {
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
  ],
  '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
  // One way to declare object shapes: `type` also composes with unions.
  '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
  // Named explicitly so a preset change can't drop them.
  '@typescript-eslint/no-non-null-assertion': 'error',
  '@typescript-eslint/no-deprecated': 'error',
  '@typescript-eslint/no-unnecessary-type-assertion': 'error',
  // `{} as T` claims a shape nobody built; a literal passed straight to a generic may be asserted.
  '@typescript-eslint/consistent-type-assertions': [
    'error',
    {
      assertionStyle: 'as',
      objectLiteralTypeAssertions: 'allow-as-parameter',
      arrayLiteralTypeAssertions: 'allow-as-parameter',
    },
  ],
  // An unknown value must be handled, not silently defaulted.
  '@typescript-eslint/switch-exhaustiveness-check': [
    'error',
    { considerDefaultExhaustiveForUnions: true, requireDefaultForNonUnion: false },
  ],
  '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
  '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
  // Off: an adapter's methods are async by contract, even when one implementation doesn't await.
  '@typescript-eslint/require-await': 'off',
  // Off: it asks for `x!` where `x as T` narrows a possibly-missing value, which
  // `no-non-null-assertion` forbids; both cannot hold. Narrowing is written with `as` and a
  // comment where the code guarantees the value, or with a check where it does not.
  '@typescript-eslint/non-nullable-type-assertion-style': 'off',
  // Off: flags `signal.aborted` re-checks after an `await` as "always false" (narrowing doesn't
  // know the value can change meanwhile).
  '@typescript-eslint/no-unnecessary-condition': 'off',
};
