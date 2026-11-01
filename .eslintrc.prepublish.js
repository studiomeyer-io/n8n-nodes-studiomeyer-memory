module.exports = [
  ...require('./eslint.config.js'),
  {
    files: ['package.json'],
    rules: {
      'n8n-nodes-base/community-package-json-name-still-default': 'error',
    },
  },
];
