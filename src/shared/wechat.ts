import type { EnhancementStatus } from './site-enhancements';

const WECHAT_HOSTNAME = 'mp.weixin.qq.com';
const ENHANCED_ATTR = 'data-obsidian-clipper-extended-enhanced';
const NORMALIZED_SRC_ATTR = 'data-obsidian-clipper-extended-src';
const ORIGINAL_SRC_ATTR = 'data-obsidian-clipper-extended-original-src';
const ORIGINAL_DATA_SRC_ATTR = 'data-obsidian-clipper-extended-original-data-src';
const ORIGINAL_SRCSET_ATTR = 'data-obsidian-clipper-extended-original-srcset';
const ORIGINAL_LOADING_ATTR = 'data-obsidian-clipper-extended-original-loading';
const ORIGINAL_ALT_ATTR = 'data-obsidian-clipper-extended-original-alt';
const ORIGINAL_WIDTH_ATTR = 'data-obsidian-clipper-extended-original-width';
const ORIGINAL_HEIGHT_ATTR = 'data-obsidian-clipper-extended-original-height';
const UNWRAPPED_CODE_IMAGE_ATTR = 'data-obsidian-clipper-extended-unwrapped-code-image';
const UNWRAPPED_CODE_TEXT_ATTR = 'data-obsidian-clipper-extended-unwrapped-code-text';

const IMAGE_SOURCE_ATTRIBUTES = [
  'data-src',
  'data-original',
  'data-backsrc',
  'data-croporisrc',
  'data-ratio-src',
  'src',
];

export function isWeChatArticleUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.hostname === WECHAT_HOSTNAME &&
      (parsedUrl.pathname === '/s' || parsedUrl.pathname.startsWith('/s/'))
    );
  } catch {
    return false;
  }
}

export function getWeChatEnhancementStatus(
  doc: Document = document,
  pageUrl: string = window.location.href,
  enabled = false,
): EnhancementStatus {
  if (!isWeChatArticleUrl(pageUrl)) {
    return {
      site: null,
      enabled,
      active: false,
      imageCount: 0,
      normalizedImageCount: 0,
      label: 'No site enhancer active',
    };
  }

  const contentRoot = doc.querySelector<HTMLElement>('#js_content');
  const imageCount = contentRoot?.querySelectorAll('img').length ?? 0;
  const normalizedImageCount =
    contentRoot?.querySelectorAll(`img[${NORMALIZED_SRC_ATTR}]`).length ?? 0;

  return {
    site: 'wechat',
    enabled,
    active: enabled && Boolean(contentRoot),
    imageCount,
    normalizedImageCount,
    label: enabled
      ? `WeChat enhancer active for ${normalizedImageCount}/${imageCount} images`
      : 'WeChat enhancer disabled',
  };
}

export function enhanceWeChatArticle(
  doc: Document = document,
  pageUrl: string = window.location.href,
): EnhancementStatus {
  if (!isWeChatArticleUrl(pageUrl)) {
    return getWeChatEnhancementStatus(doc, pageUrl, false);
  }

  const contentRoot = doc.querySelector<HTMLElement>('#js_content');

  if (!contentRoot) {
    return {
      site: 'wechat',
      enabled: true,
      active: false,
      imageCount: 0,
      normalizedImageCount: 0,
      label: 'WeChat article content not found',
    };
  }

  contentRoot.setAttribute(ENHANCED_ATTR, 'wechat');

  const images = Array.from(contentRoot.querySelectorAll<HTMLImageElement>('img'));
  let normalizedImageCount = 0;

  images.forEach((image) => {
    if (normalizeWeChatImage(image, pageUrl)) {
      normalizedImageCount += 1;
    }
  });
  unwrapImageOnlyCodeBlocks(contentRoot);
  normalizePseudoCodeBlocks(contentRoot);

  return {
    site: 'wechat',
    enabled: true,
    active: true,
    imageCount: images.length,
    normalizedImageCount,
    label: `WeChat enhancer active for ${normalizedImageCount}/${images.length} images`,
  };
}

