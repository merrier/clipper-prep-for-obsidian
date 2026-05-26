import type { EnhancementStatus } from './site-enhancements';
import {
  appendMarkdownInlineContent,
  collectMarkdownInlineContent,
  getMarkdownInlineContentText,
  type MarkdownInlineContent,
} from './global-processing';

const BYTETECH_HOSTNAME = 'bytetech.info';
const FEISHU_HOSTNAME_SUFFIX = '.feishu.cn';
const LARKOFFICE_HOSTNAME_SUFFIX = '.larkoffice.com';
const LARKSUITE_HOSTNAME_SUFFIX = '.larksuite.com';
const LARKOFFICE_TENANT_PREFIX = 'bytedance.';

const ENHANCED_ATTR = 'data-obsidian-clipper-extended-enhanced';
const MIRROR_ID = 'obsidian-clipper-extended-bytetech-article';
const SOURCE_URL_ATTR = 'data-obsidian-clipper-extended-source-url';
const BLOCK_COUNT_ATTR = 'data-obsidian-clipper-extended-block-count';
const SOURCE_FRAME_ATTR = 'data-obsidian-clipper-extended-source-frame';
const ORIGINAL_FRAME_ARIA_HIDDEN_ATTR = 'data-obsidian-clipper-extended-original-frame-aria-hidden';
const DEFUDDLE_SHADOW_ATTR = 'data-defuddle-shadow';
const MESSAGE_SOURCE = 'obsidian-clipper-extended:bytetech';
const MAIN_WORLD_MESSAGE_SOURCE = 'obsidian-clipper-extended:bytetech-main-world';
const BLOB_RESOLVER_MESSAGE_SOURCE = 'obsidian-clipper-extended:bytetech-blob-resolver';
const DEFUDDLE_PATCH_FLAG = '__obsidianClipperExtendedBytetechDefuddlePatch';
const BLOB_RESOLVER_FLAG = '__obsidianClipperExtendedBytetechBlobResolver';
const NON_CONTENT_IMAGE_TEXT = new Set(['附件不支持打印']);
const MIN_MEANINGFUL_IMAGE_SIZE = 120;
const AVATAR_IMAGE_SIZE_LIMIT = 96;
const NEARBY_IMAGE_VERTICAL_GAP = 900;
const RELATED_IMAGE_SIBLING_LIMIT = 3;
const MAX_INLINE_IMAGE_DATA_URL_LENGTH = 750_000;
const BYTE_TECH_IMAGE_CLIPPING_ENABLED = false;
const DECORATIVE_LARK_IMAGE_URL_PATTERN =
  /(?:illustration_|empty_|positive_loading|loading_|\/empty|empty_positive|lark-static|module\/media\/illustration)/i;
const IMAGE_URL_ATTRIBUTE_NAMES = new Set([
  'src',
  'currentSrc',
  'href',
  'xlink:href',
  'data-src',
  'data-original-src',
  'data-origin-src',
  'data-original',
  'data-lazy-src',
  'data-thumb',
  'data-thumbnail',
  'data-url',
  'data-href',
  'data-image-url',
  'data-preview-url',
  'data-download-url',
  'data-file-url',
  'data-origin-url',
]);
const IMAGE_URL_ATTRIBUTE_PATTERN = /(?:^|[-_:])(src|href|url|thumb|image|preview|download|file)(?:$|[-_:])/i;
const IMAGE_CANDIDATE_SELECTOR = [
  'img',
  'picture',
  'source',
  '[src]',
  '[srcset]',
  '[href]',
  '[xlink\\:href]',
  '[data-src]',
  '[data-original-src]',
  '[data-origin-src]',
  '[data-original]',
  '[data-lazy-src]',
  '[data-thumb]',
  '[data-thumbnail]',
  '[data-url]',
  '[data-href]',
  '[data-image-url]',
  '[data-preview-url]',
  '[data-download-url]',
  '[data-file-url]',
  '[data-origin-url]',
  '[style*="url("]',
].join(', ');
const LARK_BLOCK_SELECTOR = [
  '.render-unit-wrapper .block',
  '.root-render-unit-container .block',
  '[data-record-id][data-block-type]',
  '[data-record-id][class*="docx-"][class*="-block"]',
  '[data-block-id][data-block-type]',
].join(', ');

const MIRROR_STYLE = [
  'display:block!important',
  'visibility:visible!important',
  'position:absolute!important',
  'left:-100000px!important',
  'top:0!important',
  'width:760px!important',
  'max-width:760px!important',
  'min-width:0!important',
  'height:auto!important',
  'max-height:none!important',
  'overflow:visible!important',
  'opacity:1!important',
  'pointer-events:none!important',
  'z-index:-1!important',
  'margin:0!important',
  'padding:0 24px!important',
  'background:#fff!important',
  'color:#1f2329!important',
  'font-size:16px!important',
  'line-height:1.75!important',
  'box-sizing:border-box!important',
].join(';');

export interface BytetechArticleBlock {
  id: string;
  type: 'heading' | 'paragraph' | 'quote' | 'code' | 'image';
  text?: string;
  level?: number;
  content?: MarkdownInlineContent[];
  src?: string;
  alt?: string;
  width?: string;
  height?: string;
}

export interface BytetechArticlePayload {
  title: string;
  sourceUrl: string;
  blocks: BytetechArticleBlock[];
}

interface BytetechArticleMessage {
  source: typeof MESSAGE_SOURCE;
  type: 'article';
  payload: BytetechArticlePayload;
}

type BytetechMainWorldMessage =
  | {
      source: typeof MAIN_WORLD_MESSAGE_SOURCE;
      type: 'render';
      payload: BytetechArticlePayload;
    }
  | {
      source: typeof MAIN_WORLD_MESSAGE_SOURCE;
      type: 'restore';
    };

interface BlobResolverRequestMessage {
  source: typeof BLOB_RESOLVER_MESSAGE_SOURCE;
  type: 'resolve';
  id: string;
  src: string;
}

interface BlobResolverResponseMessage {
  source: typeof BLOB_RESOLVER_MESSAGE_SOURCE;
  type: 'resolved';
  id: string;
  src: string;
  dataUrl: string;
}

type BytetechPatchedWindow = Window & {
  [DEFUDDLE_PATCH_FLAG]?: boolean;
  [BLOB_RESOLVER_FLAG]?: boolean;
} & typeof globalThis;

export interface BytetechCollectOptions {
  maxScrollSteps?: number;
  preserveMarkdownLinks?: boolean;
  waitMs?: number;
  waitForRender?: (milliseconds: number) => Promise<void>;
}

let receiverInstalled = false;
let receiverEnabled = false;
let receiverWindow: Window | null = null;
const blobImageDataUrlCache = new Map<string, Promise<string>>();
let sourceFrameCollectionState: {
  sourceUrl: string;
  blocksById: Map<string, BytetechArticleBlock>;
  blockOrder: string[];
} | null = null;

export function isBytetechArticleUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);

    return parsedUrl.hostname === BYTETECH_HOSTNAME && parsedUrl.pathname.startsWith('/articles/');
  } catch {
    return false;
  }
}

export function isBytetechSourceFrameUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);

    return isBytedanceLarkOfficeHostname(parsedUrl.hostname) && parsedUrl.pathname.startsWith('/docx/');
  } catch {
    return false;
  }
}

