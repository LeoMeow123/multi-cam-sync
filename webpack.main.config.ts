import type { Configuration } from 'webpack';
import { rules } from './webpack.rules';
import { plugins } from './webpack.plugins';

export const mainConfig: Configuration = {
  entry: './src/main/main.ts',
  module: {
    rules,
  },
  plugins,
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.json'],
  },
  node: {
    __dirname: true,
    __filename: true,
  },
  externals: {
    serialport: 'commonjs serialport',
    '@serialport/bindings-cpp': 'commonjs @serialport/bindings-cpp',
  },
};
