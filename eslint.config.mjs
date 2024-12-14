import pluginJs from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  // pluginReactConfig,
  prettierConfig,
  {
    ignores: ['src/__test__/**/*'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