export function getBytetechEnhancementStatus(
  doc: Document = document,
  pageUrl: string = window.location.href,
  enabled = false,
): EnhancementStatus {
  if (!isBytetechArticleUrl(pageUrl) && !isBytetechSourceFrameUrl(pageUrl)) {
    return {
      site: null,
      enabled,
      active: false,
      imageCount: 0,
      normalizedImageCount: 0,
      label: 'No site enhancer active',
    };
  }

  const mirror = findMirrorArticle(doc);
  const imageCount = mirror?.querySelectorAll('img').length ?? 0;
  const blockCount = Number.parseInt(mirror?.getAttribute(BLOCK_COUNT_ATTR) ?? '0', 10) || 0;

  if (isBytetechArticleUrl(pageUrl)) {
    return {
      site: 'bytetech',
      enabled,
      active: enabled && Boolean(mirror),
      imageCount,
      normalizedImageCount: imageCount,
      label:
        enabled && mirror
          ? `ByteTech enhancer active for ${blockCount} blocks`
          : 'ByteTech enhancer waiting for article frame',
    };
  }

  const renderedBlockCount = getRenderedLarkBlockElements(doc).length;

  return {
    site: 'bytetech',
    enabled,
    active: enabled && renderedBlockCount > 0,
    imageCount: 0,
    normalizedImageCount: 0,
    label:
      enabled && renderedBlockCount > 0
        ? `ByteTech source frame ready with ${renderedBlockCount} rendered blocks`
        : 'ByteTech source frame waiting for content',
  };
}

export function installBytetechArticleReceiver(win: Window = window, doc: Document = document): void {
  if (!isBytetechArticleUrl(win.location.href)) {
    return;
  }

  receiverEnabled = true;

  if (receiverInstalled && receiverWindow === win) {
    return;
  }

  receiverInstalled = true;
  receiverWindow = win;

  win.addEventListener('message', (event) => {
    if (!receiverEnabled || !isBytetechArticleUrl(win.location.href)) {
      return;
    }

    const message = parseArticleMessage(event.data);

    if (
      !message ||
      !isTrustedSourceFrameMessage(event.origin, message.payload.sourceUrl) ||
      !isExpectedSourceFrame(doc, win.location.href, message.payload.sourceUrl)
    ) {
      return;
    }

    const payload = normalizeBytetechArticlePayloadForPage(doc, message.payload);
    renderBytetechArticlePayload(doc, payload);
    postBytetechMainWorldRender(win, payload);
  });
}

export function disableBytetechArticleReceiver(): void {
  receiverEnabled = false;
}

export async function postBytetechArticleFromSourceFrame(
  win: Window = window,
  doc: Document = document,
  sourceUrl: string = window.location.href,
  options: BytetechCollectOptions = {},
): Promise<EnhancementStatus> {
  const title = getLarkDocumentTitle(doc);
  const initialBlocks = await collectVisibleLarkBlocksWithResolvedImages(doc, win, options);
  const initialPayload = mergeSourceFrameBlocks(sourceUrl, title, initialBlocks);

  if (initialPayload.blocks.length > 0) {
    postArticlePayload(win, doc, initialPayload);
  }

  const collectedPayload = await collectBytetechLarkArticlePayload(win, doc, sourceUrl, options);
  const payload = mergeSourceFrameBlocks(sourceUrl, collectedPayload.title || title, collectedPayload.blocks, {
    preferBatchOrder: collectedPayload.blocks.length > initialBlocks.length,
  });

  if (payload.blocks.length > 0) {
    postArticlePayload(win, doc, payload);
  }

  return {
    site: 'bytetech',
    enabled: true,
    active: payload.blocks.length > 0,
    imageCount: payload.blocks.filter((block) => block.type === 'image').length,
    normalizedImageCount: payload.blocks.filter((block) => block.type === 'image').length,
    label:
      payload.blocks.length > 0
        ? `ByteTech source frame collected ${payload.blocks.length} blocks`
        : 'ByteTech source frame content not found',
  };
}

export async function collectBytetechLarkArticlePayload(
  win: Window,
  doc: Document,
  sourceUrl: string,
  options: BytetechCollectOptions = {},
): Promise<BytetechArticlePayload> {
  const blocksById = new Map<string, BytetechArticleBlock>();
  const scrollContainer = findLarkScrollContainer(doc);
  const maxScrollSteps = options.maxScrollSteps ?? 80;
  const waitMs = options.waitMs ?? 90;
  const waitForRender =
    options.waitForRender ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => {
        win.setTimeout(resolve, milliseconds);
      }));
  const originalScrollTop = scrollContainer?.scrollTop ?? 0;

  await waitForLarkBlocks(doc, waitForRender, waitMs);

  if (maxScrollSteps <= 0) {
    return {
      title: getLarkDocumentTitle(doc),
      sourceUrl,
      blocks: await collectVisibleLarkBlocksWithResolvedImages(doc, win, options),
    };
  }

  if (scrollContainer) {
    scrollContainer.scrollTop = 0;
    await waitForRender(waitMs);
  }

  for (let step = 0; step < maxScrollSteps; step += 1) {
    const visibleBlocks = await collectVisibleLarkBlocksWithResolvedImages(doc, win, options);

    visibleBlocks.forEach((block) => {
      blocksById.set(block.id, block);
    });

    if (!scrollContainer || scrollContainer.scrollHeight <= scrollContainer.clientHeight) {
      break;
    }

    const maxScrollTop = scrollContainer.scrollHeight - scrollContainer.clientHeight;
    const currentScrollTop = scrollContainer.scrollTop;
    const nextScrollTop = Math.min(
      maxScrollTop,
      currentScrollTop + Math.max(scrollContainer.clientHeight * 0.55, 420),
    );

    if (nextScrollTop <= currentScrollTop || currentScrollTop >= maxScrollTop - 8) {
      break;
    }

    scrollContainer.scrollTop = nextScrollTop;
    scrollContainer.dispatchEvent(new Event('scroll', { bubbles: false }));
    await waitForRender(waitMs);
  }

  if (scrollContainer) {
    scrollContainer.scrollTop = originalScrollTop;
  }

  return {
    title: getLarkDocumentTitle(doc),
    sourceUrl,
    blocks: Array.from(blocksById.values()),
  };
}

async function collectVisibleLarkBlocksWithResolvedImages(
  doc: Document,
  win: Window,
  options: Pick<BytetechCollectOptions, 'preserveMarkdownLinks'> = {},
): Promise<BytetechArticleBlock[]> {
  const blocks = getRenderableArticleBlocks(collectVisibleLarkBlocks(doc, options));

  if (!BYTE_TECH_IMAGE_CLIPPING_ENABLED) {
    return blocks;
  }

  return Promise.all(
    blocks.map(async (block) => {
      if (block.type !== 'image' || !block.src || !isBlobImageUrl(block.src)) {
        return block;
      }

      const dataUrl = await resolveBlobImageUrl(block.src, win);

      return dataUrl ? { ...block, src: dataUrl } : block;
    }),
  );
}

export function collectVisibleLarkBlocks(
  doc: Document,
  options: Pick<BytetechCollectOptions, 'preserveMarkdownLinks'> = {},
): BytetechArticleBlock[] {
  const blocksById = new Map<string, BytetechArticleBlock>();
  const seenImageUrls = new Set<string>();
  const renderedBlocks = getRenderedLarkBlockElements(doc);
  const entries = [
    ...renderedBlocks.map((element, index) => ({
      element,
      index,
      kind: 'block' as const,
    })),
    ...getStandaloneImageElements(doc).map((element, index) => ({
      element,
      index,
      kind: 'standalone-image' as const,
    })),
  ].sort((left, right) => compareElementOrder(left.element, right.element) || left.index - right.index);

  entries.forEach((entry) => {
    const articleBlocks =
      entry.kind === 'block'
        ? larkBlockToArticleBlocks(entry.element, entry.index, options)
        : standaloneImageElementToArticleBlocks(entry.element, entry.index);

    articleBlocks.forEach((articleBlock) => {
      if (articleBlock.type === 'image') {
        const src = articleBlock.src ?? '';

        if (!src || seenImageUrls.has(src)) {
          return;
        }

        seenImageUrls.add(src);
      }

      blocksById.set(articleBlock.id, articleBlock);
    });
  });

  return Array.from(blocksById.values());
}

