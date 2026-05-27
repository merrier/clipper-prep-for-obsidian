import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';

import {
  createPageSnapshotResponse,
  isPageSnapshotRequest,
} from '../shared/messages';
import { readPageSnapshot } from '../shared/page-snapshot';
import {
  enhanceMarkdownLinks,
  isGlobalProcessorEnabled,
  restoreMarkdownLinks,
} from '../shared/global-processing';
import {
  INACTIVE_ENHANCEMENT_STATUS,
  isSiteEnabled,
  type EnhancementStatus,
} from '../shared/site-enhancements';
import { getSettings, SETTINGS_STORAGE_KEY } from '../shared/storage';
import {
  disableBytetechArticleReceiver,
  getBytetechEnhancementStatus,
  installBytetechArticleReceiver,
  isBytetechArticleUrl,
  isBytetechSourceFrameUrl,
  postBytetechMainWorldRestore,
  postBytetechArticleFromSourceFrame,
  restoreBytetechEnhancement,
} from '../shared/bytetech';
import {
  enhanceFeishuDocument,
  getFeishuEnhancementStatus,
  isFeishuDocumentUrl,
  restoreFeishuEnhancement,
} from '../shared/feishu';
import {
  enhanceWeChatArticle,
  getWeChatEnhancementStatus,
  isWeChatArticleUrl,
  restoreWeChatEnhancement,
} from '../shared/wechat';

let enhancementStatus: EnhancementStatus = INACTIVE_ENHANCEMENT_STATUS;
let mutationObserver: MutationObserver | null = null;
const observedMutationRoots = new Set<Node>();
let scrollListenerInstalled = false;
const elementScrollListeners = new Set<HTMLElement>();
let applyingEnhancement = false;
let pendingEnhancement = false;
let syncId = 0;
let bytetechSourceCollectionPromise: Promise<EnhancementStatus> | null = null;
let bytetechSourceRetryTimer: number | null = null;
let bytetechSourceRetryCount = 0;
let bytetechSourceSamplerTimer: number | null = null;
let bytetechSourceFullCollectionUrl = '';
let bytetechSourceFullCollectionComplete = false;
let feishuDocumentCollectionPromise: Promise<EnhancementStatus> | null = null;
let feishuDocumentRetryTimer: number | null = null;
let feishuDocumentRetryCount = 0;
let feishuDocumentSamplerTimer: number | null = null;
let feishuDocumentFullCollectionUrl = '';
let feishuDocumentFullCollectionComplete = false;

export default defineContentScript({
  matches: [
    'https://mp.weixin.qq.com/s*',
    'https://bytetech.info/articles/*',
    'https://feishu.cn/docx/*',
    'https://*.feishu.cn/docx/*',
    'https://larkoffice.com/docx/*',
    'https://*.larkoffice.com/docx/*',
    'https://larksuite.com/docx/*',
    'https://*.larksuite.com/docx/*',
  ],
  allFrames: true,
  runAt: 'document_start',
  main() {
    void syncEnhancement();

    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && SETTINGS_STORAGE_KEY in changes) {
        void syncEnhancement();
      }
    });

    browser.runtime.onMessage.addListener((message) => {
      if (isPageSnapshotRequest(message)) {
        return syncEnhancement().then(() =>
          createPageSnapshotResponse(readPageSnapshot(), enhancementStatus),
        );
      }

      return undefined;
    });
  },
});

