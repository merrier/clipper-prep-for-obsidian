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
const NON_CONTENT_IMAGE_TEXT = new Set(['附件不支持打印']);
const AVATAR_IMAGE_SIZE_LIMIT = 96;
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
  type: 'heading' | 'paragraph' | 'quote' | 'code' | 'image';
  text?: string;
  level?: number;
  content?: MarkdownInlineContent[];
  src?: string;
  alt?: string;
  width?: string;
  height?: string;
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

    return isFeishuDocumentHostname(parsedUrl.hostname) && isFeishuDocumentPath(parsedUrl.pathname);
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

  markSourceContent(doc, article, payload.sourceUrl);
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
  const rawText = getCleanText(block);
  const images = getMeaningfulImages(block, blockType);
  const shouldPreserveMarkdownLinks = options.preserveMarkdownLinks && !isCodeBlock(block, blockType);
  const rawContent = shouldPreserveMarkdownLinks ? collectMarkdownInlineContent(block) : [];
  const text = getContentText(shouldPreserveMarkdownLinks ? getMarkdownInlineContentText(rawContent) : rawText);
  const content = getContentAwareInlineContent(rawContent, text);

  if (!text && images.length === 0) {
    return [];
  }

  if (images.length === 0 && isNonContentBlock(block, blockType)) {
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

  return getMarkdownInlineContentText(content) === normalizedText ? content : [{ type: 'text', text: normalizedText }];
}

function getContentText(text: string): string {
  let contentText = text;

  NON_CONTENT_IMAGE_TEXT.forEach((placeholder) => {
    contentText = contentText.replaceAll(placeholder, ' ');
  });

  return cleanText(contentText);
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

function getMeaningfulImages(block: HTMLElement, blockType: string): FeishuDocumentBlock[] {
  const isLikelyImageBlock = isImageBlock(block, blockType) || hasNonContentImageText(getCleanText(block));
  const seenUrls = new Set<string>();

  return getImageCandidates(block).filter((image) => {
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

function getImageCandidates(block: HTMLElement): FeishuDocumentBlock[] {
  return getImageCandidatesFromElements([block, ...queryDeep<Element>(block, '*')]);
}

function getImageCandidatesFromElements(elements: Element[]): FeishuDocumentBlock[] {
  const candidates: FeishuDocumentBlock[] = [];

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
      /^https?:\/\//i.test(normalizedSrc) &&
      !/^data:/i.test(normalizedSrc) &&
      !/^blob:/i.test(normalizedSrc),
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

function getImageAlt(element: Element): string {
  return element.getAttribute('alt')?.trim() || element.getAttribute('aria-label')?.trim() || element.getAttribute('title')?.trim() || '';
}

function getElementDimension(element: Element, dimension: 'width' | 'height'): string {
  const attributeValue = element.getAttribute(dimension) || element.getAttribute(`data-${dimension}`);

  if (attributeValue) {
    return attributeValue;
  }

  if (element instanceof HTMLElement) {
    const inlineValue = element.style[dimension];

    if (inlineValue) {
      return inlineValue;
    }
  }

  return '';
}

function hasMeaningfulImageSize(image: FeishuDocumentBlock): boolean {
  const urlSize = getImageSizeFromUrl(image.src ?? '');
  const width = getNumericDimension(image.width) ?? urlSize?.width ?? 0;
  const height = getNumericDimension(image.height) ?? urlSize?.height ?? 0;

  return Math.max(width, height) > AVATAR_IMAGE_SIZE_LIMIT;
}

function isLikelyAvatarImage(image: FeishuDocumentBlock): boolean {
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
  return DECORATIVE_LARK_IMAGE_URL_PATTERN.test(normalizeImageUrl(src));
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

    if (match) {
      return {
        width: Number.parseInt(match[1] ?? '0', 10),
        height: Number.parseInt(match[2] ?? '0', 10),
      };
    }

    const width = Number.parseInt(parsedUrl.searchParams.get('width') ?? '', 10);
    const height = Number.parseInt(parsedUrl.searchParams.get('height') ?? '', 10);

    return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0 ? { width, height } : null;
  } catch {
    return null;
  }
}

function createArticleBlockElement(doc: Document, block: FeishuDocumentBlock): HTMLElement | null {
  if (block.type === 'image') {
    if (!block.src) {
      return null;
    }

    const paragraph = doc.createElement('p');
    const image = doc.createElement('img');

    image.src = block.src;
    image.setAttribute('data-src', block.src);
    image.setAttribute('loading', 'eager');
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

function markSourceContent(doc: Document, article: HTMLElement, sourceUrl: string): void {
  getFeishuSourceContentRoots(doc, sourceUrl)
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

function getFeishuSourceContentRoots(doc: Document, sourceUrl: string): HTMLElement[] {
  const renderedBlocks = getRenderedFeishuBlockElements(doc);
  const roots = renderedBlocks
    .flatMap((block) => {
      const renderRoot = block.closest<HTMLElement>(
        '.bear-web-x-container, .render-unit-wrapper, .root-render-unit-container',
      );

      if (!isFeishuWikiUrl(sourceUrl)) {
        return renderRoot ? [renderRoot] : [];
      }

      return [renderRoot, getBodyChildRoot(block, doc)].filter((root): root is HTMLElement => Boolean(root));
    });

  return Array.from(new Set(roots));
}

function getBodyChildRoot(element: HTMLElement, doc: Document): HTMLElement | null {
  let current: HTMLElement | null = getShadowHost(element) ?? element;

  while (current?.parentElement && current.parentElement !== doc.body) {
    current = current.parentElement;
  }

  return current?.parentElement === doc.body ? current : null;
}

function getShadowHost(element: HTMLElement): HTMLElement | null {
  const root = element.getRootNode();

  return root instanceof ShadowRoot && root.host instanceof HTMLElement ? root.host : null;
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

function isFeishuDocumentPath(pathname: string): boolean {
  return pathname.startsWith('/docx/') || pathname.startsWith('/wiki/');
}

function isFeishuWikiUrl(url: string): boolean {
  try {
    return new URL(url).pathname.startsWith('/wiki/');
  } catch {
    return false;
  }
}

function queryDeep<T extends Element>(root: ParentNode, selector: string): T[] {
  const results = Array.from(root.querySelectorAll<T>(selector));
  const shadowHosts = Array.from(root.querySelectorAll<HTMLElement>('*')).filter((element) => element.shadowRoot);

  shadowHosts.forEach((host) => {
    results.push(...queryDeep<T>(host.shadowRoot as ShadowRoot, selector));
  });

  return results;
}
