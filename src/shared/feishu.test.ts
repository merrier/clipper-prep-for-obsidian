import { beforeEach, describe, expect, it } from 'vitest';

import {
  collectFeishuDocumentPayload,
  collectVisibleFeishuBlocks,
  enhanceFeishuDocument,
  getFeishuEnhancementStatus,
  isFeishuDocumentUrl,
  renderFeishuDocumentPayload,
  resetFeishuDocumentCollectionForTest,
  restoreFeishuEnhancement,
} from './feishu';

const FEISHU_URL = 'https://bytedance.sg.larkoffice.com/docx/TYVWd5wTmoGc3HxbAnKlEy2ug3g';
const FEISHU_WIKI_URL = 'https://bytedance.larkoffice.com/wiki/VDliw49rhieuq8kMQ9FcOYIrnNb';
const FEISHU_IMAGE_URL =
  'https://internal-api-drive-stream.larkoffice.com/space/api/box/stream/download/v2/cover/X2EobXMaJoKg2Fx72gmcdfAfnzg/?fallback_source=1&height=1280&mount_node_token=Mktdd1k3Mo4iTvxNkG5crBA7nvc&mount_point=docx_image&policy=equal&width=1280';

describe('Feishu document enhancement', () => {
  beforeEach(() => {
    resetFeishuDocumentCollectionForTest();
  });

  it('detects direct Feishu and Lark document URLs', () => {
    expect(isFeishuDocumentUrl(FEISHU_URL)).toBe(true);
    expect(isFeishuDocumentUrl('https://example.feishu.cn/docx/example')).toBe(true);
    expect(isFeishuDocumentUrl('https://bytedance.larkoffice.com/docx/example')).toBe(true);
    expect(isFeishuDocumentUrl('https://bytedance.larksuite.com/docx/example')).toBe(true);
    expect(isFeishuDocumentUrl('https://bytedance.larkoffice.com/wiki/example')).toBe(true);
    expect(isFeishuDocumentUrl(FEISHU_WIKI_URL)).toBe(true);
    expect(isFeishuDocumentUrl('https://bytedance.feishu.cn/wiki/example?from=from_copylink')).toBe(true);
    expect(isFeishuDocumentUrl('https://example.com/docx/example')).toBe(false);
    expect(isFeishuDocumentUrl('https://bytedance.larkoffice.com/base/example')).toBe(false);
  });

  it('converts rendered docx blocks into semantic document blocks', () => {
    const doc = createDocument(`
      <div class="render-unit-wrapper">
        <div class="block docx-page-block" data-record-id="page">
          <div>Container text should be ignored</div>
        </div>
        <div class="block docx-heading2-block" data-block-type="heading2" data-record-id="heading">
          <div>Two questions\u200b</div>
        </div>
        <div class="block docx-text-block" data-block-type="text" data-record-id="paragraph">
          <div>First paragraph\u200b</div>
        </div>
        <div class="block docx-quote-block" data-block-type="quote" data-record-id="quote">
          <div>Quoted text</div>
        </div>
        <div class="block docx-code-block" data-block-type="code" data-record-id="code">
          <div>const answer = 42;</div>
        </div>
        <div class="block docx-image-block" data-block-type="image" data-record-id="image-card">
          DeerFlow｜AI Coding AIGC 讨论群群名片加入加入
        </div>
        <div class="block docx-back_ref_list-block" data-block-type="back_ref_list" data-record-id="backrefrootblockid">
          本文暂未被其它文档引用
        </div>
        <div class="block docx-text-block isEmpty" data-block-type="text" data-record-id="empty"></div>
      </div>
    `);

    expect(collectVisibleFeishuBlocks(doc)).toEqual([
      {
        id: 'heading',
        level: 2,
        text: 'Two questions',
        type: 'heading',
      },
      {
        id: 'paragraph',
        text: 'First paragraph',
        type: 'paragraph',
      },
      {
        id: 'quote',
        text: 'Quoted text',
        type: 'quote',
      },
      {
        id: 'code',
        text: 'const answer = 42;',
        type: 'code',
      },
    ]);
  });

  it('keeps the final text paragraph after skipping trailing non-content blocks', () => {
    const doc = createDocument(`
      <div class="render-unit-wrapper">
        <div class="block docx-text-block" data-block-type="text" data-record-id="p1">
          它在那儿。
        </div>
        <div class="block docx-text-block focused" data-block-type="text" data-record-id="p2">
          然后开口。
        </div>
        <div class="block docx-image-block" data-block-type="image" data-record-id="group-card">
          DeerFlow｜AI Coding AIGC 讨论群群名片加入加入
        </div>
        <div class="block docx-back_ref_list-block" data-block-type="back_ref_list" data-record-id="backrefrootblockid">
          本文暂未被其它文档引用
        </div>
      </div>
    `);

    const blocks = collectVisibleFeishuBlocks(doc);

    expect(blocks.map((block) => block.text)).toEqual(['它在那儿。', '然后开口。']);
    expect(blocks.at(-1)?.text).toBe('然后开口。');
  });

  it('preserves rendered document links in mirrored article content', () => {
    const link = 'https://bytedance.larkoffice.com/wiki/GC4QweC6liUE45kBOO7culPBnAb';
    const doc = createDocument(`
      <div class="render-unit-wrapper">
        <div class="block docx-text-block" data-block-type="text" data-record-id="p1">
          阅读
          <a class="link contextmenu-without-copyperm" href="${link}" data-href="${encodeURIComponent(link)}" data-link-node="true">
            <span data-string="true">浏览器插件</span>
          </a>
          文档
        </div>
      </div>
    `);

    const blocks = collectVisibleFeishuBlocks(doc, { preserveMarkdownLinks: true });
    const article = renderFeishuDocumentPayload(doc, {
      title: 'Links',
      sourceUrl: FEISHU_URL,
      blocks,
    });

    expect(blocks[0]).toMatchObject({
      id: 'p1',
      text: '阅读 浏览器插件 文档',
      type: 'paragraph',
    });
    expect(article.querySelector('p')?.textContent).toBe('阅读 浏览器插件 文档');
    expect(article.querySelector('p a')?.getAttribute('href')).toBe(link);
  });

  it('keeps rendered Feishu document images in mirrored article content', () => {
    const doc = createDocument(`
      <div class="render-unit-wrapper">
        <div class="block docx-image-block" data-block-type="image" data-record-id="image-1">
          <img src="${FEISHU_IMAGE_URL}" alt="流程截图" width="1280" height="720" />
        </div>
      </div>
    `);

    const blocks = collectVisibleFeishuBlocks(doc);
    const article = renderFeishuDocumentPayload(doc, {
      title: 'Images',
      sourceUrl: FEISHU_URL,
      blocks,
    });
    const image = article.querySelector('img');

    expect(blocks).toEqual([
      {
        id: `image-1:image:0:${FEISHU_IMAGE_URL}`,
        type: 'image',
        src: FEISHU_IMAGE_URL,
        alt: '流程截图',
        width: '1280',
        height: '720',
      },
    ]);
    expect(image?.getAttribute('src')).toBe(FEISHU_IMAGE_URL);
    expect(image?.getAttribute('data-src')).toBe(FEISHU_IMAGE_URL);
    expect(image?.getAttribute('loading')).toBe('eager');
    expect(image?.getAttribute('alt')).toBe('流程截图');
  });

  it('keeps Feishu image URLs whose size is only exposed in query params', () => {
    const doc = createDocument(`
      <div class="render-unit-wrapper">
        <div class="block docx-text-block" data-block-type="text" data-record-id="image-in-text">
          <span><img src="${FEISHU_IMAGE_URL}" alt="架构图" /></span>
        </div>
      </div>
    `);

    expect(collectVisibleFeishuBlocks(doc)).toEqual([
      {
        id: `image-in-text:image:0:${FEISHU_IMAGE_URL}`,
        type: 'image',
        src: FEISHU_IMAGE_URL,
        alt: '架构图',
        width: '',
        height: '',
      },
    ]);
  });

  it('uses data-src when Feishu renders a placeholder img src', () => {
    const doc = createDocument(`
      <div class="render-unit-wrapper">
        <div class="block docx-image-block" data-block-type="image" data-record-id="image-2">
          <img src="data:image/gif;base64,placeholder" data-src="https://example.com/real-feishu-image.png" alt="Real image" />
          <span>附件不支持打印</span>
        </div>
      </div>
    `);

    expect(collectVisibleFeishuBlocks(doc)).toEqual([
      {
        id: 'image-2:image:0:https://example.com/real-feishu-image.png',
        type: 'image',
        src: 'https://example.com/real-feishu-image.png',
        alt: 'Real image',
        width: '',
        height: '',
      },
    ]);
  });

  it('filters blob image sources and keeps the durable Feishu image URL', () => {
    const doc = createDocument(`
      <div class="render-unit-wrapper">
        <div class="block docx-image-block" data-block-type="image" data-record-id="image-3">
          <img src="blob:https://bytedance.larkoffice.com/transient-image" data-src="${FEISHU_IMAGE_URL}" alt="流程图" />
        </div>
      </div>
    `);

    const blocks = collectVisibleFeishuBlocks(doc);
    const article = renderFeishuDocumentPayload(doc, {
      title: 'Blob images',
      sourceUrl: FEISHU_URL,
      blocks,
    });

    expect(blocks).toEqual([
      {
        id: `image-3:image:0:${FEISHU_IMAGE_URL}`,
        type: 'image',
        src: FEISHU_IMAGE_URL,
        alt: '流程图',
        width: '',
        height: '',
      },
    ]);
    expect(article.querySelector('img')?.getAttribute('src')).toBe(FEISHU_IMAGE_URL);
    expect(article.outerHTML).not.toContain('blob:');
  });

  it('drops blob-only Feishu images because they cannot survive Markdown clipping', () => {
    const doc = createDocument(`
      <div class="render-unit-wrapper">
        <div class="block docx-image-block" data-block-type="image" data-record-id="blob-only">
          <img src="blob:https://bytedance.larkoffice.com/transient-image" alt="临时图片" />
        </div>
      </div>
    `);

    expect(collectVisibleFeishuBlocks(doc)).toEqual([]);
  });

  it('reads rendered blocks inside open shadow roots', () => {
    const doc = createDocument('<main><lark-doc></lark-doc></main>');
    const host = doc.querySelector('lark-doc')!;
    const shadowRoot = host.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `
      <div class="render-unit-wrapper">
        <div class="block docx-text-block" data-block-type="text" data-record-id="shadow-p">
          Shadow paragraph
        </div>
      </div>
    `;

    expect(collectVisibleFeishuBlocks(doc)).toEqual([
      {
        id: 'shadow-p',
        text: 'Shadow paragraph',
        type: 'paragraph',
      },
    ]);
  });

  it('collects virtualized content while scrolling the document container', async () => {
    const doc = createDocument(`
      <div class="bear-web-x-container">
        <div class="render-unit-wrapper">
          <div class="block docx-text-block" data-block-type="text" data-record-id="p1">
            First rendered paragraph
          </div>
        </div>
      </div>
    `);
    const scrollContainer = doc.querySelector<HTMLElement>('.bear-web-x-container')!;
    const renderRoot = doc.querySelector<HTMLElement>('.render-unit-wrapper')!;
    setScrollMetrics(scrollContainer, {
      scrollHeight: 1400,
      clientHeight: 500,
    });

    const payload = await collectFeishuDocumentPayload(window, doc, FEISHU_URL, {
      maxScrollSteps: 3,
      waitMs: 0,
      waitForRender: async () => {
        if (scrollContainer.scrollTop > 0 && !doc.querySelector('[data-record-id="p2"]')) {
          renderRoot.insertAdjacentHTML(
            'beforeend',
            `
              <div class="block docx-text-block" data-block-type="text" data-record-id="p2">
                Later rendered paragraph
              </div>
            `,
          );
        }
      },
    });

    expect(payload.blocks.map((block) => block.text)).toEqual([
      'First rendered paragraph',
      'Later rendered paragraph',
    ]);
    expect(scrollContainer.scrollTop).toBe(0);
  });

  it('renders and restores a mirrored article on direct document pages', async () => {
    const doc = createDocument(
      `
        <div class="bear-web-x-container">
          <div class="render-unit-wrapper">
            <div class="block docx-heading3-block" data-block-type="heading3" data-record-id="h3">Next step</div>
            <div class="block docx-text-block" data-block-type="text" data-record-id="p1">Ship it</div>
          </div>
        </div>
      `,
      '\u2061\u2062\u202cLaunch Plan - Docs',
    );
    const sourceRoot = doc.querySelector<HTMLElement>('.render-unit-wrapper');

    const status = await enhanceFeishuDocument(window, doc, FEISHU_URL, {
      maxScrollSteps: 0,
      waitMs: 0,
    });
    const article = doc.querySelector('#obsidian-clipper-extended-feishu-document');

    expect(status).toMatchObject({
      site: 'feishu',
      enabled: true,
      active: true,
      label: 'Feishu document enhancer active for 2 blocks',
    });
    expect(article?.getAttribute('data-obsidian-clipper-extended-enhanced')).toBe('feishu');
    expect(article?.textContent).toContain('Launch Plan');
    expect(article?.getAttribute('style')).toContain('left:0!important');
    expect(article?.getAttribute('style')).toContain('opacity:0.01!important');
    expect(article?.querySelector('h3')?.textContent).toBe('Next step');
    expect(article?.querySelector('p')?.textContent).toBe('Ship it');
    expect(sourceRoot?.getAttribute('aria-hidden')).toBe('true');
    expect(sourceRoot?.getAttribute('data-obsidian-clipper-extended-feishu-source-content')).toBe('true');
    expect(getFeishuEnhancementStatus(doc, FEISHU_URL, true).active).toBe(true);

    restoreFeishuEnhancement(doc);

    expect(doc.querySelector('#obsidian-clipper-extended-feishu-document')).toBeNull();
    expect(sourceRoot?.hasAttribute('aria-hidden')).toBe(false);
    expect(sourceRoot?.hasAttribute('data-obsidian-clipper-extended-feishu-source-content')).toBe(false);
  });

  it('hides the wiki app shell behind the mirrored article', async () => {
    const doc = createDocument(
      `
        <div id="wiki-app">
          <header>Navigation should be hidden from clipping</header>
          <main>
            <div class="wiki-page-title">Wiki title chrome</div>
            <div data-block-type="heading2" data-record-id="h2">正文标题</div>
            <div data-block-type="text" data-record-id="p1">正文段落</div>
          </main>
          <footer>Footer should be hidden from clipping</footer>
        </div>
      `,
      'Wiki Document - Docs',
    );
    const appRoot = doc.querySelector<HTMLElement>('#wiki-app')!;

    await enhanceFeishuDocument(window, doc, FEISHU_WIKI_URL, {
      maxScrollSteps: 0,
      waitMs: 0,
    });

    const article = doc.querySelector('#obsidian-clipper-extended-feishu-document');

    expect(article?.querySelector('h2')?.textContent).toBe('正文标题');
    expect(article?.querySelector('p')?.textContent).toBe('正文段落');
    expect(appRoot.getAttribute('aria-hidden')).toBe('true');
    expect(appRoot.getAttribute('data-obsidian-clipper-extended-feishu-source-content')).toBe('true');

    restoreFeishuEnhancement(doc);

    expect(appRoot.hasAttribute('aria-hidden')).toBe(false);
    expect(appRoot.hasAttribute('data-obsidian-clipper-extended-feishu-source-content')).toBe(false);
  });

  it('keeps docx source hiding scoped to the render root', async () => {
    const doc = createDocument(`
      <div id="docx-app">
        <nav>Navigation remains outside the docx source root</nav>
        <div class="render-unit-wrapper">
          <div class="block docx-text-block" data-block-type="text" data-record-id="p1">
            Docx paragraph
          </div>
        </div>
      </div>
    `);
    const appRoot = doc.querySelector<HTMLElement>('#docx-app')!;
    const sourceRoot = doc.querySelector<HTMLElement>('.render-unit-wrapper')!;

    await enhanceFeishuDocument(window, doc, FEISHU_URL, {
      maxScrollSteps: 0,
      waitMs: 0,
    });

    expect(sourceRoot.getAttribute('aria-hidden')).toBe('true');
    expect(appRoot.hasAttribute('aria-hidden')).toBe(false);
  });

  it('renders payloads without depending on ByteTech DOM markers', () => {
    const doc = createDocument('<main></main>');

    renderFeishuDocumentPayload(doc, {
      title: 'Standalone Doc',
      sourceUrl: FEISHU_URL,
      blocks: [
        {
          id: 'p1',
          type: 'paragraph',
          text: 'Independent Feishu content',
        },
      ],
    });

    expect(doc.querySelector('#obsidian-clipper-extended-feishu-document')?.textContent).toContain(
      'Independent Feishu content',
    );
    expect(doc.querySelector('#obsidian-clipper-extended-bytetech-article')).toBeNull();
  });
});

function createDocument(body: string, title = ''): Document {
  return new DOMParser().parseFromString(
    `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`,
    'text/html',
  );
}

function setScrollMetrics(
  element: HTMLElement,
  metrics: {
    scrollHeight: number;
    clientHeight: number;
    scrollWidth?: number;
    clientWidth?: number;
  },
): void {
  Object.defineProperties(element, {
    scrollHeight: { configurable: true, value: metrics.scrollHeight },
    clientHeight: { configurable: true, value: metrics.clientHeight },
    scrollWidth: { configurable: true, value: metrics.scrollWidth ?? 0 },
    clientWidth: { configurable: true, value: metrics.clientWidth ?? 0 },
  });
}
