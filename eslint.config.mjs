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
}, {
  // @shadcn/lint: Tailwind design-system checks. antfu's config already parses
  // these files (vue-eslint-parser for templates), so this only adds the plugin
  // and its rules; see https://github.com/shadcn-ui/lint#rules
  files: ['**/*.vue', '**/*.ts'],
  plugins: { shadcn },
  rules: {
    // Typos and classes Tailwind can't generate. Until the linter can resolve
    // Nuxt UI's `#build/ui.css` import, it checks against its bundled grammar
    // and prints a one-line warning saying so.
    'shadcn/no-unknown-classes': 'error',
    // Appearance values (radius, type, colour) must come from the theme; layout
    // math such as the room's grid columns may stay arbitrary.
    'shadcn/no-arbitrary-values': ['error', { allow: ['layout'] }],
  },
})
