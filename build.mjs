// Bundles the web app into dist/ with esbuild (used locally and in CI).
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync, readFileSync, existsSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const dev = process.argv.includes('--dev');

// When @capacitor packages are not installed (e.g. quick browser preview), use stubs.
let hasCap = true;
try { require.resolve('@capacitor/core'); } catch { hasCap = false; }
const alias = hasCap ? {} : Object.fromEntries(['core', 'filesystem', 'share', 'keyboard', 'haptics', 'app', 'local-notifications'].map((p) => [`@capacitor/${p}`, './stubs/capacitor.ts']));

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('public', 'dist', { recursive: true });
cpSync('index.html', 'dist/index.html');

await esbuild.build({
  entryPoints: { app: 'src/main.tsx' },
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  target: 'es2020',
  minify: !dev,
  sourcemap: dev,
  jsx: 'automatic',
  loader: { '.ttf': 'file' },
  external: ['fonts/*'],
  alias,
  nodePaths: process.env.NODE_PATH ? process.env.NODE_PATH.split(':') : [],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
  },
  logLevel: 'info',
});
if (!existsSync('dist/app.js')) process.exit(1);
