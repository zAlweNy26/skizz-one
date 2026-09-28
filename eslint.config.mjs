import antfu from '@antfu/eslint-config'
import { plugin as shadcn } from '@shadcn/lint'

export default antfu({
  stylistic: {
    indent: 2,
    quotes: 'single',
  },
  typescript: true,
  vue: true,
  jsonc: true,
  yaml: true,
  markdown: true,
  rules: {
    'node/prefer-global/process': 'off',
    'vue/first-attribute-linebreak': 'off',
    'vue/v-on-event-hyphenation': ['error', 'never', { autofix: true }],
    'vue/attribute-hyphenation': ['error', 'never'],
    'ts/no-explicit-any': 'error',
    'style/brace-style': ['error', '1tbs', { allowSingleLine: true }],
    'style/max-len': ['warn', {
      code: 120,
      ignoreUrls: true,
      ignoreStrings: true,
      ignoreTemplateLiterals: true,
      ignoreRegExpLiterals: true,
    }],
    'array-bracket-spacing': 'off',
    'unused-imports/no-unused-vars': 'warn',
    'unused-imports/no-unused-imports': 'warn',
    'one-var': 'off',
    'no-console': 'off',
    'jsdoc/check-param-names': 'off',
    'curly': ['warn', 'multi-or-nest'],
    'antfu/if-newline': 'off',
    'antfu/curly': 'off',
    'antfu/consistent-list-newline': 'off',
    'vue/html-closing-bracket-newline': 'off',
  },
}, {
  files: ['**/*.vue', '**/*.ts'],
  plugins: { shadcn },
  rules: {
    'shadcn/no-unknown-classes': 'error',
    'shadcn/no-arbitrary-values': ['error', { allow: ['layout'] }],
  },
})
