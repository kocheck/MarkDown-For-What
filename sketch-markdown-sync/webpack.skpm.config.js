/**
 * Custom webpack config for skpm builds.
 * skpm automatically sets entry/output; this config is merged on top.
 */
const path = require('path');

module.exports = function (config) {
  config.module.rules.push(
    {
      test: /\.tsx?$/,
      use: 'ts-loader',
      exclude: /node_modules\/(?!marked)/,
      include: [
        path.resolve(__dirname, 'src'),
        path.resolve(__dirname, '../shared'),
      ],
    },
    {
      test: /\.css$/,
      use: ['style-loader', 'css-loader'],
    },
    {
      test: /\.html$/,
      use: 'html-loader',
    }
  );

  config.resolve = config.resolve || {};
  config.resolve.extensions = ['.tsx', '.ts', '.jsx', '.js'];
  // Resolve shared/ imports (e.g. 'marked') from this plugin's node_modules
  config.resolve.modules = [path.resolve(__dirname, 'node_modules'), 'node_modules'];
};
