import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // CONVENTIONS.md §4 — 색상은 tokens.css 토큰만. 하드코딩 hex 금지
    files: ['src/**/*.{ts,tsx}'],
    // 예외: engine/colors.ts(Canvas는 CSS 변수를 못 읽음), dev/(데모용 샘플 팔레트 — 실값은 DB 소관)
    ignores: ['src/features/map/engine/colors.ts', 'src/dev/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/#[0-9a-fA-F]{3,8}\\b/]',
          message: '하드코딩 hex 색상 금지 — src/styles/tokens.css 토큰을 사용하세요.',
        },
        {
          selector: 'TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b/]',
          message: '하드코딩 hex 색상 금지 — src/styles/tokens.css 토큰을 사용하세요.',
        },
      ],
    },
  },
  {
    // CONVENTIONS.md §2 — components/ui는 도메인 무지: 의존 방향 features → ui 강제
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/features/**', '**/stores/**', '**/lib/**', '**/types/**'],
              message: 'components/ui는 도메인 모듈을 import할 수 없습니다 (CONVENTIONS.md §2).',
            },
          ],
        },
      ],
    },
  },
  {
    // CONVENTIONS.md §2 — 렌더 엔진은 React 비의존 순수 TS
    files: ['src/features/map/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              message: 'engine/은 React를 import할 수 없습니다 (CONVENTIONS.md §2).',
            },
            {
              name: 'react-dom',
              message: 'engine/은 React를 import할 수 없습니다 (CONVENTIONS.md §2).',
            },
          ],
        },
      ],
    },
  },
])
