import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**'] },
  js.configs.recommended,
  {
    files: ['packages/*/*/src/**/*.ts'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Tests and build configuration are typechecked by `tsconfig.test.json`,
    // which stays out of the composite build, so they belong to no ESLint
    // project and are linted without type-aware rules.
    // See docs/development/adr/0001-toolchain.md.
    files: ['tests/**/*.ts', 'packages/*/*/tests/**/*.ts', '*.config.ts'],
    extends: [tseslint.configs.recommended],
  },
  prettier,
)
