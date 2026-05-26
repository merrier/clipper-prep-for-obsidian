import { describe, expect, it } from 'vitest';

import {
  appendMarkdownInlineContent,
  collectMarkdownInlineContent,
  enhanceMarkdownLinks,
  getMarkdownInlineContentText,
  restoreMarkdownLinks,
} from './global-processing';

const LARK_LINK = 'https://bytedance.larkoffice.com/wiki/GC4QweC6liUE45kBOO7culPBnAb';

describe('global processing helpers', () => {
  it('normalizes encoded rendered link hrefs without changing link text', () => {
    const doc = createDocument(`
      <a
        class="link contextmenu-without-copyperm"
        href="#placeholder"
        data-href="${encodeURIComponent(LARK_LINK)}"
        data-link-node="true"
      >
        <span data-string="true">浏览器插件</span>
      </a>
    `);

    const result = enhanceMarkdownLinks(doc, 'https://bytedance.larkoffice.com/docx/source');
    const anchor = doc.querySelector<HTMLAnchorElement>('a')!;

    expect(result.normalizedLinkCount).toBe(1);
    expect(anchor.getAttribute('href')).toBe(LARK_LINK);
    expect(anchor.textContent?.trim()).toBe('浏览器插件');

    restoreMarkdownLinks(doc);

    expect(anchor.getAttribute('href')).toBe('#placeholder');
  });

  it('collects link-aware inline content for semantic article mirrors', () => {
    const doc = createDocument(`
      <p>
        阅读
        <a data-href="${encodeURIComponent(LARK_LINK)}" data-link-node="true">
          <span data-string="true">浏览器插件</span>
        </a>
        完成。
      </p>
    `);

    const content = collectMarkdownInlineContent(doc.querySelector('p'));
    const paragraph = doc.createElement('p');
    appendMarkdownInlineContent(doc, paragraph, content);

    expect(getMarkdownInlineContentText(content)).toBe('阅读 浏览器插件 完成。');
    expect(paragraph.textContent).toBe('阅读 浏览器插件 完成。');
    expect(paragraph.querySelector('a')?.getAttribute('href')).toBe(LARK_LINK);
  });
});

function createDocument(body: string): Document {
  return new DOMParser().parseFromString(
    `<!doctype html><html><body>${body}</body></html>`,
    'text/html',
  );
}
