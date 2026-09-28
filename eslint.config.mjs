import antfu from '@antfu/eslint-config'

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
    // camelCase in templates, matching the names used in <script setup>.
    'vue/v-on-event-hyphenation': ['error', 'never', { autofix: true }],
    'vue/attribute-hyphenation': ['error', 'never'],
    'ts/no-explicit-any': 'error',
    'style/brace-style': ['error', '1tbs', { allowSingleLine: true }],
    // Warn only: max-len has no autofix, so the edit hook can't correct it.
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
})