async function syncEnhancement() {
  const currentSyncId = (syncId += 1);
  const settings = await getSettings();

  if (currentSyncId !== syncId) {
    return;
  }

  const markdownLinksEnabled = isGlobalProcessorEnabled(settings.enabledGlobalProcessors, 'markdownLinks');
  const wechatEnabled = isSiteEnabled(settings.enabledSites, 'wechat');
  const bytetechEnabled = isSiteEnabled(settings.enabledSites, 'bytetech');
  const feishuEnabled = isSiteEnabled(settings.enabledSites, 'feishu');
  const isDirectFeishuDocument = isFeishuDocumentUrl(window.location.href) && window.parent === window;

  syncMarkdownLinkProcessing(markdownLinksEnabled);

  if (!isWeChatArticleUrl(window.location.href)) {
    restoreWeChatEnhancement();
  } else {
    if (!wechatEnabled) {
      stopMutationObserverIfUnused(markdownLinksEnabled);
      restoreWeChatEnhancement();
      enhancementStatus = getWeChatEnhancementStatus(document, window.location.href, false);
      return;
    }

    enhancementStatus = enhanceWeChatArticle();
    startMutationObserver();
    return;
  }

  if (!isBytetechArticleUrl(window.location.href)) {
    disableBytetechArticleReceiver();
    restoreBytetechEnhancement();
    postBytetechMainWorldRestore();
  } else {
    if (!bytetechEnabled) {
      stopMutationObserverIfUnused(markdownLinksEnabled);
      disableBytetechArticleReceiver();
      restoreBytetechEnhancement();
      postBytetechMainWorldRestore();
      enhancementStatus = getBytetechEnhancementStatus(document, window.location.href, false);
      return;
    }

    installBytetechArticleReceiver();
    enhancementStatus = getBytetechEnhancementStatus(document, window.location.href, true);
    startMutationObserver();
    return;
  }

  if (isBytetechSourceFrameUrl(window.location.href) && window.parent !== window) {
    if (!bytetechEnabled) {
      stopMutationObserverIfUnused(markdownLinksEnabled);
      stopBytetechSourceSampler();
      resetBytetechSourceFullCollection();
      enhancementStatus = getBytetechEnhancementStatus(document, window.location.href, false);
      return;
    }

    startMutationObserver();
    startBytetechSourceSampler();
    enhancementStatus = await applyBytetechSourceEnhancement(markdownLinksEnabled);

    if (enhancementStatus.active) {
      clearBytetechSourceRetry();
    } else {
      scheduleBytetechSourceRetry();
    }

    return;
  }

  if (isDirectFeishuDocument) {
    if (!feishuEnabled) {
      stopMutationObserverIfUnused(markdownLinksEnabled);
      clearFeishuDocumentRetry();
      stopFeishuDocumentSampler();
      resetFeishuDocumentFullCollection();
      restoreFeishuEnhancement();
      enhancementStatus = getFeishuEnhancementStatus(document, window.location.href, false);
      return;
    }

    startMutationObserver();
    startFeishuDocumentSampler();
    enhancementStatus = await applyFeishuDocumentEnhancement(markdownLinksEnabled);

    if (enhancementStatus.active) {
      clearFeishuDocumentRetry();
    } else {
      scheduleFeishuDocumentRetry();
    }

    return;
  }

  stopMutationObserverIfUnused(markdownLinksEnabled);
  clearBytetechSourceRetry();
  stopBytetechSourceSampler();
  resetBytetechSourceFullCollection();
  clearFeishuDocumentRetry();
  stopFeishuDocumentSampler();
  resetFeishuDocumentFullCollection();
  restoreFeishuEnhancement();
  enhancementStatus = INACTIVE_ENHANCEMENT_STATUS;
}

function syncMarkdownLinkProcessing(enabled: boolean): void {
  if (enabled) {
    enhanceMarkdownLinks(document, window.location.href);
    startMutationObserver();
    return;
  }

  restoreMarkdownLinks(document);
}

function stopMutationObserverIfUnused(markdownLinksEnabled: boolean): void {
  if (!markdownLinksEnabled) {
    stopMutationObserver();
  }
}

function startMutationObserver() {
  if (mutationObserver) {
    return;
  }

  mutationObserver = new MutationObserver(() => {
    refreshMutationRoots();
    refreshElementScrollListeners();
    scheduleEnhancement();
  });

  refreshMutationRoots();

  if (!scrollListenerInstalled) {
    window.addEventListener('scroll', scheduleEnhancement, true);
    document.addEventListener('scroll', scheduleEnhancement, true);
    scrollListenerInstalled = true;
  }

  refreshElementScrollListeners();
}

