import type { EnhancementStatus } from './site-enhancements';
import {
  appendMarkdownInlineContent,
  collectMarkdownInlineContent,
  getMarkdownInlineContentText,
  type MarkdownInlineContent,
} from './global-processing';

const FEISHU_HOSTNAME = 'feishu.cn';
const FEISHU_HOSTNAME_SUFFIX = '.feishu.cn';
const LARKOFFICE_HOSTNAME = 'larkoffice.com';
const LARKOFFICE_HOSTNAME_SUFFIX = '.larkoffice.com';
const LARKSUITE_HOSTNAME = 'larksuite.com';
const LARKSUITE_HOSTNAME_SUFFIX = '.larksuite.com';

const ENHANCED_ATTR = 'data-obsidian-clipper-extended-enhanced';
const MIRROR_ID = 'obsidian-clipper-extended-feishu-document';
const SOURCE_URL_ATTR = 'data-obsidian-clipper-extended-source-url';
const BLOCK_COUNT_ATTR = 'data-obsidian-clipper-extended-block-count';
const SOURCE_CONTENT_ATTR = 'data-obsidian-clipper-extended-feishu-source-content';
const ORIGINAL_ARIA_HIDDEN_ATTR = 'data-obsidian-clipper-extended-original-aria-hidden';
const NON_CONTENT_BLOCK_TYPES = new Set([
  'back_ref_list',
  'card',
  'diagram',
  'file',
  'image',
  'jira_issue',
  'mention_doc',
  'sheet',
  'table',
]);

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
  'left:0!important',
  'top:0!important',
  'width:760px!important',
  'max-width:760px!important',
  'min-width:0!important',
  'height:auto!important',
  'max-height:none!important',
  'overflow:visible!important',
  'opacity:0.01!important',
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

export interface FeishuDocumentBlock {
  id: string;
  type: 'heading' | 'paragraph' | 'quote' | 'code';
  text: string;
  level?: number;
  content?: MarkdownInlineContent[];
}

export interface FeishuDocumentPayload {
  title: string;
  sourceUrl: string;
  blocks: FeishuDocumentBlock[];
}

export interface FeishuCollectOptions {
  maxScrollSteps?: number;
  preserveMarkdownLinks?: boolean;
  waitMs?: number;
  waitForRender?: (milliseconds: number) => Promise<void>;
}

let documentCollectionState: {
  sourceUrl: string;
  blocksById: Map<string, FeishuDocumentBlock>;
  blockOrder: string[];
} | null = null;

export function isFeishuDocumentUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);

    return isFeishuDocumentHostname(parsedUrl.hostname) && parsedUrl.pathname.startsWith('/docx/');
  } catch {
    return false;
  }
}

