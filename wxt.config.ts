import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',
  browser: 'chrome',
  targetBrowsers: ['chrome'],
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  manifest: {
    default_locale: 'en',
    name: '__MSG_extensionName__',
    short_name: '__MSG_extensionShortName__',
    description: '__MSG_extensionDescription__',
    permissions: ['activeTab', 'scripting', 'storage'],
  },
});