function observeMutationRoot(root: Node) {
  if (!mutationObserver || observedMutationRoots.has(root)) {
    return;
  }

  mutationObserver.observe(root, {
    attributes: true,
    attributeFilter: [
      'src',
      'data-src',
      'srcset',
      'href',
      'data-href',
      'data-link-node',
      'style',
      'class',
      'data-record-id',
      'data-block-id',
      'data-block-type',
    ],
    childList: true,
    characterData: true,
    subtree: true,
  });
  observedMutationRoots.add(root);
}

function refreshMutationRoots() {
  if (!mutationObserver) {
    return;
  }

  observeMutationRoot(document.documentElement ?? document);

  queryElementsDeep(document, '*').forEach((element) => {
    if (element.shadowRoot) {
      observeMutationRoot(element.shadowRoot);
    }
  });
}

function scheduleEnhancement() {
  if (applyingEnhancement) {
    pendingEnhancement = true;
    return;
  }

  applyingEnhancement = true;

  queueMicrotask(() => {
    pendingEnhancement = false;

    void syncEnhancement().finally(() => {
      applyingEnhancement = false;

      if (pendingEnhancement) {
        scheduleEnhancement();
      }
    });
  });
}

function stopMutationObserver() {
  mutationObserver?.disconnect();
  mutationObserver = null;
  observedMutationRoots.clear();
  pendingEnhancement = false;

  if (scrollListenerInstalled) {
    window.removeEventListener('scroll', scheduleEnhancement, true);
    document.removeEventListener('scroll', scheduleEnhancement, true);
    scrollListenerInstalled = false;
  }

  elementScrollListeners.forEach((element) => {
    element.removeEventListener('scroll', scheduleEnhancement);
  });
  elementScrollListeners.clear();
}

function scheduleBytetechSourceRetry() {
  if (bytetechSourceRetryTimer !== null || bytetechSourceRetryCount >= 45) {
    return;
  }

  bytetechSourceRetryCount += 1;
  bytetechSourceRetryTimer = window.setTimeout(() => {
    bytetechSourceRetryTimer = null;
    scheduleEnhancement();
  }, 1000);
}

function clearBytetechSourceRetry() {
  if (bytetechSourceRetryTimer !== null) {
    window.clearTimeout(bytetechSourceRetryTimer);
    bytetechSourceRetryTimer = null;
  }

  bytetechSourceRetryCount = 0;
}

function startBytetechSourceSampler() {
  if (bytetechSourceSamplerTimer !== null) {
    return;
  }

  bytetechSourceSamplerTimer = window.setInterval(() => {
    scheduleEnhancement();
  }, 1200);
}

function stopBytetechSourceSampler() {
  if (bytetechSourceSamplerTimer === null) {
    return;
  }

  window.clearInterval(bytetechSourceSamplerTimer);
  bytetechSourceSamplerTimer = null;
}

function resetBytetechSourceFullCollection() {
  bytetechSourceFullCollectionUrl = '';
  bytetechSourceFullCollectionComplete = false;
}

function scheduleFeishuDocumentRetry() {
  if (feishuDocumentRetryTimer !== null || feishuDocumentRetryCount >= 45) {
    return;
  }

  feishuDocumentRetryCount += 1;
  feishuDocumentRetryTimer = window.setTimeout(() => {
    feishuDocumentRetryTimer = null;
    scheduleEnhancement();
  }, 1000);
}

function clearFeishuDocumentRetry() {
  if (feishuDocumentRetryTimer !== null) {
    window.clearTimeout(feishuDocumentRetryTimer);
    feishuDocumentRetryTimer = null;
  }

  feishuDocumentRetryCount = 0;
}

function startFeishuDocumentSampler() {
  if (feishuDocumentSamplerTimer !== null) {
    return;
  }

  feishuDocumentSamplerTimer = window.setInterval(() => {
    scheduleEnhancement();
  }, 1200);
}