export function getFeishuEnhancementStatus(
  doc: Document = document,
  pageUrl: string = window.location.href,
  enabled = false,
): EnhancementStatus {
  if (!isFeishuDocumentUrl(pageUrl)) {
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
  const blockCount = Number.parseInt(mirror?.getAttribute(BLOCK_COUNT_ATTR) ?? '0', 10) || 0;
  const renderedBlockCount = getRenderedFeishuBlockElements(doc).length;

  return {
    site: 'feishu',
    enabled,
    active: enabled && Boolean(mirror),
    imageCount: 0,
    normalizedImageCount: 0,
    label:
      enabled && mirror
        ? `Feishu document enhancer active for ${blockCount} blocks`
        : renderedBlockCount > 0
          ? `Feishu document ready with ${renderedBlockCount} rendered blocks`
          : 'Feishu document enhancer waiting for content',
  };
}

export async function enhanceFeishuDocument(
  win: Window = window,
  doc: Document = document,
  sourceUrl: string = window.location.href,
  options: FeishuCollectOptions = {},
): Promise<EnhancementStatus> {
  const title = getFeishuDocumentTitle(doc);
  const initialPayload = mergeFeishuDocumentBlocks(sourceUrl, title, collectVisibleFeishuBlocks(doc, options));

  if (initialPayload.blocks.length > 0) {
    renderFeishuDocumentPayload(doc, initialPayload);
  }

  const collectedPayload = await collectFeishuDocumentPayload(win, doc, sourceUrl, options);
  const payload = mergeFeishuDocumentBlocks(
    sourceUrl,
    collectedPayload.title || title,
    collectedPayload.blocks,
    { preferBatchOrder: collectedPayload.blocks.length > initialPayload.blocks.length },
  );

  if (payload.blocks.length > 0) {
    renderFeishuDocumentPayload(doc, payload);
  }

  return {
    site: 'feishu',
    enabled: true,
    active: payload.blocks.length > 0,
    imageCount: 0,
    normalizedImageCount: 0,
    label:
      payload.blocks.length > 0
        ? `Feishu document enhancer active for ${payload.blocks.length} blocks`
        : 'Feishu document content not found',
  };
}

export async function collectFeishuDocumentPayload(
  win: Window,
  doc: Document,
  sourceUrl: string,
  options: FeishuCollectOptions = {},
): Promise<FeishuDocumentPayload> {
  const blocksById = new Map<string, FeishuDocumentBlock>();
  const scrollContainer = findFeishuScrollContainer(doc);
  const maxScrollSteps = options.maxScrollSteps ?? 120;
  const waitMs = options.waitMs ?? 80;
  const waitForRender =
    options.waitForRender ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => {
        win.setTimeout(resolve, milliseconds);
      }));
  const originalScrollTop = scrollContainer?.scrollTop ?? 0;

  await waitForFeishuBlocks(doc, waitForRender, waitMs);

  if (maxScrollSteps <= 0) {
    return {
      title: getFeishuDocumentTitle(doc),
      sourceUrl,
      blocks: collectVisibleFeishuBlocks(doc, options),
    };
  }

  if (scrollContainer) {
    scrollContainer.scrollTop = 0;
    await waitForRender(waitMs);
  }

  for (let step = 0; step < maxScrollSteps; step += 1) {
    collectVisibleFeishuBlocks(doc, options).forEach((block) => {
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
    title: getFeishuDocumentTitle(doc),
    sourceUrl,
    blocks: Array.from(blocksById.values()),
  };
}

export function collectVisibleFeishuBlocks(
  doc: Document,
  options: Pick<FeishuCollectOptions, 'preserveMarkdownLinks'> = {},
): FeishuDocumentBlock[] {
  const blocksById = new Map<string, FeishuDocumentBlock>();

  getRenderedFeishuBlockElements(doc).forEach((block, index) => {
    feishuBlockToArticleBlocks(block, index, options).forEach((articleBlock) => {
      blocksById.set(articleBlock.id, articleBlock);
    });
  });

  return Array.from(blocksById.values());
}

export function renderFeishuDocumentPayload(doc: Document, payload: FeishuDocumentPayload): HTMLElement {
  let article = findMirrorArticle(doc);

  if (!article) {
    article = doc.createElement('article');
    article.id = MIRROR_ID;
    const mount = doc.body ?? doc.documentElement;
    mount.insertBefore(article, mount.firstChild);
  }

  markSourceContent(doc, article);
  populateMirrorArticle(doc, article, payload);

  return article;
}

export function restoreFeishuEnhancement(doc: Document = document): void {
  restoreSourceContentAttributes(doc);

  queryDeep<HTMLElement>(doc, `#${MIRROR_ID}`).forEach((article) => {
    article.remove();
  });
}

export function resetFeishuDocumentCollectionForTest(): void {
  documentCollectionState = null;
}

function populateMirrorArticle(doc: Document, article: HTMLElement, payload: FeishuDocumentPayload): void {
  article.setAttribute(ENHANCED_ATTR, 'feishu');
  article.setAttribute(SOURCE_URL_ATTR, payload.sourceUrl);
  article.setAttribute(BLOCK_COUNT_ATTR, String(payload.blocks.length));
  article.setAttribute('class', 'article-content');
  article.setAttribute('role', 'article');
  article.setAttribute('style', MIRROR_STYLE);
  article.replaceChildren();

  if (payload.title) {
    const title = doc.createElement('h1');
    title.textContent = payload.title;
    article.appendChild(title);
  }

  payload.blocks.forEach((block) => {
    const element = createArticleBlockElement(doc, block);

    if (element) {
      article.appendChild(element);
    }
  });
}

function mergeFeishuDocumentBlocks(
  sourceUrl: string,
  title: string,
  blocks: FeishuDocumentBlock[],
  options: { preferBatchOrder?: boolean } = {},
): FeishuDocumentPayload {
  const state = getDocumentCollectionState(sourceUrl);
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
      .filter((block): block is FeishuDocumentBlock => Boolean(block)),
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
    const insertIndex = cursor ?? (nextKnownId ? mergedOrder.indexOf(nextKnownId) : mergedOrder.length);

    mergedOrder.splice(Math.max(insertIndex, 0), 0, id);
    cursor = Math.max(insertIndex, 0) + 1;
  });

  return mergedOrder;
}

