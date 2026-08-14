const path = require('path');

module.exports = {
  mode: 'production',
  // MV3のCSPはevalを禁止するのでeval系devtoolを使わない
  devtool: false,
  target: 'webworker',
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
