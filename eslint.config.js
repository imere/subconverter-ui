import tseslint from 'typescript-eslint';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

// Prettier is integrated into ESLint via eslint-plugin-prettier, so formatting is
// enforced as a lint rule (`prettier/prettier`) and fixed by `eslint --fix`.
// There is intentionally NO separate `.prettierignore`; ignore rules live here.
//
// Note: we intentionally do NOT extend `@eslint/js` recommended, because its
// `no-undef` rule is redundant with TypeScript's own checking and would require a
// `globals` package. Type-safety is guaranteed by `tsc --noEmit` in the build.
export default [
  {
    ignores: [
      'build',
      'node_modules',
      'coverage',
      'docker/vol',
      '*.config.ts',
      'src/test',
      '**/*.test.ts',
      '**/*.test.tsx',
    ],
  },
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      prettier: prettierPlugin,
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      // Prettier options live HERE (not in a .prettierrc) so ESLint is the single
      // source of truth for both linting and formatting. Keep in sync with the
      // repo style: single quotes, 100-col, trailing commas.
      'prettier/prettier': [
        'error',
        {
          semi: true,
          singleQuote: true,
          trailingComma: 'all',
          printWidth: 100,
          tabWidth: 2,
          arrowParens: 'always',
        },
      ],
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      ...jsxA11y.configs.recommended.rules,
    },
  },
];
