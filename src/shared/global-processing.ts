export const GLOBAL_PROCESSOR_IDS = ['markdownLinks'] as const;

export type GlobalProcessorId = (typeof GLOBAL_PROCESSOR_IDS)[number];

export interface MarkdownInlineText {
  type: 'text';
  text: string;
}

export interface MarkdownInlineLink {
  type: 'link';
  text: string;
  href: string;
}

export type MarkdownInlineContent = MarkdownInlineText | MarkdownInlineLink;

export interface MarkdownLinkProcessingResult {
  normalizedLinkCount: number;
}

const MARKDOWN_LINK_ATTR = 'data-obsidian-clipper-extended-markdown-link';
const ORIGINAL_HREF_ATTR = 'data-obsidian-clipper-extended-original-href';
const ORIGINAL_HAD_HREF_ATTR = 'data-obsidian-clipper-extended-original-had-href';
const MARKDOWN_LINK_SELECTOR = 'a[data-href], a[data-link-node="true"]';
const UNSAFE_TEXT_PARENT_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'SELECT', 'OPTION']);
const ALLOWED_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export function isGlobalProcessorId(value: unknown): value is GlobalProcessorId {
  return typeof value === 'string' && GLOBAL_PROCESSOR_IDS.includes(value as GlobalProcessorId);
}

export function normalizeEnabledGlobalProcessors(value: unknown): GlobalProcessorId[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.filter(isGlobalProcessorId))];
}

export function isGlobalProcessorEnabled(
  enabledGlobalProcessors: readonly GlobalProcessorId[],
  processor: GlobalProcessorId,
): boolean {
  return enabledGlobalProcessors.includes(processor);
}

export function enhanceMarkdownLinks(
  root: ParentNode,
  baseUrl = getRootBaseUrl(root),
): MarkdownLinkProcessingResult {
  let normalizedLinkCount = 0;

  queryElementsDeep<HTMLAnchorElement>(root, MARKDOWN_LINK_SELECTOR).forEach((anchor) => {
    const href = getMarkdownLinkUrl(anchor, baseUrl);

    if (!href || anchor.getAttribute('href') === href) {
      return;
    }

    preserveOriginalHref(anchor);
    anchor.setAttribute('href', href);
    anchor.setAttribute(MARKDOWN_LINK_ATTR, href);
    normalizedLinkCount += 1;
  });

  return { normalizedLinkCount };
}

export function restoreMarkdownLinks(root: ParentNode): void {
  queryElementsDeep<HTMLAnchorElement>(root, `a[${MARKDOWN_LINK_ATTR}]`).forEach((anchor) => {
    if (anchor.getAttribute(ORIGINAL_HAD_HREF_ATTR) === 'true') {
      anchor.setAttribute('href', anchor.getAttribute(ORIGINAL_HREF_ATTR) ?? '');
    } else {
      anchor.removeAttribute('href');
    }

    anchor.removeAttribute(MARKDOWN_LINK_ATTR);
    anchor.removeAttribute(ORIGINAL_HREF_ATTR);
    anchor.removeAttribute(ORIGINAL_HAD_HREF_ATTR);
  });
}

export function collectMarkdownInlineContent(
  element: Element | null,
  baseUrl = element?.ownerDocument?.URL ?? '',
): MarkdownInlineContent[] {
  if (!element) {
    return [];
  }

  return normalizeInlineWhitespace(collectInlineContent(element, baseUrl));
}

export function getMarkdownInlineContentText(content: readonly MarkdownInlineContent[]): string {
  return cleanText(content.map((part) => part.text).join(''));
}

export function appendMarkdownInlineContent(
  doc: Document,
  parent: HTMLElement,
  content: readonly MarkdownInlineContent[],
): void {
  content.forEach((part) => {
    if (part.type === 'text') {
      parent.appendChild(doc.createTextNode(part.text));
      return;
    }

    const anchor = doc.createElement('a');
    anchor.href = part.href;
    anchor.textContent = part.text;
    anchor.rel = 'noopener noreferrer';
    parent.appendChild(anchor);
  });
}

