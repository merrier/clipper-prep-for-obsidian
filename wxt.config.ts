import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',
  browser: 'chrome',
  targetBrowsers: ['chrome'],
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Obsidian Clipper Extended',
    short_name: 'Clipper Extended',
    description:
      'A Chromium extension scaffold for extending Obsidian web clipping workflows.',
    permissions: ['activeTab', 'storage'],
  },
});
