import { defineContentScript } from 'wxt/utils/define-content-script';

import {
  installBytetechDefuddleShadowPatch,
  isBytetechArticleUrl,
  parseBytetechMainWorldMessage,
  renderBytetechArticlePayloadInShadowDom,
  restoreBytetechEnhancement,
} from '../shared/bytetech';

export default defineContentScript({
  matches: ['https://bytetech.info/articles/*'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    if (!isBytetechArticleUrl(window.location.href)) {
      return;
    }

    installBytetechDefuddleShadowPatch(window);

    window.addEventListener('message', (event) => {
      if (event.source !== window || event.origin !== window.location.origin) {
        return;
      }

      const message = parseBytetechMainWorldMessage(event.data);

      if (!message) {
        return;
      }

      if (message.type === 'restore') {
        restoreBytetechEnhancement(document);
        return;
      }

      renderBytetechArticlePayloadInShadowDom(document, message.payload);
    });
  },
});