export function resetBytetechSourceFrameCollectionForTest(): void {
  sourceFrameCollectionState = null;
}

export function renderBytetechArticlePayload(doc: Document, payload: BytetechArticlePayload): HTMLElement {
  let article = findLightDomMirrorArticle(doc);
  const sourceFrame = findBytetechSourceFrame(doc, payload.sourceUrl);

  if (!article) {
    article = doc.createElement('article');
    article.id = MIRROR_ID;
    const mount = findMirrorMount(doc, sourceFrame);
    mount.host.insertBefore(article, mount.before);
  }

  markSourceFrame(sourceFrame);
  populateMirrorArticle(doc, article, payload);

  return article;
}

export function renderBytetechArticlePayloadInShadowDom(
  doc: Document,
  payload: BytetechArticlePayload,
): HTMLElement | null {
  const sourceFrame = findBytetechSourceFrame(doc, payload.sourceUrl);
  const root = sourceFrame?.getRootNode();

  if (!sourceFrame || !(root instanceof ShadowRoot)) {
    return null;
  }

  let article = root.querySelector<HTMLElement>(`#${MIRROR_ID}`);

  if (!article) {
    article = doc.createElement('article');
    article.id = MIRROR_ID;
    sourceFrame.parentNode?.insertBefore(article, sourceFrame);
  }

  markSourceFrame(sourceFrame);
  populateMirrorArticle(doc, article, payload);
  renderBytetechArticlePayload(doc, payload);
  stampShadowHostForDefuddle(root, article);

  return article;
}

export function installBytetechDefuddleShadowPatch(win: Window = window): void {
  const patchedWindow = win as BytetechPatchedWindow;

  if (patchedWindow[DEFUDDLE_PATCH_FLAG] || !patchedWindow.Element?.prototype?.setAttribute) {
    return;
  }

  patchedWindow[DEFUDDLE_PATCH_FLAG] = true;
  const originalSetAttribute = patchedWindow.Element.prototype.setAttribute;

  patchedWindow.Element.prototype.setAttribute = function patchedSetAttribute(name: string, value: string): void {
    if (name.toLowerCase() === DEFUDDLE_SHADOW_ATTR && this instanceof patchedWindow.HTMLElement) {
      const article = findArticleForDefuddleShadow(this);

      if (article) {
        originalSetAttribute.call(this, name, article.outerHTML);
        return;
      }
    }

    originalSetAttribute.call(this, name, value);
  };
}

export function installBytetechSourceFrameBlobResolver(win: Window = window): void {
  const patchedWindow = win as BytetechPatchedWindow;

  if (patchedWindow[BLOB_RESOLVER_FLAG] || !isBytetechSourceFrameUrl(win.location.href)) {
    return;
  }

  patchedWindow[BLOB_RESOLVER_FLAG] = true;

  win.addEventListener('message', (event) => {
    const message = parseBlobResolverRequest(event.data);

    if (
      event.source !== win ||
      event.origin !== win.location.origin ||
      !message ||
      !isBlobImageUrl(message.src)
    ) {
      return;
    }

    void readBlobImageDataUrl(message.src, win).then((dataUrl) => {
      postBlobResolverResponse(win, {
        id: message.id,
        src: message.src,
        dataUrl,
      });
    });
  });
}

export function normalizeBytetechArticlePayloadForPage(
  doc: Document,
  payload: BytetechArticlePayload,
): BytetechArticlePayload {
  const title = getBytetechPageTitle(doc, payload.title);

  if (title === payload.title) {
    return payload;
  }

  return {
    ...payload,
    title,
  };
}

export function restoreBytetechEnhancement(doc: Document = document): void {
  const articles = queryDeep<HTMLElement>(doc, `#${MIRROR_ID}`);

  if (articles.length === 0) {
    return;
  }

  restoreSourceFrameAttributes(doc);
  articles.forEach((article) => {
    article.remove();
  });
}

export function postBytetechMainWorldRestore(win: Window = window): void {
  if (!isBytetechArticleUrl(win.location.href)) {
    return;
  }

  postBytetechMainWorldMessage(win, {
    source: MAIN_WORLD_MESSAGE_SOURCE,
    type: 'restore',
  });
}

export function parseBytetechMainWorldMessage(value: unknown): BytetechMainWorldMessage | null {
  if (!isRecord(value) || value.source !== MAIN_WORLD_MESSAGE_SOURCE) {
    return null;
  }

  if (value.type === 'restore') {
    return value as BytetechMainWorldMessage;
  }

  if (value.type === 'render' && isArticlePayload(value.payload)) {
    return value as BytetechMainWorldMessage;
  }

  return null;
}

function postBytetechMainWorldRender(win: Window, payload: BytetechArticlePayload): void {
  postBytetechMainWorldMessage(win, {
    source: MAIN_WORLD_MESSAGE_SOURCE,
    type: 'render',
    payload,
  });
}

function postBytetechMainWorldMessage(win: Window, message: BytetechMainWorldMessage): void {
  try {
    win.postMessage(message, win.location.origin);
  } catch {
    win.postMessage(message, '*');
  }
}

function populateMirrorArticle(doc: Document, article: HTMLElement, payload: BytetechArticlePayload): void {
  const renderableBlocks = getRenderableArticleBlocks(payload.blocks);

  article.setAttribute(ENHANCED_ATTR, 'bytetech');
  article.setAttribute(SOURCE_URL_ATTR, payload.sourceUrl);
  article.setAttribute(BLOCK_COUNT_ATTR, String(renderableBlocks.length));
  article.setAttribute('class', 'article-content');
  article.setAttribute('role', 'article');
  article.setAttribute('style', MIRROR_STYLE);
  article.replaceChildren();

  if (payload.title) {
    const title = doc.createElement('h1');
    title.textContent = payload.title;
    article.appendChild(title);
  }

  renderableBlocks.forEach((block) => {
    const element = createArticleBlockElement(doc, block);

    if (element) {
      article.appendChild(element);
    }
  });
}

function getRenderableArticleBlocks(blocks: BytetechArticleBlock[]): BytetechArticleBlock[] {
  return BYTE_TECH_IMAGE_CLIPPING_ENABLED ? blocks : blocks.filter((block) => block.type !== 'image');
}

function mergeSourceFrameBlocks(
  sourceUrl: string,
  title: string,
  blocks: BytetechArticleBlock[],
  options: { preferBatchOrder?: boolean } = {},
): BytetechArticlePayload {
  const state = getSourceFrameCollectionState(sourceUrl);
  const incomingIds: string[] = [];
  const incomingIdSet = new Set<string>();

  blocks.forEach((block) => {
    if (!block.id) {
      return;
    }

    state.blocksById.set(block.id, block);

    if (!incomingIdSet.has(block.id)) {
      incomingIdSet.add(block.id);
      incomingIds.push(block.id);
    }
  });

  if (options.preferBatchOrder && incomingIds.length > 0) {
    state.blockOrder = [
      ...incomingIds,
      ...state.blockOrder.filter((id) => !incomingIdSet.has(id) && state.blocksById.has(id)),
    ];
  } else {
    state.blockOrder = mergeBlockOrderWithAnchors(
      state.blockOrder.filter((id) => state.blocksById.has(id)),
      incomingIds,
    );
  }

  return {
    title,
    sourceUrl,
    blocks: state.blockOrder
      .map((id) => state.blocksById.get(id))
      .filter((block): block is BytetechArticleBlock => Boolean(block)),
  };
}

