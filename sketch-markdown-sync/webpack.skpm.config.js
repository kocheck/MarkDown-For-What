/**
 * Custom webpack config for skpm builds.
 * skpm automatically sets entry/output; this config is merged on top.
 */
module.exports = function (config) {
  config.module.rules.push(
    {
      test: /\.tsx?$/,
      use: 'ts-loader',
      exclude: /node_modules\/(?!marked)/,
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
};
