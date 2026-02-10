import type { Configuration } from 'webpack';
import { rules } from './webpack.rules';
import { plugins } from './webpack.plugins';

// Filter out native module loaders that inject __dirname references
// (node-loader and asset-relocator-loader are only needed for main process)
const rendererRules = rules.filter((rule: any) => {
  if (!rule || !rule.use) return true;
  const loader = typeof rule.use === 'string' ? rule.use : rule.use?.loader;
  return loader !== 'node-loader' && loader !== '@vercel/webpack-asset-relocator-loader';
});

rendererRules.push({
  test: /\.css$/,
  use: [
    'style-loader',
    'css-loader',
    {
      loader: 'postcss-loader',
      options: {
        postcssOptions: {
          plugins: [require('tailwindcss'), require('autoprefixer')],
        },
      },
    },
  ],
});

export const rendererConfig: Configuration = {
  module: {
    rules: rendererRules,
  },
  plugins,
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
  },
};