function mergeBlockOrderWithAnchors(existingOrder: string[], incomingIds: string[]): string[] {
  const mergedOrder = [...existingOrder];
  let cursor: number | null = null;

  incomingIds.forEach((id, index) => {
    const existingIndex = mergedOrder.indexOf(id);

    if (existingIndex >= 0) {
      cursor = existingIndex + 1;
      return;
    }

    const nextKnownId = incomingIds.slice(index + 1).find((nextId) => mergedOrder.includes(nextId));
    const insertIndex =
      cursor ??
      (nextKnownId
        ? mergedOrder.indexOf(nextKnownId)
        : mergedOrder.length);

    mergedOrder.splice(Math.max(insertIndex, 0), 0, id);
    cursor = Math.max(insertIndex, 0) + 1;
  });

  return mergedOrder;
}

function getSourceFrameCollectionState(sourceUrl: string): NonNullable<typeof sourceFrameCollectionState> {
  if (!sourceFrameCollectionState || sourceFrameCollectionState.sourceUrl !== sourceUrl) {
    sourceFrameCollectionState = {
      sourceUrl,
      blocksById: new Map<string, BytetechArticleBlock>(),
      blockOrder: [],
    };
  }

  return sourceFrameCollectionState;
}

function getRenderedLarkBlockElements(doc: Document): HTMLElement[] {
  return queryDeep<HTMLElement>(doc, LARK_BLOCK_SELECTOR).filter((block) => {
    if (!isLikelyArticleBlock(block)) {
      return false;
    }

    if (block.classList.contains('docx-page-block')) {
      return false;
    }

    const parentBlock = block.parentElement?.closest<HTMLElement>(LARK_BLOCK_SELECTOR);

    return (
      !parentBlock ||
      parentBlock === block ||
      !isLikelyArticleBlock(parentBlock) ||
      parentBlock.classList.contains('docx-page-block')
    );
  });
}

function isLikelyArticleBlock(block: HTMLElement): boolean {
  if (
    block.matches('.render-unit-wrapper .block, .root-render-unit-container .block') ||
    block.getAttribute('data-block-type')
  ) {
    return true;
  }

  return /docx-[\w-]+-block/.test(block.className);
}

function getDeepElements(doc: Document, selector: string): HTMLElement[] {
  return queryDeep<HTMLElement>(doc, selector);
}

function getDeepElement(doc: Document, selector: string): HTMLElement | null {
  return getDeepElements(doc, selector)[0] ?? null;
}

function larkBlockToArticleBlocks(
  block: HTMLElement,
  fallbackIndex = 0,
  options: Pick<BytetechCollectOptions, 'preserveMarkdownLinks'> = {},
): BytetechArticleBlock[] {
  const blockType = block.getAttribute('data-block-type') ?? '';
  const rawText = getCleanText(block);
  const images = getMeaningfulImages(block, blockType, rawText);
  const shouldPreserveMarkdownLinks = options.preserveMarkdownLinks && !isCodeBlock(block, blockType);
  const rawContent = shouldPreserveMarkdownLinks ? collectMarkdownInlineContent(block) : [];
  const text = getContentText(
    shouldPreserveMarkdownLinks ? getMarkdownInlineContentText(rawContent) : rawText,
  );
  const content = getContentAwareInlineContent(rawContent, text);

  if (!text && images.length === 0) {
    return [];
  }

  const blockId = getBlockId(block, fallbackIndex);
  const imageBlocks = images.map((image, index) => ({
    id: `${blockId}:image:${index}:${image.src}`,
    type: 'image' as const,
    src: image.src,
    alt: image.alt,
    width: image.width,
    height: image.height,
  }));

  if (images.length > 0) {
    if (!text || isImageBlock(block, blockType)) {
      return text
        ? [
            ...imageBlocks,
            {
              id: `${blockId}:caption`,
              type: 'paragraph',
              text,
              ...(content.length > 0 ? { content } : {}),
            },
          ]
        : imageBlocks;
    }

    return [
      {
        id: blockId,
        type: 'paragraph',
        text,
        ...(content.length > 0 ? { content } : {}),
      },
      ...imageBlocks,
    ];
  }

  if (blockType.startsWith('heading') || /docx-heading\d-block/.test(block.className)) {
    return [
      {
        id: blockId,
        type: 'heading',
        level: getHeadingLevel(blockType, block.className),
        text,
        ...(content.length > 0 ? { content } : {}),
      },
    ];
  }

  if (blockType === 'quote' || block.classList.contains('docx-quote-block')) {
    return [
      {
        id: blockId,
        type: 'quote',
        text,
        ...(content.length > 0 ? { content } : {}),
      },
    ];
  }

  if (isCodeBlock(block, blockType)) {
    return [
      {
        id: blockId,
        type: 'code',
        text,
      },
    ];
  }

  return [
    {
      id: blockId,
      type: 'paragraph',
      text,
      ...(content.length > 0 ? { content } : {}),
    },
  ];
}

function getContentAwareInlineContent(
  content: MarkdownInlineContent[],
  normalizedText: string,
): MarkdownInlineContent[] {
  if (content.length === 0) {
    return [];
  }

  return getMarkdownInlineContentText(content) === normalizedText
    ? content
    : [{ type: 'text', text: normalizedText }];
}

function getContentText(text: string): string {
  let contentText = text;

  NON_CONTENT_IMAGE_TEXT.forEach((placeholder) => {
    contentText = contentText.replaceAll(placeholder, ' ');
  });

  return cleanText(contentText);
}

function isImageBlock(block: HTMLElement, blockType: string): boolean {
  return (
    blockType === 'image' ||
    blockType === 'file' ||
    block.className.includes('image') ||
    block.className.includes('attachment') ||
    block.className.includes('file')
  );
}

function isCodeBlock(block: HTMLElement, blockType: string): boolean {
  return blockType === 'code' || block.className.includes('code');
}

function getMeaningfulImages(
  block: HTMLElement,
  blockType: string,
  blockText: string,
): BytetechArticleBlock[] {
  const isPlaceholderBlock = hasNonContentImageText(blockText);
  const isLikelyImageBlock = isImageBlock(block, blockType) || isPlaceholderBlock;
  const images = [
    ...getImageCandidates(block),
    ...(isLikelyImageBlock ? getRelatedImageCandidates(block) : []),
  ];

  const seenUrls = new Set<string>();

  return images.filter((image) => {
    const src = image.src ?? '';

    if (
      !isUsableImageUrl(src) ||
      seenUrls.has(src) ||
      isDecorativeLarkImageUrl(src) ||
      isLikelyAvatarImage(image) ||
      (!isLikelyImageBlock && !hasMeaningfulImageSize(image))
    ) {
      return false;
    }

    seenUrls.add(src);
    return true;
  });
}

function getImageCandidates(block: HTMLElement): BytetechArticleBlock[] {
  return getImageCandidatesFromElements([block, ...queryDeep<Element>(block, '*')]);
}

function getStandaloneImageElements(doc: Document): Element[] {
  const roots = getStandaloneImageSearchRoots(doc);

  return Array.from(new Set(roots.flatMap((root) => queryDeep<Element>(root, IMAGE_CANDIDATE_SELECTOR)))).filter((element) => {
    if (element.closest(`#${MIRROR_ID}`)) {
      return false;
    }

    return getImageCandidatesFromElements([element]).some((image) => {
      return (
        isUsableImageUrl(image.src ?? '') &&
        !isDecorativeLarkImageUrl(image.src ?? '') &&
        !isLikelyAvatarImage(image) &&
        hasMeaningfulImageSize(image)
      );
    });
  });
}

function getStandaloneImageSearchRoots(doc: Document): ParentNode[] {
  const renderedBlocks = getRenderedLarkBlockElements(doc);
  const roots = renderedBlocks
    .map((block) => getLarkRenderRoot(block))
    .filter((root): root is ParentNode => Boolean(root));

  return roots.length > 0 ? Array.from(new Set(roots)) : [doc];
}