function collectInlineContent(node: Node, baseUrl: string): MarkdownInlineContent[] {
  if (node.nodeType === 3) {
    return [{ type: 'text', text: node.textContent ?? '' }];
  }

  if (node.nodeType !== 1) {
    return [];
  }

  const element = node as Element;

  if (UNSAFE_TEXT_PARENT_TAGS.has(element.tagName)) {
    return [];
  }

  if (element.tagName === 'BR') {
    return [{ type: 'text', text: '\n' }];
  }

  const childContent = Array.from(element.childNodes).flatMap((child) =>
    collectInlineContent(child, baseUrl),
  );

  if (element.tagName !== 'A') {
    return childContent;
  }

  const text = getMarkdownInlineContentText(normalizeInlineWhitespace(childContent));
  const href = getMarkdownLinkUrl(element, baseUrl);

  if (!text || !href) {
    return childContent;
  }

  return [{ type: 'link', text, href }];
}

function normalizeInlineWhitespace(content: readonly MarkdownInlineContent[]): MarkdownInlineContent[] {
  const normalized: MarkdownInlineContent[] = [];
  let pendingSpace = false;

  content.forEach((part) => {
    const compactText = compactInlineText(part.text);

    if (!compactText) {
      return;
    }

    const hasLeadingSpace = compactText.startsWith(' ');
    const hasTrailingSpace = compactText.endsWith(' ');
    const text = compactText.trim();

    if (!text) {
      pendingSpace = normalized.length > 0;
      return;
    }

    if ((pendingSpace || hasLeadingSpace) && normalized.length > 0) {
      pushInlineText(normalized, ' ');
    }

    normalized.push(part.type === 'link' ? { ...part, text } : { type: 'text', text });
    pendingSpace = hasTrailingSpace;
  });

  return normalized;
}

function pushInlineText(content: MarkdownInlineContent[], text: string): void {
  const previous = content.at(-1);

  if (previous?.type === 'text') {
    previous.text += text;
    return;
  }

  content.push({ type: 'text', text });
}

function compactInlineText(text: string): string {
  return text
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '')
    .replace(/\s+/g, ' ');
}

function cleanText(text: string): string {
  return compactInlineText(text).trim();
}

function getMarkdownLinkUrl(anchor: Element, baseUrl: string): string {
  const candidates = [
    anchor.getAttribute('data-href'),
    anchor.getAttribute('href'),
  ];

  for (const candidate of candidates) {
    const href = normalizeLinkUrl(candidate, baseUrl);

    if (href) {
      return href;
    }
  }

  return '';
}

function normalizeLinkUrl(value: string | null | undefined, baseUrl: string): string {
  const decodedValue = decodePotentiallyEncodedUrl(value);

  if (!decodedValue) {
    return '';
  }

  try {
    const url = baseUrl ? new URL(decodedValue, baseUrl) : new URL(decodedValue);

    return ALLOWED_LINK_PROTOCOLS.has(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function decodePotentiallyEncodedUrl(value: string | null | undefined): string {
  const trimmedValue = value?.trim() ?? '';

  if (!trimmedValue) {
    return '';
  }

  try {
    return decodeURIComponent(trimmedValue);
  } catch {
    return trimmedValue;
  }
}

function preserveOriginalHref(anchor: HTMLAnchorElement): void {
  if (anchor.hasAttribute(ORIGINAL_HAD_HREF_ATTR)) {
    return;
  }

  const originalHref = anchor.getAttribute('href');
  anchor.setAttribute(ORIGINAL_HAD_HREF_ATTR, originalHref === null ? 'false' : 'true');
  anchor.setAttribute(ORIGINAL_HREF_ATTR, originalHref ?? '');
}

function getRootBaseUrl(root: ParentNode): string {
  if ('URL' in root && typeof root.URL === 'string') {
    return root.URL;
  }

  if ('ownerDocument' in root && root.ownerDocument) {
    return root.ownerDocument.URL;
  }

  return '';
}

function queryElementsDeep<T extends Element>(root: ParentNode, selector: string): T[] {
  const elements: T[] = [];

  if (root instanceof Element && root.matches(selector)) {
    elements.push(root as T);
  }

  elements.push(...Array.from(root.querySelectorAll<T>(selector)));

  Array.from(root.querySelectorAll<HTMLElement>('*')).forEach((element) => {
    if (element.shadowRoot) {
      elements.push(...queryElementsDeep<T>(element.shadowRoot, selector));
    }
  });

  return elements;
}
