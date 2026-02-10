import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import * as path from 'path';
import * as fs from 'fs';

import { mainConfig } from './webpack.main.config';
import { rendererConfig } from './webpack.renderer.config';

/**
 * Recursively copy a directory
 */
function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Serialport packages that need to be copied into the packaged app
const nativeModules = [
  'serialport',
  '@serialport/bindings-cpp',
  '@serialport/bindings-interface',
  '@serialport/parser-readline',
  '@serialport/parser-delimiter',
  '@serialport/stream',
  'node-gyp-build',
];

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: '**/node_modules/{serialport,@serialport/**,node-gyp-build}/**',
    },
    name: 'Multi-Cam-Sync',
    executableName: 'multi-cam-sync',
    extraResource: ['./python'],
    afterCopy: [
      (buildPath: string, _electronVersion: string, _platform: string, _arch: string, callback: (err?: Error) => void) => {
        try {
          const nodeModulesSrc = path.resolve(__dirname, 'node_modules');
          const nodeModulesDest = path.join(buildPath, 'node_modules');

          for (const mod of nativeModules) {
            const src = path.join(nodeModulesSrc, mod);
            const dest = path.join(nodeModulesDest, mod);
            if (fs.existsSync(src)) {
              copyDirSync(src, dest);
              console.log(`  Copied native module: ${mod}`);
            }
          }

          callback();
        } catch (err) {
          callback(err as Error);
        }
      },
    ],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new WebpackPlugin({
      mainConfig,
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: './src/renderer/index.html',
            js: './src/renderer/index.tsx',
            name: 'main_window',
            preload: {
              js: './src/main/preload.ts',
            },
          },
        ],
      },
    }),
  ],
};

export default config;