function getLarkRenderRoot(block: HTMLElement): ParentNode | null {
  return (
    block.closest<HTMLElement>('.render-unit-wrapper, .root-render-unit-container, .bear-web-x-container') ??
    block.parentElement
  );
}

function standaloneImageElementToArticleBlocks(element: Element, fallbackIndex: number): BytetechArticleBlock[] {
  const positionKey = element instanceof HTMLElement ? getBlockPositionKey(element) : '';
  const imageId = `standalone-image:${positionKey || fallbackIndex}`;
  const seenUrls = new Set<string>();

  return getImageCandidatesFromElements([element, ...queryDeep<Element>(element, '*')])
    .filter((image) => {
      const src = image.src ?? '';

      if (
        !isUsableImageUrl(src) ||
        seenUrls.has(src) ||
        isDecorativeLarkImageUrl(src) ||
        isLikelyAvatarImage(image) ||
        !hasMeaningfulImageSize(image)
      ) {
        return false;
      }

      seenUrls.add(src);
      return true;
    })
    .map((image, index) => ({
      id: `${imageId}:image:${index}:${image.src}`,
      type: 'image' as const,
      src: image.src,
      alt: image.alt,
      width: image.width,
      height: image.height,
    }));
}

function compareElementOrder(left: Element, right: Element): number {
  if (left === right) {
    return 0;
  }

  const position = left.compareDocumentPosition(right);

  if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
    return -1;
  }

  if (position & Node.DOCUMENT_POSITION_PRECEDING) {
    return 1;
  }

  return 0;
}

function getRelatedImageCandidates(block: HTMLElement): BytetechArticleBlock[] {
  const roots = new Set<Element>();

  getSiblingElements(block).forEach((element) => {
    roots.add(element);
    queryDeep<Element>(element, IMAGE_CANDIDATE_SELECTOR).forEach((candidate) => {
      roots.add(candidate);
    });
  });

  getNearbyImageElements(block).forEach((element) => {
    roots.add(element);
  });

  roots.delete(block);

  return getImageCandidatesFromElements(
    Array.from(roots).filter((element) => !block.contains(element) && !element.contains(block)),
  );
}

function getImageCandidatesFromElements(elements: Element[]): BytetechArticleBlock[] {
  const candidates: BytetechArticleBlock[] = [];

  elements.forEach((element) => {
    getElementImageSources(element).forEach((src) => {
      candidates.push({
        id: '',
        type: 'image',
        src,
        alt: getImageAlt(element),
        width: getElementDimension(element, 'width'),
        height: getElementDimension(element, 'height'),
      });
    });
  });

  return candidates;
}

function getSiblingElements(block: HTMLElement): Element[] {
  const siblings: Element[] = [];
  let previous = block.previousElementSibling;
  let next = block.nextElementSibling;

  for (let index = 0; index < RELATED_IMAGE_SIBLING_LIMIT && previous; index += 1) {
    siblings.unshift(previous);
    previous = previous.previousElementSibling;
  }

  for (let index = 0; index < RELATED_IMAGE_SIBLING_LIMIT && next; index += 1) {
    siblings.push(next);
    next = next.nextElementSibling;
  }

  return siblings;
}

function getNearbyImageElements(block: HTMLElement): Element[] {
  const blockRect = block.getBoundingClientRect();

  if (!hasUsableRect(blockRect)) {
    return [];
  }

  return queryDeep<Element>(block.ownerDocument, IMAGE_CANDIDATE_SELECTOR).filter((element) => {
    if (element === block || block.contains(element) || element.contains(block)) {
      return false;
    }

    const rect = element.getBoundingClientRect();

    if (!hasUsableRect(rect)) {
      return false;
    }

    return getVerticalGap(blockRect, rect) <= NEARBY_IMAGE_VERTICAL_GAP;
  });
}

function hasUsableRect(rect: DOMRect): boolean {
  return rect.width > 0 || rect.height > 0;
}

function getVerticalGap(left: DOMRect, right: DOMRect): number {
  if (right.bottom < left.top) {
    return left.top - right.bottom;
  }

  if (right.top > left.bottom) {
    return right.top - left.bottom;
  }

  return 0;
}

function getElementImageSources(element: Element): string[] {
  const sources: string[] = [];

  if (element instanceof HTMLImageElement) {
    sources.push(element.currentSrc);
    sources.push(...getAttributeImageUrls(element, 'src'));
    sources.push(...getAttributeImageUrls(element, 'srcset'));
  }

  if (element instanceof HTMLSourceElement) {
    sources.push(...getAttributeImageUrls(element, 'srcset'));
  }

  Array.from(element.attributes).forEach((attribute) => {
    if (shouldReadImageAttribute(attribute.name, attribute.value)) {
      sources.push(...getAttributeImageUrls(element, attribute.name));
    }
  });

  if (element instanceof HTMLElement) {
    sources.push(...extractImageUrls(element.getAttribute('style') ?? ''));

    Array.from(element.style).forEach((propertyName) => {
      sources.push(...extractImageUrls(element.style.getPropertyValue(propertyName)));
    });

    sources.push(...extractCssImageUrls(element.style.backgroundImage));
    sources.push(...extractCssImageUrls(element.style.background));

    const computedStyle = getComputedStyleSafely(element);

    if (computedStyle) {
      sources.push(...extractCssImageUrls(computedStyle.backgroundImage));
      sources.push(...extractCssImageUrls(computedStyle.background));
    }
  }

  return sources.map(normalizeImageUrl).filter(isUsableImageUrl);
}

function shouldReadImageAttribute(name: string, value: string): boolean {
  return IMAGE_URL_ATTRIBUTE_NAMES.has(name) || IMAGE_URL_ATTRIBUTE_PATTERN.test(name) || IMAGE_URL_ATTRIBUTE_PATTERN.test(value);
}

function getAttributeImageUrls(element: Element, attributeName: string): string[] {
  const value = element.getAttribute(attributeName);

  if (!value) {
    return [];
  }

  if (attributeName.toLowerCase().includes('srcset')) {
    return getSrcsetUrls(value);
  }

  return extractImageUrls(value);
}

function getSrcsetUrls(srcset: string): string[] {
  return srcset
    .split(',')
    .map((item) => item.trim().split(/\s+/)[0] ?? '')
    .filter(Boolean);
}

function extractImageUrls(value: string): string[] {
  const decodedValue = decodeHtmlEntities(value);

  return [
    ...extractCssImageUrls(decodedValue),
    ...getSrcsetUrls(decodedValue),
    ...extractHttpImageUrls(decodedValue),
    decodedValue,
  ];
}

