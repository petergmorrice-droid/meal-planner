// The code checks run by `npm run lint`, and on GitHub for every change. ESLint's and
// typescript-eslint's recommended rules (including no `any`: data from outside is `unknown` or a
// described shape, checked before use), plus React's two rules for hooks: hooks are called the
// same way every time, and an effect or memo lists everything it uses. None of these is switched
// off anywhere in the code; if one ever has to be, say why on the same line.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    'node_modules/',
    'dist/',
    'dist-single/',
    'dist-preview/',
    '.test-build/',
    'tests/e2e/.out/',
    'tests/e2e/fixtures/', // a copy of old code, kept as it was
    'public/', // copied to the site as it is
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // Unused things fail the check; a name starting with _ marks one that's unused on purpose.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^_', argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // Browser tests: Node scripts that also run code inside the page.
    files: ['tests/e2e/**/*.{cjs,mjs}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['tests/*.{mjs,ts}', 'scripts/**/*.mjs', '*.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    // Copied into the preview page as a plain browser script.
    files: ['scripts/preview-sample-data.js'],
    languageOptions: { sourceType: 'script', globals: globals.browser },
  },
]);
