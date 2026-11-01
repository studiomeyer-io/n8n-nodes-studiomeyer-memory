const parser = require('@typescript-eslint/parser');
const plugin = require('eslint-plugin-n8n-nodes-base');

const languageOptions = {
  parser,
  parserOptions: {
    project: ['./tsconfig.json'],
    sourceType: 'module',
    extraFileExtensions: ['.json'],
    tsconfigRootDir: __dirname,
  },
};

module.exports = [
  { ignores: ['**/*.js', '**/node_modules/**', '**/dist/**'] },
  {
    files: ['package.json'],
    languageOptions,
    plugins: { 'n8n-nodes-base': plugin },
    rules: {
      ...plugin.configs.community.rules,
      'n8n-nodes-base/community-package-json-name-still-default': 'off',
    },
  },
  {
    files: ['credentials/**/*.ts'],
    languageOptions,
    plugins: { 'n8n-nodes-base': plugin },
    rules: { ...plugin.configs.credentials.rules },
  },
  {
    files: ['nodes/**/*.ts'],
    languageOptions,
    plugins: { 'n8n-nodes-base': plugin },
    rules: {
      ...plugin.configs.nodes.rules,
      'n8n-nodes-base/node-execute-block-missing-continue-on-fail': 'off',
      'n8n-nodes-base/node-resource-description-filename-against-convention': 'off',
      'n8n-nodes-base/node-param-fixed-collection-type-unsorted-items': 'off',
    },
  },
];