function extractHttpImageUrls(value: string): string[] {
  return Array.from(value.matchAll(/(^|[^:\w+.-])(https?:\/\/[^\s"'<>\\)]+)/g)).map((match) => match[2] ?? '');
}

function extractCssImageUrls(backgroundImage: string): string[] {
  return Array.from(backgroundImage.matchAll(/url\((['"]?)(.*?)\1\)/g)).map((match) => match[2] ?? '');
}

function isUsableImageUrl(src: string): boolean {
  const normalizedSrc = normalizeImageUrl(src);

  return Boolean(
    normalizedSrc &&
      (/^https?:\/\//i.test(normalizedSrc) || isBlobImageUrl(normalizedSrc)) &&
      !normalizedSrc.startsWith('data:'),
  );
}

function normalizeImageUrl(src: string): string {
  const normalizedSrc = src.trim().replace(/&amp;/g, '&');

  return normalizedSrc.startsWith('//') ? `https:${normalizedSrc}` : normalizedSrc;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function hasNonContentImageText(text: string): boolean {
  return Array.from(NON_CONTENT_IMAGE_TEXT).some((placeholder) => text.includes(placeholder));
}

function isBlobImageUrl(src: string): boolean {
  return /^blob:/i.test(normalizeImageUrl(src));
}

async function resolveBlobImageUrl(src: string, win: Window): Promise<string> {
  const normalizedSrc = normalizeImageUrl(src);

  if (!blobImageDataUrlCache.has(normalizedSrc)) {
    blobImageDataUrlCache.set(normalizedSrc, readBlobImageDataUrlWithMainWorldFallback(normalizedSrc, win));
  }

  return blobImageDataUrlCache.get(normalizedSrc) ?? '';
}

async function readBlobImageDataUrlWithMainWorldFallback(src: string, win: Window): Promise<string> {
  const directDataUrl = await readBlobImageDataUrl(src, win);

  return directDataUrl || requestMainWorldBlobImageDataUrl(src, win);
}

async function readBlobImageDataUrl(src: string, win: Window): Promise<string> {
  try {
    const response = await win.fetch(src);

    if (!response.ok) {
      return '';
    }

    const blob = await response.blob();

    if (blob.type && !blob.type.startsWith('image/')) {
      return '';
    }

    return await blobToDataUrl(blob);
  } catch {
    return '';
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  if (blob.size > Math.floor(MAX_INLINE_IMAGE_DATA_URL_LENGTH * 0.72)) {
    return Promise.resolve('');
  }

  return new Promise((resolve) => {
    const FileReaderConstructor = globalThis.FileReader;

    if (!FileReaderConstructor) {
      resolve('');
      return;
    }

    const reader = new FileReaderConstructor();

    reader.addEventListener('loadend', () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.length <= MAX_INLINE_IMAGE_DATA_URL_LENGTH ? result : '');
    });
    reader.addEventListener('error', () => {
      resolve('');
    });
    reader.readAsDataURL(blob);
  });
}

function requestMainWorldBlobImageDataUrl(src: string, win: Window): Promise<string> {
  if (!isBytetechSourceFrameUrl(win.location.href)) {
    return Promise.resolve('');
  }

  return new Promise((resolve) => {
    const id = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const timeoutId = win.setTimeout(() => {
      cleanup();
      resolve('');
    }, 3000);

    function cleanup(): void {
      win.clearTimeout(timeoutId);
      win.removeEventListener('message', handleMessage);
    }

    function handleMessage(event: MessageEvent): void {
      if (event.source !== win || event.origin !== win.location.origin) {
        return;
      }

      const message = parseBlobResolverResponse(event.data);

      if (!message || message.id !== id || message.src !== src) {
        return;
      }

      cleanup();
      resolve(message.dataUrl);
    }

    win.addEventListener('message', handleMessage);
    postBlobResolverRequest(win, { id, src });
  });
}

function postBlobResolverRequest(win: Window, message: Pick<BlobResolverRequestMessage, 'id' | 'src'>): void {
  win.postMessage(
    {
      source: BLOB_RESOLVER_MESSAGE_SOURCE,
      type: 'resolve',
      id: message.id,
      src: message.src,
    } satisfies BlobResolverRequestMessage,
    win.location.origin,
  );
}

function postBlobResolverResponse(win: Window, message: Pick<BlobResolverResponseMessage, 'id' | 'src' | 'dataUrl'>): void {
  win.postMessage(
    {
      source: BLOB_RESOLVER_MESSAGE_SOURCE,
      type: 'resolved',
      id: message.id,
      src: message.src,
      dataUrl: message.dataUrl,
    } satisfies BlobResolverResponseMessage,
    win.location.origin,
  );
}

function parseBlobResolverRequest(value: unknown): BlobResolverRequestMessage | null {
  if (
    isRecord(value) &&
    value.source === BLOB_RESOLVER_MESSAGE_SOURCE &&
    value.type === 'resolve' &&
    typeof value.id === 'string' &&
    typeof value.src === 'string'
  ) {
    return value as unknown as BlobResolverRequestMessage;
  }

  return null;
}

function parseBlobResolverResponse(value: unknown): BlobResolverResponseMessage | null {
  if (
    isRecord(value) &&
    value.source === BLOB_RESOLVER_MESSAGE_SOURCE &&
    value.type === 'resolved' &&
    typeof value.id === 'string' &&
    typeof value.src === 'string' &&
    typeof value.dataUrl === 'string'
  ) {
    return value as unknown as BlobResolverResponseMessage;
  }

  return null;
}

function getImageAlt(element: Element): string {
  return (
    element.getAttribute('alt')?.trim() ||
    element.getAttribute('aria-label')?.trim() ||
    element.getAttribute('title')?.trim() ||
    ''
  );
}

function getElementDimension(element: Element, dimension: 'width' | 'height'): string {
  const attributeValue = element.getAttribute(dimension) || element.getAttribute(`data-${dimension}`);

  if (attributeValue) {
    return attributeValue;
  }

  if (element instanceof HTMLImageElement) {
    const naturalValue = dimension === 'width' ? element.naturalWidth : element.naturalHeight;

    if (naturalValue) {
      return String(naturalValue);
    }
  }

  if (element instanceof HTMLElement) {
    const inlineValue = element.style[dimension];

    if (inlineValue) {
      return inlineValue;
    }

    const computedValue = getComputedStyleSafely(element)?.[dimension];

    if (computedValue && computedValue !== 'auto') {
      return computedValue;
    }

    const rect = element.getBoundingClientRect();
    const rectValue = dimension === 'width' ? rect.width : rect.height;

    if (rectValue) {
      return String(Math.round(rectValue));
    }
  }

  return '';
}

function getComputedStyleSafely(element: HTMLElement): CSSStyleDeclaration | null {
  try {
    return element.ownerDocument.defaultView?.getComputedStyle(element) ?? null;
  } catch {
    return null;
  }
}

function hasMeaningfulImageSize(image: BytetechArticleBlock): boolean {
  const width = getNumericDimension(image.width) ?? getImageSizeFromUrl(image.src ?? '')?.width;
  const height = getNumericDimension(image.height) ?? getImageSizeFromUrl(image.src ?? '')?.height;
  const largestSide = Math.max(width ?? 0, height ?? 0);

  return largestSide >= MIN_MEANINGFUL_IMAGE_SIZE;
}

function isLikelyAvatarImage(image: BytetechArticleBlock): boolean {
  const url = image.src ?? '';
  const imageSize = getImageSizeFromUrl(url);
  const largestUrlSide = Math.max(imageSize?.width ?? 0, imageSize?.height ?? 0);

  if (/cut_type=default-face|sticker_format=|avatar|user_avatar/i.test(url)) {
    return true;
  }

  if (largestUrlSide > 0 && largestUrlSide <= AVATAR_IMAGE_SIZE_LIMIT) {
    return true;
  }

  const largestElementSide = Math.max(getNumericDimension(image.width) ?? 0, getNumericDimension(image.height) ?? 0);

  return largestElementSide > 0 && largestElementSide <= AVATAR_IMAGE_SIZE_LIMIT;
}

function isDecorativeLarkImageUrl(src: string): boolean {
  const normalizedSrc = normalizeImageUrl(src);

  return DECORATIVE_LARK_IMAGE_URL_PATTERN.test(normalizedSrc);
}

function getNumericDimension(value: string | undefined): number | null {
  const match = value?.match(/\d+(?:\.\d+)?/);
  const numberValue = Number.parseFloat(match?.[0] ?? '');

  return Number.isFinite(numberValue) ? numberValue : null;
}

function getImageSizeFromUrl(src: string): { width: number; height: number } | null {
  try {
    const parsedUrl = new URL(src);
    const imageSize = parsedUrl.searchParams.get('image_size') ?? '';
    const match = imageSize.match(/^(\d+)x(\d+)$/);

    if (!match) {
      return null;
    }

    return {
      width: Number.parseInt(match[1] ?? '0', 10),
      height: Number.parseInt(match[2] ?? '0', 10),
    };
  } catch {
    return null;
  }
}

function createArticleBlockElement(doc: Document, block: BytetechArticleBlock): HTMLElement | null {
  if (block.type === 'image') {
    if (!block.src) {
      return null;
    }

    const paragraph = doc.createElement('p');
    const image = doc.createElement('img');
    image.src = block.src;
    image.alt = block.alt ?? '';

    if (block.width) {
      image.setAttribute('width', block.width);
    }

    if (block.height) {
      image.setAttribute('height', block.height);
    }

    paragraph.appendChild(image);
    return paragraph;
  }

  const text = block.text?.trim() ?? '';

  if (!text) {
    return null;
  }

  if (block.type === 'heading') {
    const level = Math.min(Math.max(block.level ?? 2, 1), 6);
    const heading = doc.createElement(`h${level}`);
    appendArticleBlockContent(doc, heading, block, text);
    return heading;
  }

  if (block.type === 'quote') {
    const quote = doc.createElement('blockquote');
    const paragraph = doc.createElement('p');
    appendArticleBlockContent(doc, paragraph, block, text);
    quote.appendChild(paragraph);
    return quote;
  }

  if (block.type === 'code') {
    const pre = doc.createElement('pre');
    const code = doc.createElement('code');
    code.textContent = text;
    pre.appendChild(code);
    return pre;
  }

  const paragraph = doc.createElement('p');
  appendArticleBlockContent(doc, paragraph, block, text);
  return paragraph;
}

function appendArticleBlockContent(
  doc: Document,
  element: HTMLElement,
  block: BytetechArticleBlock,
  fallbackText: string,
): void {
  if (block.content?.length) {
    appendMarkdownInlineContent(doc, element, block.content);
    return;
  }

  element.textContent = fallbackText;
}

function findBytetechSourceFrame(doc: Document, sourceUrl: string): HTMLIFrameElement | null {
  const sourceToken = getLarkDocumentToken(sourceUrl);

  if (!sourceToken) {
    return null;
  }

  return (
    queryDeep<HTMLIFrameElement>(doc, 'iframe').find((frame) => {
      return getLarkDocumentToken(frame.src) === sourceToken;
    }) ?? null
  );
}

function findMirrorArticle(doc: Document): HTMLElement | null {
  return queryDeep<HTMLElement>(doc, `#${MIRROR_ID}`)[0] ?? null;
}

function findLightDomMirrorArticle(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>(`#${MIRROR_ID}`);
}

function findMirrorMount(
  doc: Document,
  sourceFrame: HTMLIFrameElement | null,
): { host: ParentNode; before: ChildNode | null } {
  const root = sourceFrame?.getRootNode();

  if (root instanceof ShadowRoot && root.host instanceof HTMLElement) {
    const hostElement = root.host;
    const container =
      hostElement.closest<HTMLElement>('[class*="_doc-component-container"], [class*="_article-detail-left"]') ??
      hostElement.parentElement;

    if (container) {
      return {
        host: container,
        before: hostElement,
      };
    }
  }

  if (sourceFrame?.parentElement && sourceFrame.getRootNode() === doc) {
    return {
      host: sourceFrame.parentElement,
      before: sourceFrame,
    };
  }

  const fallbackHost = doc.querySelector('main') ?? doc.body;

  return {
    host: fallbackHost,
    before: fallbackHost.firstChild,
  };
}

function markSourceFrame(frame: HTMLIFrameElement | null): void {
  if (!frame) {
    return;
  }

  if (!frame.hasAttribute(ORIGINAL_FRAME_ARIA_HIDDEN_ATTR)) {
    frame.setAttribute(ORIGINAL_FRAME_ARIA_HIDDEN_ATTR, frame.getAttribute('aria-hidden') ?? '');
  }

  frame.setAttribute(SOURCE_FRAME_ATTR, 'true');
  frame.setAttribute('aria-hidden', 'true');
}

function stampShadowHostForDefuddle(root: ShadowRoot, article: HTMLElement): void {
  if (!(root.host instanceof HTMLElement)) {
    return;
  }

  // Obsidian Web Clipper reads this attribute when its isolated content script
  // cannot traverse a page's open shadowRoot. Its own main-world flattener will
  // overwrite the attribute later, but the shadowRoot now contains this mirror.
  root.host.setAttribute(DEFUDDLE_SHADOW_ATTR, getDefuddleShadowHtml(article));
}

function getDefuddleShadowHtml(article: HTMLElement): string {
  const clone = article.cloneNode(true) as HTMLElement;

  clone.querySelectorAll<HTMLImageElement>('img[src^="data:image/"]').forEach((image) => {
    image.removeAttribute('src');
    image.setAttribute('data-obsidian-clipper-extended-omitted-src', 'inline-image');
  });

  return clone.outerHTML;
}

function restoreSourceFrameAttributes(doc: Document): void {
  queryDeep<HTMLIFrameElement>(doc, `iframe[${SOURCE_FRAME_ATTR}]`).forEach((frame) => {
    const originalAriaHidden = frame.getAttribute(ORIGINAL_FRAME_ARIA_HIDDEN_ATTR);

    if (originalAriaHidden) {
      frame.setAttribute('aria-hidden', originalAriaHidden);
    } else {
      frame.removeAttribute('aria-hidden');
    }

    frame.removeAttribute(SOURCE_FRAME_ATTR);
    frame.removeAttribute(ORIGINAL_FRAME_ARIA_HIDDEN_ATTR);
  });

  queryDeep<HTMLElement>(doc, `[${DEFUDDLE_SHADOW_ATTR}]`).forEach((host) => {
    host.removeAttribute(DEFUDDLE_SHADOW_ATTR);
  });
}

function findArticleForDefuddleShadow(host: HTMLElement): HTMLElement | null {
  if (!isBytetechDocumentShadowHost(host)) {
    return null;
  }

  const candidates = [
    host.shadowRoot?.querySelector<HTMLElement>(`#${MIRROR_ID}`) ?? null,
    host.ownerDocument.querySelector<HTMLElement>(`#${MIRROR_ID}`),
  ].filter((article): article is HTMLElement => {
    return Boolean(article && article.textContent?.trim());
  });

  return candidates.sort((left, right) => getMirrorBlockCount(right) - getMirrorBlockCount(left))[0] ?? null;
}

function isBytetechDocumentShadowHost(host: HTMLElement): boolean {
  return Boolean(
    host.shadowRoot?.querySelector(
      `#${MIRROR_ID}, iframe[${SOURCE_FRAME_ATTR}], iframe[src*=".larkoffice.com/docx/"]`,
    ),
  );
}

function getMirrorBlockCount(article: HTMLElement): number {
  return Number.parseInt(article.getAttribute(BLOCK_COUNT_ATTR) ?? '0', 10) || 0;
}

function findLarkScrollContainer(doc: Document): HTMLElement | null {
  const renderedBlocks = getRenderedLarkBlockElements(doc);
  const renderedBlockAncestors = renderedBlocks.flatMap((block) => getScrollableAncestors(block));
  const ancestorCandidate = chooseBestScrollContainer(renderedBlockAncestors);

  if (ancestorCandidate) {
    return ancestorCandidate;
  }

  const preferred = getDeepElement(doc, '.bear-web-x-container');

  if (isScrollable(preferred)) {
    return preferred;
  }

  const renderRootCandidates = getDeepElements(doc, '.render-unit-wrapper, .root-render-unit-container').flatMap((root) =>
    getScrollableAncestors(root),
  );

  return chooseBestScrollContainer(renderRootCandidates) ?? chooseBestScrollContainer(getDeepElements(doc, 'body *'));
}

function isScrollable(element: HTMLElement | null): element is HTMLElement {
  return Boolean(element && getScrollRange(element) > 200);
}

function getScrollableAncestors(element: HTMLElement): HTMLElement[] {
  const ancestors: HTMLElement[] = [];
  let current = element.parentElement;

  while (current) {
    if (isScrollable(current)) {
      ancestors.push(current);
    }

    current = current.parentElement;
  }

  return ancestors;
}

function chooseBestScrollContainer(candidates: Iterable<HTMLElement>): HTMLElement | null {
  const uniqueCandidates = Array.from(new Set(candidates)).filter(isScrollable);

  return (
    uniqueCandidates.sort((left, right) => {
      const rightBlockCount = queryDeep<HTMLElement>(right, LARK_BLOCK_SELECTOR).length;
      const leftBlockCount = queryDeep<HTMLElement>(left, LARK_BLOCK_SELECTOR).length;

      return rightBlockCount - leftBlockCount || getScrollRange(right) - getScrollRange(left);
    })[0] ?? null
  );
}

function getScrollRange(element: HTMLElement): number {
  return Math.max(element.scrollHeight - element.clientHeight, element.scrollWidth - element.clientWidth);
}

function getBlockId(block: HTMLElement, fallbackIndex: number): string {
  const explicitId = block.getAttribute('data-record-id') || block.getAttribute('data-block-id');

  if (explicitId) {
    return explicitId;
  }

  const positionKey = getBlockPositionKey(block);

  return (
    `${block.getAttribute('data-block-type') ?? 'block'}:${positionKey || fallbackIndex}:${getCleanText(block)}`
  );
}

function getBlockPositionKey(block: HTMLElement): string {
  const attributeValue =
    block.getAttribute('data-index') ||
    block.getAttribute('data-block-index') ||
    block.getAttribute('aria-posinset');

  if (attributeValue) {
    return attributeValue;
  }

  const styleTop = block.style.top || block.style.insetBlockStart;

  if (styleTop) {
    return styleTop;
  }

  const transformMatch = block.style.transform.match(/translate(?:3d|Y)?\([^,\d-]*(-?\d+(?:\.\d+)?)/);

  return transformMatch?.[1] ?? '';
}

function getHeadingLevel(blockType: string, className: string): number {
  const typeMatch = blockType.match(/^heading(\d)$/);
  const classMatch = className.match(/docx-heading(\d)-block/);
  const level = Number.parseInt(typeMatch?.[1] ?? classMatch?.[1] ?? '2', 10);

  return Number.isFinite(level) ? level : 2;
}

function getLarkDocumentTitle(doc: Document): string {
  return cleanTitle(doc.title || getCleanText(doc.querySelector<HTMLElement>('.doc-title') ?? doc.body));
}

function getBytetechPageTitle(doc: Document, fallbackTitle: string): string {
  const candidates = [
    doc.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content,
    doc.querySelector<HTMLMetaElement>('meta[name="twitter:title"]')?.content,
    doc.title,
    fallbackTitle,
  ];

  return (
    candidates
      .map((candidate) => cleanTitle(candidate ?? ''))
      .find((candidate) => candidate && candidate.toLowerCase() !== 'docs') ??
    cleanTitle(fallbackTitle)
  );
}

function cleanTitle(title: string): string {
  return cleanText(title).replace(/\s+-\s+.*$/, '').trim();
}

function getCleanText(element: Element | null): string {
  return cleanText(element?.textContent ?? '');
}

function cleanText(text: string): string {
  return text
    .replace(/[\u200b-\u200f\u2060-\u206f\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseArticleMessage(value: unknown): BytetechArticleMessage | null {
  if (!isRecord(value) || value.source !== MESSAGE_SOURCE || value.type !== 'article') {
    return null;
  }

  if (!isArticlePayload(value.payload)) {
    return null;
  }

  return value as unknown as BytetechArticleMessage;
}

function isTrustedSourceFrameMessage(origin: string, sourceUrl: string): boolean {
  if (!isBytetechSourceFrameUrl(sourceUrl)) {
    return false;
  }

  return origin === '' || origin === 'null' || isLarkOfficeOrigin(origin);
}

function isArticlePayload(value: unknown): value is BytetechArticlePayload {
  return (
    isRecord(value) &&
    typeof value.sourceUrl === 'string' &&
    typeof value.title === 'string' &&
    Array.isArray(value.blocks)
  );
}

function postArticlePayload(win: Window, doc: Document, payload: BytetechArticlePayload): void {
  if (payload.blocks.length === 0 || !win.parent || win.parent === win) {
    return;
  }

  win.parent.postMessage(
    {
      source: MESSAGE_SOURCE,
      type: 'article',
      payload,
    } satisfies BytetechArticleMessage,
    getTargetOrigin(doc.referrer),
  );
}

async function waitForLarkBlocks(
  doc: Document,
  waitForRender: (milliseconds: number) => Promise<void>,
  waitMs: number,
): Promise<void> {
  for (let attempt = 0; attempt < 50 && getRenderedLarkBlockElements(doc).length === 0; attempt += 1) {
    await waitForRender(Math.max(waitMs, 100));
  }
}

function isExpectedSourceFrame(doc: Document, pageUrl: string, sourceUrl: string): boolean {
  const expectedToken = getBytetechDocumentToken(pageUrl);
  const sourceToken = getLarkDocumentToken(sourceUrl);

  const matchingFrameExists = queryDeep<HTMLIFrameElement>(doc, 'iframe').some((frame) => {
    const frameToken = getLarkDocumentToken(frame.src);
    return frameToken && sourceToken && frameToken === sourceToken;
  });

  if (matchingFrameExists) {
    return true;
  }

  if (expectedToken && sourceToken) {
    return expectedToken === sourceToken;
  }

  return false;
}

function getBytetechDocumentToken(pageUrl: string): string {
  try {
    return new URL(pageUrl).hash.replace(/^#/, '');
  } catch {
    return '';
  }
}

function getLarkDocumentToken(sourceUrl: string): string {
  try {
    const parsedUrl = new URL(sourceUrl);
    const [, token] = parsedUrl.pathname.match(/^\/docx\/([^/?#]+)/) ?? [];

    return token ?? '';
  } catch {
    return '';
  }
}

function isLarkOfficeOrigin(origin: string): boolean {
  try {
    return isBytedanceLarkOfficeHostname(new URL(origin).hostname);
  } catch {
    return false;
  }
}

function isBytedanceLarkOfficeHostname(hostname: string): boolean {
  return (
    hostname === 'bytedance.larkoffice.com' ||
    hostname === 'bytedance.feishu.cn' ||
    hostname === 'bytedance.larksuite.com' ||
    (hostname.startsWith(LARKOFFICE_TENANT_PREFIX) &&
      (hostname.endsWith(LARKOFFICE_HOSTNAME_SUFFIX) ||
        hostname.endsWith(FEISHU_HOSTNAME_SUFFIX) ||
        hostname.endsWith(LARKSUITE_HOSTNAME_SUFFIX)))
  );
}

function getTargetOrigin(referrer: string): string {
  try {
    const referrerUrl = new URL(referrer);

    if (referrerUrl.hostname === BYTETECH_HOSTNAME) {
      return referrerUrl.origin;
    }
  } catch {
    return '*';
  }

  return '*';
}

function queryDeep<T extends Element>(root: ParentNode, selector: string): T[] {
  const results = Array.from(root.querySelectorAll<T>(selector));
  const shadowHosts = Array.from(root.querySelectorAll<HTMLElement>('*')).filter((element) => element.shadowRoot);

  shadowHosts.forEach((host) => {
    results.push(...queryDeep<T>(host.shadowRoot as ShadowRoot, selector));
  });

  return results;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
