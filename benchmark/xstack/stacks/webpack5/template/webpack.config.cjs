const path = require('node:path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

const config = (env, argv) => ({
  entry: './src/index.tsx',
  output: { path: path.resolve(__dirname, 'dist'), filename: '[name].[contenthash].js', clean: true, publicPath: '/' },
  resolve: { extensions: ['.tsx', '.ts', '.jsx', '.js'] },
  devtool: argv.mode === 'production' ? false : 'eval-source-map',
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'swc-loader',
          options: {
            jsc: {
              parser: { syntax: 'typescript', tsx: true },
              transform: { react: { runtime: 'automatic', development: argv.mode !== 'production', refresh: false } },
            },
          },
        },
      },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },
    ],
  },
  plugins: [new HtmlWebpackPlugin({ template: './public/index.html' })],
  devServer: { historyApiFallback: true, host: '127.0.0.1', hot: true },
})

module.exports = config
