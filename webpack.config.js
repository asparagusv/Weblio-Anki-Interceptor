const path = require('path');

module.exports = {
  mode: 'development',
  entry: {
    addTranslate: './add-translate.js',
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist')
  },
  experiments: {
    topLevelAwait: true,
  },
};
