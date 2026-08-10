import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: ['node_modules/**', '.vitepress/dist/**', '.vitepress/cache/**', 'archive/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],

  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // Dead code is worth knowing about but shouldn't fail a build; `_`-prefixed
      // args are intentional positional placeholders.
      'no-unused-vars': 'off',
      // Existing components lean on `any` in a few spots — surface it, don't block
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // SFCs need the Vue parser, with the TS parser handling `<script lang="ts">`
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
  },

  // Web workers get their own globals rather than the DOM's
  {
    files: ['**/*Worker.js'],
    languageOptions: {
      globals: globals.worker,
    },
  },

  // Prettier owns formatting — keep it last so it wins over stylistic rules
  prettier,
];
