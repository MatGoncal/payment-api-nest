// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import quality from './eslint-rules/index.cjs';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
  {
    files: ['src/**/*.ts'],
    plugins: { quality },
    rules: {
      // 0 violações (medir 2026-09-04)
      'quality/max-lines': ['error', { max: 400 }],
      // 0 violações
      'quality/no-direct-console': [
        'error',
        { logger: 'NestJS Logger (@nestjs/common)' },
      ],
      // 0 violações (medir 2026-09-04)
      'quality/no-direct-data-access': [
        'error',
        {
          modules: [
            '@prisma/client',
            '../prisma/prisma.service',
            '../../prisma/prisma.service',
          ],
          bindings: ['PrismaClient', 'PrismaService'],
          layers: ['.controller.ts'],
        },
      ],
    },
  },
  {
    files: ['eslint-rules/**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { module: 'readonly', require: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
