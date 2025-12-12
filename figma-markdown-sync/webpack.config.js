const HtmlWebpackPlugin = require('html-webpack-plugin');
const InlineChunkHtmlPlugin = require('html-inline-script-webpack-plugin');
const path = require('path');

module.exports = (env, argv) => ({
  mode: argv.mode === 'production' ? 'production' : 'development',

  // This is necessary because Figma's 'eval' works differently than normal eval
  devtool: argv.mode === 'production' ? false : 'inline-source-map',

  entry: {
    ui: './src/ui.ts', // The entry point for your UI code
    code: './code.ts', // The entry point for your plugin code
  },

  module: {
    rules: [
      {
        test: /\.(tsx?|jsx?)$/,
        use: 'ts-loader',
        exclude: /node_modules\/(?!marked)/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },

  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
  },

  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'), // Compile into a folder called "dist"
    publicPath: '', // Ensure relative paths work
  },

  // Tells Webpack to generate "ui.html" and to inject "ui.ts" as a script tag
  plugins: [
    new HtmlWebpackPlugin({
      template: './ui.html',
      filename: 'ui.html',
      chunks: ['ui'],
      inject: 'body',
      scriptLoading: 'blocking' // Use blocking script tag <script src> instead of defer/module if needed for simplicity
    }),
    new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/ui/]),
  ],
});
