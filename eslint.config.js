import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // `src/utils/fonts` enthaelt generierte Base64-Module von je einem halben
  // Megabyte. Sie zu pruefen kostet Zeit und findet nichts — es ist eine
  // einzige Zeichenkette.
  { ignores: ['dist', 'release', 'src/utils/fonts'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // React Compiler / strict hook rules entschärfen — Pattern ist OK
      'react-hooks/set-state-in-effect': 'off',         // Form-Init in Modals ist legitim
      'react-hooks/purity': 'off',                       // Date.now() in render via useMemo ok
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'warn',
    },
  },
)
