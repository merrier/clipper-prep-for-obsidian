import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

import { createRuntimePong, isRuntimePingRequest } from '../shared/messages';

export default defineBackground({
  type: 'module',
  main() {
    browser.runtime.onInstalled.addListener(({ reason }) => {
      console.info('[Clipper Prep for Obsidian] installed:', reason);
    });

    browser.runtime.onMessage.addListener((message) => {
      if (isRuntimePingRequest(message)) {
        return Promise.resolve(createRuntimePong(message));
      }

      return undefined;
    });
  },
});