export function restoreWeChatEnhancement(doc: Document = document): void {
  doc.querySelectorAll<HTMLElement>(`[${ENHANCED_ATTR}]`).forEach((element) => {
    element.removeAttribute(ENHANCED_ATTR);
  });

  doc.querySelectorAll<HTMLImageElement>(`img[${NORMALIZED_SRC_ATTR}]`).forEach((image) => {
    restoreAttribute(image, 'src', ORIGINAL_SRC_ATTR);
    restoreAttribute(image, 'data-src', ORIGINAL_DATA_SRC_ATTR);
    restoreAttribute(image, 'srcset', ORIGINAL_SRCSET_ATTR);
    restoreAttribute(image, 'loading', ORIGINAL_LOADING_ATTR);
    restoreAttribute(image, 'alt', ORIGINAL_ALT_ATTR);
    restoreAttribute(image, 'width', ORIGINAL_WIDTH_ATTR);
    restoreAttribute(image, 'height', ORIGINAL_HEIGHT_ATTR);
    image.removeAttribute(NORMALIZED_SRC_ATTR);
  });

  restoreImageOnlyCodeBlocks(doc);
  restoreTextCodeBlocks(doc);
}

export function collectArticleImageUrls(root: ParentNode, baseUrl: string): Set<string> {
  const imageUrls = new Set<string>();

  root.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
    const source = getBestImageSource(image, baseUrl);

    if (source) {
      imageUrls.add(source);
    }
  });

  return imageUrls;
}

export function getBestImageSource(image: HTMLImageElement, baseUrl: string): string {
  const candidates = [
    ...IMAGE_SOURCE_ATTRIBUTES.map((attributeName) => image.getAttribute(attributeName)),
    image.currentSrc,
  ];

  for (const candidate of candidates) {
    const normalizedUrl = normalizeWeChatImageUrl(candidate, baseUrl);

    if (normalizedUrl) {
      return normalizedUrl;
    }
  }

  return '';
}

export function normalizeWeChatImageUrl(value: string | null | undefined, baseUrl: string): string {
  const normalizedUrl = normalizeImageUrl(value, baseUrl);

  if (!normalizedUrl) {
    return '';
  }

  try {
    const imageUrl = new URL(normalizedUrl);

    if (!isWeChatImageHost(imageUrl.hostname)) {
      return normalizedUrl;
    }

    imageUrl.searchParams.set('from', 'appmsg');
    imageUrl.searchParams.set('watermark', '1');
    imageUrl.searchParams.delete('tp');
    imageUrl.searchParams.delete('wxfrom');
    imageUrl.searchParams.delete('wx_lazy');

    return imageUrl.href;
  } catch {
    return normalizedUrl;
  }
}

function normalizeWeChatImage(image: HTMLImageElement, baseUrl: string): boolean {
  const source = getBestImageSource(image, baseUrl);

  if (!source) {
    return false;
  }

  preserveOriginalAttribute(image, 'src', ORIGINAL_SRC_ATTR);
  preserveOriginalAttribute(image, 'data-src', ORIGINAL_DATA_SRC_ATTR);
  preserveOriginalAttribute(image, 'srcset', ORIGINAL_SRCSET_ATTR);
  preserveOriginalAttribute(image, 'loading', ORIGINAL_LOADING_ATTR);
  preserveOriginalAttribute(image, 'alt', ORIGINAL_ALT_ATTR);
  preserveOriginalAttribute(image, 'width', ORIGINAL_WIDTH_ATTR);
  preserveOriginalAttribute(image, 'height', ORIGINAL_HEIGHT_ATTR);

  setAttributeIfChanged(image, 'src', source);
  setAttributeIfChanged(image, 'data-src', source);
  setAttributeIfChanged(image, 'loading', 'eager');
  ensureImageAltText(image, source);
  ensureImageDimensions(image);
  removeAttributeIfPresent(image, 'srcset');
  setAttributeIfChanged(image, NORMALIZED_SRC_ATTR, source);

  return true;
}

