import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',
  browser: 'chrome',
  targetBrowsers: ['chrome'],
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Clipper Prep for Obsidian',
    short_name: 'Clipper Prep',
    description:
      'Prepare complex pages for cleaner Obsidian Web Clipper captures.',
    permissions: ['activeTab', 'storage'],
  },
});
