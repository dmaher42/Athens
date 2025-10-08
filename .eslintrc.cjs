module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'unused-imports'],
  rules: {
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
    ],
    'unused-imports/no-unused-imports': 'error',
    'unused-imports/no-unused-vars': [
      'error',
      { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' },
    ],
    'no-restricted-imports': [
      'error',
      {
        paths: [
          { name: '@/three', message: 'Import directly from "three".' },
          { name: './three.js', message: 'Import directly from "three".' },
        ],
        patterns: ['**/three.js'],
      },
    ],
    'no-restricted-syntax': [
      'error',
      {
        selector: "AssignmentExpression[left.object.name='window'][left.property.name='THREE']",
        message: 'Set window.THREE only in the main boot path.',
      },
    ],
  },
  ignorePatterns: ['dist', 'node_modules', 'src/sky/nightSkyTextureData.js'],
};