function ensureImageAltText(image: HTMLImageElement, source: string): void {
  const existingAltText = image.getAttribute('alt')?.trim() ?? '';

  if (existingAltText && !isGenericImageAltText(existingAltText)) {
    return;
  }

  setAttributeIfChanged(image, 'alt', getFallbackImageAltText(source));
}

function isGenericImageAltText(value: string): boolean {
  return ['图片', '图像', 'image', 'img'].includes(value.trim().toLowerCase());
}

function getFallbackImageAltText(source: string): string {
  const imageIndex = getImageIndex(source);

  return imageIndex ? `图片 ${imageIndex}` : '图片';
}

function getImageIndex(source: string): string {
  const match = source.match(/[#?&]imgIndex=(\d+)/);

  if (match?.[1]) {
    return match[1];
  }

  try {
    const parsedUrl = new URL(source);
    const hashParams = new URLSearchParams(parsedUrl.hash.replace(/^#/, ''));

    return hashParams.get('imgIndex') ?? '';
  } catch {
    return '';
  }
}

function ensureImageDimensions(image: HTMLImageElement): void {
  const width = getPositiveIntegerAttribute(image, 'width') || getPositiveIntegerAttribute(image, 'data-w');
  const height =
    getPositiveIntegerAttribute(image, 'height') ||
    getPositiveIntegerAttribute(image, 'data-h') ||
    getHeightFromRatio(image, width);

  if (width > 0) {
    setAttributeIfChanged(image, 'width', String(width));
  }

  if (height > 0) {
    setAttributeIfChanged(image, 'height', String(height));
  }
}

function getPositiveIntegerAttribute(element: HTMLElement, attributeName: string): number {
  const value = Number.parseInt(element.getAttribute(attributeName) ?? '', 10);

  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getHeightFromRatio(image: HTMLImageElement, width: number): number {
  const ratio = Number.parseFloat(image.getAttribute('data-ratio') ?? '');

  if (!Number.isFinite(ratio) || ratio <= 0 || width <= 0) {
    return 0;
  }

  return Math.round(width * ratio);
}

function unwrapImageOnlyCodeBlocks(root: ParentNode): number {
  let unwrappedCount = 0;
  const preBlocks = Array.from(root.querySelectorAll<HTMLPreElement>('pre'));

  preBlocks.forEach((preBlock) => {
    const images = Array.from(preBlock.querySelectorAll<HTMLImageElement>('img'));

    if (images.length === 0 || getMeaningfulText(preBlock)) {
      return;
    }

    const fragment = preBlock.ownerDocument.createDocumentFragment();

    images.forEach((image) => {
      const paragraph = preBlock.ownerDocument.createElement('p');
      const marginBottom = preBlock.style.marginBottom;

      paragraph.setAttribute(UNWRAPPED_CODE_IMAGE_ATTR, 'true');

      if (marginBottom) {
        paragraph.style.marginBottom = marginBottom;
      }

      paragraph.appendChild(image);
      fragment.appendChild(paragraph);
      unwrappedCount += 1;
    });

    preBlock.replaceWith(fragment);
  });

  return unwrappedCount;
}

function normalizePseudoCodeBlocks(root: ParentNode): number {
  let normalizedCount = 0;
  const preBlocks = Array.from(root.querySelectorAll<HTMLPreElement>('pre'));

  preBlocks.forEach((preBlock) => {
    if (preBlock.querySelector('img')) {
      return;
    }

    if (!getMeaningfulText(preBlock)) {
      preBlock.remove();
      normalizedCount += 1;
      return;
    }

    if (!looksLikeArticleText(preBlock)) {
      return;
    }

    const paragraph = preBlock.ownerDocument.createElement('p');
    const marginBottom = preBlock.style.marginBottom;
    const source = preBlock.querySelector('code') ?? preBlock;

    paragraph.setAttribute(UNWRAPPED_CODE_TEXT_ATTR, 'true');

    if (marginBottom) {
      paragraph.style.marginBottom = marginBottom;
    }

    Array.from(source.childNodes).forEach((node) => {
      paragraph.appendChild(node);
    });

    preBlock.replaceWith(paragraph);
    normalizedCount += 1;
  });

  return normalizedCount;
}

function restoreImageOnlyCodeBlocks(doc: Document): void {
  doc.querySelectorAll<HTMLElement>(`[${UNWRAPPED_CODE_IMAGE_ATTR}]`).forEach((wrapper) => {
    const preBlock = doc.createElement('pre');
    const codeBlock = doc.createElement('code');
    const span = doc.createElement('span');

    Array.from(wrapper.childNodes).forEach((node) => {
      span.appendChild(node);
    });

    codeBlock.appendChild(span);
    preBlock.appendChild(codeBlock);
    wrapper.replaceWith(preBlock);
  });
}

function restoreTextCodeBlocks(doc: Document): void {
  doc.querySelectorAll<HTMLElement>(`[${UNWRAPPED_CODE_TEXT_ATTR}]`).forEach((wrapper) => {
    const preBlock = doc.createElement('pre');
    const codeBlock = doc.createElement('code');

    Array.from(wrapper.childNodes).forEach((node) => {
      codeBlock.appendChild(node);
    });

    preBlock.appendChild(codeBlock);
    wrapper.replaceWith(preBlock);
  });
}

function getMeaningfulText(element: HTMLElement): string {
  return (element.textContent ?? '').replace(/[\s\u00a0\u200b-\u200f\u2060\ufeff]/g, '');
}

function looksLikeArticleText(element: HTMLElement): boolean {
  return /[\u3400-\u9fff]/.test(element.textContent ?? '');
}

function setAttributeIfChanged(element: HTMLElement, attributeName: string, value: string): void {
  if (element.getAttribute(attributeName) !== value) {
    element.setAttribute(attributeName, value);
  }
}

function removeAttributeIfPresent(element: HTMLElement, attributeName: string): void {
  if (element.hasAttribute(attributeName)) {
    element.removeAttribute(attributeName);
  }
}

function preserveOriginalAttribute(
  element: HTMLElement,
  attributeName: string,
  storageAttributeName: string,
): void {
  if (element.hasAttribute(storageAttributeName)) {
    return;
  }

  element.setAttribute(storageAttributeName, element.getAttribute(attributeName) ?? '');
}

function restoreAttribute(
  element: HTMLElement,
  attributeName: string,
  storageAttributeName: string,
): void {
  if (!element.hasAttribute(storageAttributeName)) {
    return;
  }

  const originalValue = element.getAttribute(storageAttributeName);

  if (originalValue) {
    element.setAttribute(attributeName, originalValue);
  } else {
    element.removeAttribute(attributeName);
  }

  element.removeAttribute(storageAttributeName);
}

function normalizeImageUrl(value: string | null | undefined, baseUrl: string): string {
  const normalizedUrl = normalizeHref(value, baseUrl);

  if (!normalizedUrl || normalizedUrl.startsWith('data:') || normalizedUrl.startsWith('blob:')) {
    return '';
  }

  return normalizedUrl;
}

function normalizeHref(value: string | null | undefined, baseUrl: string): string {
  const trimmedValue = value?.trim();

  if (!trimmedValue || trimmedValue.startsWith('javascript:')) {
    return '';
  }

  try {
    return new URL(trimmedValue, baseUrl).href;
  } catch {
    return trimmedValue;
  }
}

function isWeChatImageHost(hostname: string): boolean {
  return hostname === 'mmbiz.qpic.cn' || hostname.endsWith('.mmbiz.qpic.cn');
}