function getDocumentCollectionState(sourceUrl: string): NonNullable<typeof documentCollectionState> {
  if (!documentCollectionState || documentCollectionState.sourceUrl !== sourceUrl) {
    documentCollectionState = {
      sourceUrl,
      blocksById: new Map<string, FeishuDocumentBlock>(),
      blockOrder: [],
    };
  }

  return documentCollectionState;
}

function getRenderedFeishuBlockElements(doc: Document): HTMLElement[] {
  return queryDeep<HTMLElement>(doc, LARK_BLOCK_SELECTOR).filter((block) => {
    if (!isLikelyDocumentBlock(block)) {
      return false;
    }

    if (block.classList.contains('docx-page-block')) {
      return false;
    }

    const parentBlock = block.parentElement?.closest<HTMLElement>(LARK_BLOCK_SELECTOR);

    return (
      !parentBlock ||
      parentBlock === block ||
      !isLikelyDocumentBlock(parentBlock) ||
      parentBlock.classList.contains('docx-page-block')
    );
  });
}

function isLikelyDocumentBlock(block: HTMLElement): boolean {
  if (
    block.matches('.render-unit-wrapper .block, .root-render-unit-container .block') ||
    block.getAttribute('data-block-type')
  ) {
    return true;
  }

  return /docx-[\w-]+-block/.test(block.className);
}