function stopFeishuDocumentSampler() {
  if (feishuDocumentSamplerTimer === null) {
    return;
  }

  window.clearInterval(feishuDocumentSamplerTimer);
  feishuDocumentSamplerTimer = null;
}

function resetFeishuDocumentFullCollection() {
  feishuDocumentFullCollectionUrl = '';
  feishuDocumentFullCollectionComplete = false;
}

function refreshElementScrollListeners() {
  if (!mutationObserver) {
    return;
  }

  elementScrollListeners.forEach((element) => {
    if (!element.isConnected || !isScrollableElement(element)) {
      element.removeEventListener('scroll', scheduleEnhancement);
      elementScrollListeners.delete(element);
    }
  });

  queryElementsDeep(document, '*').forEach((element) => {
    if (!isScrollableElement(element) || elementScrollListeners.has(element)) {
      return;
    }

    element.addEventListener('scroll', scheduleEnhancement, { passive: true });
    elementScrollListeners.add(element);
  });
}

function isScrollableElement(element: HTMLElement): boolean {
  return element.scrollHeight > element.clientHeight + 20 || element.scrollWidth > element.clientWidth + 20;
}

function queryElementsDeep(root: ParentNode, selector: string): HTMLElement[] {
  const results = Array.from(root.querySelectorAll<HTMLElement>(selector));
  const shadowHosts = Array.from(root.querySelectorAll<HTMLElement>('*')).filter((element) => element.shadowRoot);

  shadowHosts.forEach((host) => {
    results.push(...queryElementsDeep(host.shadowRoot as ShadowRoot, selector));
  });

  return results;
}

async function applyBytetechSourceEnhancement(markdownLinksEnabled: boolean): Promise<EnhancementStatus> {
  const sourceUrl = window.location.href;

  if (bytetechSourceFullCollectionUrl !== sourceUrl) {
    bytetechSourceFullCollectionUrl = sourceUrl;
    bytetechSourceFullCollectionComplete = false;
  }

  if (!bytetechSourceCollectionPromise) {
    const shouldCollectFullArticle = !bytetechSourceFullCollectionComplete;

    bytetechSourceCollectionPromise = postBytetechArticleFromSourceFrame(undefined, undefined, undefined, {
      maxScrollSteps: shouldCollectFullArticle ? 160 : 0,
      preserveMarkdownLinks: markdownLinksEnabled,
      waitMs: shouldCollectFullArticle ? 70 : 0,
    })
      .then((status) => {
        if (shouldCollectFullArticle && status.active) {
          bytetechSourceFullCollectionComplete = true;
        }

        return status;
      })
      .finally(() => {
        bytetechSourceCollectionPromise = null;
      });
  }

  return bytetechSourceCollectionPromise;
}

async function applyFeishuDocumentEnhancement(markdownLinksEnabled: boolean): Promise<EnhancementStatus> {
  const sourceUrl = window.location.href;

  if (feishuDocumentFullCollectionUrl !== sourceUrl) {
    feishuDocumentFullCollectionUrl = sourceUrl;
    feishuDocumentFullCollectionComplete = false;
  }

  if (!feishuDocumentCollectionPromise) {
    const shouldCollectFullDocument = !feishuDocumentFullCollectionComplete;

    feishuDocumentCollectionPromise = enhanceFeishuDocument(window, document, sourceUrl, {
      maxScrollSteps: shouldCollectFullDocument ? 160 : 0,
      preserveMarkdownLinks: markdownLinksEnabled,
      waitMs: shouldCollectFullDocument ? 70 : 0,
    })
      .then((status) => {
        if (shouldCollectFullDocument && status.active) {
          feishuDocumentFullCollectionComplete = true;
        }

        return status;
      })
      .finally(() => {
        feishuDocumentCollectionPromise = null;
      });
  }

  return feishuDocumentCollectionPromise;
}