function feishuBlockToArticleBlocks(
  block: HTMLElement,
  fallbackIndex = 0,
  options: Pick<FeishuCollectOptions, 'preserveMarkdownLinks'> = {},
): FeishuDocumentBlock[] {
  const blockType = block.getAttribute('data-block-type') ?? '';
  const shouldPreserveMarkdownLinks = options.preserveMarkdownLinks && !isCodeBlock(block, blockType);
  const content = shouldPreserveMarkdownLinks ? collectMarkdownInlineContent(block) : [];
  const text = shouldPreserveMarkdownLinks ? getMarkdownInlineContentText(content) : getCleanText(block);

  if (!text || isNonContentBlock(block, blockType)) {
    return [];
  }

  const blockId = getBlockId(block, fallbackIndex);

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

function isNonContentBlock(block: HTMLElement, blockType: string): boolean {
  return (
    NON_CONTENT_BLOCK_TYPES.has(blockType) ||
    block.classList.contains('docx-back_ref_list-block') ||
    block.classList.contains('docx-card-block') ||
    block.classList.contains('docx-file-block') ||
    block.classList.contains('docx-image-block') ||
    block.classList.contains('docx-table-block') ||
    block.className.includes('attachment')
  );
}

function isCodeBlock(block: HTMLElement, blockType: string): boolean {
  return blockType === 'code' || block.className.includes('code');
}

function createArticleBlockElement(doc: Document, block: FeishuDocumentBlock): HTMLElement | null {
  const text = block.text.trim();

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
  block: FeishuDocumentBlock,
  fallbackText: string,
): void {
  if (block.content?.length) {
    appendMarkdownInlineContent(doc, element, block.content);
    return;
  }

  element.textContent = fallbackText;
}

function findMirrorArticle(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>(`#${MIRROR_ID}`);
}

function markSourceContent(doc: Document, article: HTMLElement): void {
  getFeishuSourceContentRoots(doc)
    .filter((root) => root !== article && !article.contains(root) && !root.contains(article))
    .forEach((root) => {
      if (!root.hasAttribute(ORIGINAL_ARIA_HIDDEN_ATTR)) {
        root.setAttribute(ORIGINAL_ARIA_HIDDEN_ATTR, root.getAttribute('aria-hidden') ?? '');
      }

      root.setAttribute(SOURCE_CONTENT_ATTR, 'true');
      root.setAttribute('aria-hidden', 'true');
    });
}

function restoreSourceContentAttributes(doc: Document): void {
  queryDeep<HTMLElement>(doc, `[${SOURCE_CONTENT_ATTR}]`).forEach((root) => {
    const originalAriaHidden = root.getAttribute(ORIGINAL_ARIA_HIDDEN_ATTR);

    if (originalAriaHidden) {
      root.setAttribute('aria-hidden', originalAriaHidden);
    } else {
      root.removeAttribute('aria-hidden');
    }

    root.removeAttribute(SOURCE_CONTENT_ATTR);
    root.removeAttribute(ORIGINAL_ARIA_HIDDEN_ATTR);
  });
}

function getFeishuSourceContentRoots(doc: Document): HTMLElement[] {
  const roots = getRenderedFeishuBlockElements(doc)
    .map((block) => block.closest<HTMLElement>('.bear-web-x-container, .render-unit-wrapper, .root-render-unit-container'))
    .filter((root): root is HTMLElement => Boolean(root));

  return Array.from(new Set(roots));
}

function findFeishuScrollContainer(doc: Document): HTMLElement | null {
  const renderedBlocks = getRenderedFeishuBlockElements(doc);
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

function getDeepElements(doc: Document, selector: string): HTMLElement[] {
  return queryDeep<HTMLElement>(doc, selector);
}

function getDeepElement(doc: Document, selector: string): HTMLElement | null {
  return getDeepElements(doc, selector)[0] ?? null;
}

function getBlockId(block: HTMLElement, fallbackIndex: number): string {
  const explicitId = block.getAttribute('data-record-id') || block.getAttribute('data-block-id');

  if (explicitId) {
    return explicitId;
  }

  const positionKey = getBlockPositionKey(block);

  return `${block.getAttribute('data-block-type') ?? 'block'}:${positionKey || fallbackIndex}:${getCleanText(block)}`;
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

function getFeishuDocumentTitle(doc: Document): string {
  return cleanTitle(
    doc.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content ||
      doc.querySelector<HTMLMetaElement>('meta[name="twitter:title"]')?.content ||
      doc.title ||
      getCleanText(doc.querySelector<HTMLElement>('.doc-title') ?? doc.body),
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
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function waitForFeishuBlocks(
  doc: Document,
  waitForRender: (milliseconds: number) => Promise<void>,
  waitMs: number,
): Promise<void> {
  for (let attempt = 0; attempt < 50 && getRenderedFeishuBlockElements(doc).length === 0; attempt += 1) {
    await waitForRender(Math.max(waitMs, 100));
  }
}

function isFeishuDocumentHostname(hostname: string): boolean {
  return (
    hostname === FEISHU_HOSTNAME ||
    hostname.endsWith(FEISHU_HOSTNAME_SUFFIX) ||
    hostname === LARKOFFICE_HOSTNAME ||
    hostname.endsWith(LARKOFFICE_HOSTNAME_SUFFIX) ||
    hostname === LARKSUITE_HOSTNAME ||
    hostname.endsWith(LARKSUITE_HOSTNAME_SUFFIX)
  );
}

function queryDeep<T extends Element>(root: ParentNode, selector: string): T[] {
  const results = Array.from(root.querySelectorAll<T>(selector));
  const shadowHosts = Array.from(root.querySelectorAll<HTMLElement>('*')).filter((element) => element.shadowRoot);

  shadowHosts.forEach((host) => {
    results.push(...queryDeep<T>(host.shadowRoot as ShadowRoot, selector));
  });

  return results;
}
