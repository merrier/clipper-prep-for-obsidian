import { describe, expect, it } from 'vitest';

import {
  collectBytetechLarkArticlePayload,
  collectVisibleLarkBlocks,
  installBytetechDefuddleShadowPatch,
  installBytetechArticleReceiver,
  installBytetechSourceFrameBlobResolver,
  isBytetechArticleUrl,
  isBytetechSourceFrameUrl,
  parseBytetechMainWorldMessage,
  normalizeBytetechArticlePayloadForPage,
  postBytetechArticleFromSourceFrame,
  renderBytetechArticlePayload,
  renderBytetechArticlePayloadInShadowDom,
  resetBytetechSourceFrameCollectionForTest,
  restoreBytetechEnhancement,
} from './bytetech';

const BYTETECH_URL = 'https://bytetech.info/articles/7633373655913365542#UeGkdMI01olTL9xpBXLlMAykg0e';
const LARK_FRAME_URL =
  'https://bytedance.larkoffice.com/docx/UeGkdMI01olTL9xpBXLlMAykg0e?opendoc=1';
const LARK_SG_FRAME_URL =
  'https://bytedance.sg.larkoffice.com/docx/UeGkdMI01olTL9xpBXLlMAykg0e?opendoc=1';

describe('ByteTech article enhancement', () => {
  it('detects ByteTech article and Lark source frame URLs', () => {
    expect(isBytetechArticleUrl(BYTETECH_URL)).toBe(true);
    expect(isBytetechArticleUrl('https://bytetech.info/articles/123')).toBe(true);
    expect(isBytetechArticleUrl('https://bytetech.info/videos/123')).toBe(false);

    expect(isBytetechSourceFrameUrl(LARK_FRAME_URL)).toBe(true);
    expect(isBytetechSourceFrameUrl(LARK_SG_FRAME_URL)).toBe(true);
    expect(isBytetechSourceFrameUrl('https://bytedance.feishu.cn/docx/example')).toBe(true);
    expect(isBytetechSourceFrameUrl('https://bytedance.larksuite.com/docx/example')).toBe(true);
    expect(isBytetechSourceFrameUrl('https://bytedance.larkoffice.com/wiki/example')).toBe(false);
    expect(isBytetechSourceFrameUrl('https://example.larkoffice.com/docx/example')).toBe(false);
  });

  it('converts rendered Lark blocks into semantic article blocks', () => {
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
        <div class="block docx-text-block isEmpty" data-block-type="text" data-record-id="empty"></div>
        <div class="block docx-text-block" data-block-type="text" data-record-id="emoji">
          <img class="larkw-emoji__img" src="data:image/png;base64,abc" alt="thumb" />
        </div>
        <div class="block docx-image-block" data-block-type="image" data-record-id="image">
          <img src="https://example.com/chart.png" alt="Chart" width="640" height="360" />
        </div>
      </div>
    `);

    expect(collectVisibleLarkBlocks(doc)).toEqual([
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
        alt: 'Chart',
        height: '360',
        id: 'image:image:0:https://example.com/chart.png',
        src: 'https://example.com/chart.png',
        type: 'image',
        width: '640',
      },
    ]);
  });

  it('preserves rendered Lark links in mirrored article content', () => {
    const link = 'https://bytedance.larkoffice.com/wiki/GC4QweC6liUE45kBOO7culPBnAb';
    const sourceDoc = createDocument(`
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
    const targetDoc = createDocument(`<main><iframe src="${LARK_FRAME_URL}"></iframe></main>`);
    const blocks = collectVisibleLarkBlocks(sourceDoc, { preserveMarkdownLinks: true });
    const article = renderBytetechArticlePayload(targetDoc, {
      title: 'Links',
      sourceUrl: LARK_FRAME_URL,
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

  it('keeps images when Lark adds an unsupported-printing placeholder', () => {
    const doc = createDocument(`
      <div class="render-unit-wrapper">
        <div class="block docx-image-block" data-block-type="image" data-record-id="image-with-placeholder">
          <img src="data:image/gif;base64,placeholder" data-src="https://example.com/real-image.png" alt="Real image" />
          <span>附件不支持打印</span>
        </div>
      </div>
    `);

    expect(collectVisibleLarkBlocks(doc)).toEqual([
      {
        alt: 'Real image',
        height: '',
        id: 'image-with-placeholder:image:0:https://example.com/real-image.png',
        src: 'https://example.com/real-image.png',
        type: 'image',
        width: '',
      },
    ]);
  });

  it('keeps Lark attachment image URLs stored on data attributes', () => {
    const doc = createDocument(`
      <div class="render-unit-wrapper">
        <div class="block docx-file-block" data-block-type="file" data-record-id="attachment-image">
          <div data-image-url="https://example.com/lark-attachment.png?image_size=640x360">
            <span>附件不支持打印</span>
          </div>
        </div>
      </div>
    `);

    expect(collectVisibleLarkBlocks(doc)).toEqual([
      {
        alt: '',
        height: '',
        id: 'attachment-image:image:0:https://example.com/lark-attachment.png?image_size=640x360',
        src: 'https://example.com/lark-attachment.png?image_size=640x360',
        type: 'image',
        width: '',
      },
    ]);
  });

  it('drops unsupported-printing placeholders when no image URL is available', () => {
    const doc = createDocument(`
      <div class="render-unit-wrapper">
        <div class="block docx-file-block" data-block-type="file" data-record-id="missing-image">
          附件不支持打印
        </div>
      </div>
    `);

    expect(collectVisibleLarkBlocks(doc)).toEqual([]);
  });

  it('removes unsupported-printing text from captions while keeping the caption text', () => {
    const doc = createDocument(`
      <div class="render-unit-wrapper">
        <div class="block docx-file-block" data-block-type="file" data-record-id="captioned-image">
          配图说明 附件不支持打印
        </div>
      </div>
    `);

    expect(collectVisibleLarkBlocks(doc)).toEqual([
      {
        id: 'captioned-image',
        text: '配图说明',
        type: 'paragraph',
      },
    ]);
  });

  it('keeps image URLs rendered next to Lark unsupported-printing placeholders', () => {
    const doc = createDocument(`
      <div class="render-unit-wrapper">
        <div class="block docx-file-block" data-block-type="file" data-record-id="placeholder-image">
          附件不支持打印
        </div>
        <div class="docx-image-renderer">
          <img src="https://example.com/rendered-next-to-placeholder.png" width="720" height="405" />
        </div>
      </div>
    `);

    expect(collectVisibleLarkBlocks(doc)).toEqual([
      {
        alt: '',
        height: '405',
        id: 'placeholder-image:image:0:https://example.com/rendered-next-to-placeholder.png',
        src: 'https://example.com/rendered-next-to-placeholder.png',
        type: 'image',
        width: '720',
      },
    ]);
  });

  it('keeps CSS image URLs rendered near Lark unsupported-printing placeholders', () => {
    const doc = createDocument(`
      <div class="render-unit-wrapper">
        <div
          class="block docx-file-block"
          data-block-type="file"
          data-record-id="css-placeholder-image"
        >
          附件不支持打印
        </div>
        <div
          class="docx-image-renderer"
          aria-label="Rendered image"
          style="--preview: url(&quot;https://example.com/nearby-style-image.png&quot;); width: 640px; height: 360px;"
        ></div>
      </div>
    `);

    expect(collectVisibleLarkBlocks(doc)).toEqual([
      {
        alt: 'Rendered image',
        height: '360px',
        id: 'css-placeholder-image:image:0:https://example.com/nearby-style-image.png',
        src: 'https://example.com/nearby-style-image.png',
        type: 'image',
        width: '640px',
      },
    ]);
  });

  it('keeps standalone rendered images that Lark places outside text blocks', () => {
    const doc = createDocument(`
      <div class="render-unit-wrapper">
        <div class="block docx-text-block" data-block-type="text" data-record-id="before-image">
          Before image
        </div>
        <img
          src="https://example.com/standalone-rendered-image.png"
          width="900"
          height="506"
          alt="Standalone"
        />
        <div class="block docx-text-block" data-block-type="text" data-record-id="after-image">
          After image
        </div>
      </div>
    `);

    expect(collectVisibleLarkBlocks(doc)).toEqual([
      {
        id: 'before-image',
        text: 'Before image',
        type: 'paragraph',
      },
      {
        alt: 'Standalone',
        height: '506',
        id: 'standalone-image:0:image:0:https://example.com/standalone-rendered-image.png',
        src: 'https://example.com/standalone-rendered-image.png',
        type: 'image',
        width: '900',
      },
      {
        id: 'after-image',
        text: 'After image',
        type: 'paragraph',
      },
    ]);
  });

  it('ignores Lark decorative loading illustrations outside text blocks', () => {
    const doc = createDocument(`
      <div class="render-unit-wrapper">
        <div class="block docx-text-block" data-block-type="text" data-record-id="p1">
          Article paragraph
        </div>
        <img
          src="https://lf-package-sg.feishucdn.com/obj/lark-static-sg/eesz/bear/docx/module/media/illustration_empty_positive_loading_l"
          width="640"
          height="360"
          alt=""
        />
      </div>
    `);

    expect(collectVisibleLarkBlocks(doc)).toEqual([
      {
        id: 'p1',
        text: 'Article paragraph',
        type: 'paragraph',
      },
    ]);
  });

  it('ignores small avatar images inside non-image Lark cards', () => {
    const doc = createDocument(`
      <div class="render-unit-wrapper">
        <div class="block docx-card-block" data-block-type="card" data-record-id="group-card">
          <img src="https://s3-imfile.feishucdn.com/static-resource/v1/avatar~?image_size=72x72&amp;cut_type=default-face&amp;format=jpeg" width="72" height="72" />
          <span>Agentara Underground 情报站</span>
        </div>
      </div>
    `);

    expect(collectVisibleLarkBlocks(doc)).toEqual([
      {
        id: 'group-card',
        text: 'Agentara Underground 情报站',
        type: 'paragraph',
      },
    ]);
  });

  it('collects background-image URLs from rendered Lark image blocks', () => {
    const doc = createDocument(`
      <div class="render-unit-wrapper">
        <div class="block docx-image-block" data-block-type="image" data-record-id="background-image">
          <div aria-label="Background image" style="background-image: url(&quot;https://example.com/bg.png&quot;)"></div>
        </div>
      </div>
    `);

    expect(collectVisibleLarkBlocks(doc)).toEqual([
      {
        alt: 'Background image',
        height: '',
        id: 'background-image:image:0:https://example.com/bg.png',
        src: 'https://example.com/bg.png',
        type: 'image',
        width: '',
      },
    ]);
  });

  it('keeps article blocks nested inside a Lark page wrapper', () => {
    const doc = createDocument(`
      <div class="render-unit-wrapper">
        <div class="block docx-page-block" data-record-id="page">
          <div class="block docx-text-block" data-block-type="text" data-record-id="nested-p">
            Nested paragraph
          </div>
        </div>
      </div>
    `);

    expect(collectVisibleLarkBlocks(doc)).toEqual([
      {
        id: 'nested-p',
        text: 'Nested paragraph',
        type: 'paragraph',
      },
    ]);
  });

  it('keeps repeated wrapper-free paragraphs when Lark omits explicit block ids', () => {
    const doc = createDocument(`
      <div class="render-unit-wrapper">
        <div class="block docx-text-block" data-block-type="text">Repeated line</div>
        <div class="block docx-text-block" data-block-type="text">Repeated line</div>
      </div>
    `);

    expect(collectVisibleLarkBlocks(doc)).toEqual([
      expect.objectContaining({ id: 'text:0:Repeated line', text: 'Repeated line' }),
      expect.objectContaining({ id: 'text:1:Repeated line', text: 'Repeated line' }),
    ]);
  });

  it('collects Lark blocks when render wrappers are omitted', () => {
    const doc = createDocument(`
      <div class="docx-text-block" data-block-type="text" data-record-id="orphan-p">
        Wrapper-free paragraph
      </div>
      <div class="docx-heading2-block" data-block-type="heading2" data-record-id="orphan-h">
        Wrapper-free heading
      </div>
    `);

    expect(collectVisibleLarkBlocks(doc)).toEqual([
      {
        id: 'orphan-p',
        text: 'Wrapper-free paragraph',
        type: 'paragraph',
      },
      {
        id: 'orphan-h',
        level: 2,
        text: 'Wrapper-free heading',
        type: 'heading',
      },
    ]);
  });

  it('collects rendered Lark blocks inside open shadow DOM', () => {
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

    expect(collectVisibleLarkBlocks(doc)).toEqual([
      {
        id: 'shadow-p',
        text: 'Shadow paragraph',
        type: 'paragraph',
      },
    ]);
  });

  it('collects payloads and renders a mirrored article for clipping', async () => {
    const sourceDoc = createDocument(`
      <div class="render-unit-wrapper">
        <div class="block docx-heading3-block" data-block-type="heading3" data-record-id="h3">Next step</div>
        <div class="block docx-text-block" data-block-type="text" data-record-id="p1">Ship it</div>
      </div>
    `);
    sourceDoc.title = '\u200d\u2061ByteTech title - flying document';

    const payload = await collectBytetechLarkArticlePayload(window, sourceDoc, LARK_SG_FRAME_URL, {
      waitForRender: () => Promise.resolve(),
    });

    const targetDoc = createDocument(`<main><iframe src="${LARK_SG_FRAME_URL}" style="width: 100%;"></iframe></main>`);
    const article = renderBytetechArticlePayload(targetDoc, payload);

    expect(payload.title).toBe('ByteTech title');
    expect(article.getAttribute('data-obsidian-clipper-extended-enhanced')).toBe('bytetech');
    expect(article.querySelector('h1')?.textContent).toBe('ByteTech title');
    expect(article.querySelector('h3')?.textContent).toBe('Next step');
    expect(article.querySelector('p')?.textContent).toBe('Ship it');
    expect(article.getAttribute('style')).toContain('display:block');
    expect(article.getAttribute('style')).toContain('left:-100000px');
    expect(targetDoc.querySelector('iframe')).not.toBeNull();
    expect(targetDoc.querySelector('iframe')?.getAttribute('aria-hidden')).toBe('true');
    expect(targetDoc.querySelector('iframe')?.getAttribute('data-obsidian-clipper-extended-source-frame')).toBe('true');

    restoreBytetechEnhancement(targetDoc);

    const restoredFrame = targetDoc.querySelector('iframe');
    expect(restoredFrame?.src).toBe(LARK_SG_FRAME_URL);
    expect(restoredFrame?.getAttribute('style')).toBe('width: 100%;');
    expect(restoredFrame?.hasAttribute('aria-hidden')).toBe(false);
    expect(targetDoc.querySelector('#obsidian-clipper-extended-bytetech-article')).toBeNull();
  });

  it('does not post image-only ByteTech source-frame payloads while image clipping is disabled', async () => {
    const posts: unknown[] = [];
    const fakeWindow = {
      parent: {
        postMessage(message: unknown) {
          posts.push(message);
        },
      },
      fetch: async () => ({
        ok: true,
        blob: async () => new Blob(['fake-image'], { type: 'image/png' }),
      }),
      setTimeout(callback: () => void) {
        callback();
        return 0;
      },
    } as unknown as Window;
    const sourceDoc = createDocument(`
      <div class="render-unit-wrapper">
        <div class="block docx-image-block" data-block-type="image" data-record-id="blob-image">
          <img
            src="blob:https://bytedance.sg.larkoffice.com/source-frame-image"
            width="640"
            height="360"
            alt="Blob image"
          />
        </div>
      </div>
    `);
    sourceDoc.title = 'Blob image title';

    await postBytetechArticleFromSourceFrame(fakeWindow, sourceDoc, LARK_SG_FRAME_URL, {
      maxScrollSteps: 0,
      waitForRender: () => Promise.resolve(),
    });

    expect(posts).toEqual([]);
  });

  it('does not resolve source-frame blob images while image clipping is disabled', async () => {
    const posts: unknown[] = [];
    let fetchCount = 0;
    const fakeWindow = new EventTarget() as Window;

    Object.defineProperties(fakeWindow, {
      location: {
        value: {
          href: LARK_SG_FRAME_URL,
          origin: 'https://bytedance.sg.larkoffice.com',
        },
      },
      parent: {
        value: {
          postMessage(message: unknown) {
            posts.push(message);
          },
        },
      },
      fetch: {
        value: async () => {
          fetchCount += 1;

          if (fetchCount === 1) {
            throw new Error('isolated world cannot read page blob');
          }

          return {
            ok: true,
            blob: async () => new Blob(['main-world-image'], { type: 'image/png' }),
          };
        },
      },
      postMessage: {
        value(message: unknown) {
          fakeWindow.dispatchEvent(
            new MessageEvent('message', {
              data: message,
              origin: 'https://bytedance.sg.larkoffice.com',
              source: fakeWindow,
            }),
          );
        },
      },
      setTimeout: {
        value: window.setTimeout.bind(window),
      },
      clearTimeout: {
        value: window.clearTimeout.bind(window),
      },
    });

    installBytetechSourceFrameBlobResolver(fakeWindow);

    const sourceDoc = createDocument(`
      <div class="render-unit-wrapper">
        <div class="block docx-image-block" data-block-type="image" data-record-id="bridge-blob-image">
          <img
            src="blob:https://bytedance.sg.larkoffice.com/source-frame-image-bridge"
            width="640"
            height="360"
            alt="Bridge blob image"
          />
        </div>
      </div>
    `);
    sourceDoc.title = 'Bridge blob image title';

    await postBytetechArticleFromSourceFrame(fakeWindow, sourceDoc, LARK_SG_FRAME_URL, {
      maxScrollSteps: 0,
      waitForRender: () => Promise.resolve(),
    });

    expect(fetchCount).toBe(0);
    expect(posts).toEqual([]);
  });

  it('accumulates ByteTech source-frame blocks across repeated visible collections', async () => {
    resetBytetechSourceFrameCollectionForTest();

    const posts: unknown[] = [];
    const fakeWindow = {
      parent: {
        postMessage(message: unknown) {
          posts.push(message);
        },
      },
      setTimeout(callback: () => void) {
        callback();
        return 0;
      },
    } as unknown as Window;
    const sourceDoc = createDocument(`
      <div class="render-unit-wrapper">
        <div class="block docx-text-block" data-block-type="text" data-record-id="p1">First visible paragraph</div>
      </div>
    `);
    sourceDoc.title = 'ByteTech title';

    await postBytetechArticleFromSourceFrame(fakeWindow, sourceDoc, LARK_SG_FRAME_URL, {
      maxScrollSteps: 0,
      waitForRender: () => Promise.resolve(),
    });

    sourceDoc.body.innerHTML = `
      <div class="render-unit-wrapper">
        <div class="block docx-text-block" data-block-type="text" data-record-id="p2">Later rendered paragraph</div>
      </div>
    `;

    await postBytetechArticleFromSourceFrame(fakeWindow, sourceDoc, LARK_SG_FRAME_URL, {
      maxScrollSteps: 0,
      waitForRender: () => Promise.resolve(),
    });

    const lastPost = posts.at(-1) as {
      payload: {
        blocks: Array<{ id: string; text?: string }>;
      };
    };

    expect(lastPost.payload.blocks).toEqual([
      expect.objectContaining({ id: 'p1', text: 'First visible paragraph' }),
      expect.objectContaining({ id: 'p2', text: 'Later rendered paragraph' }),
    ]);
  });

  it('inserts newly observed earlier blocks before an existing visible anchor', async () => {
    resetBytetechSourceFrameCollectionForTest();

    const posts: unknown[] = [];
    const fakeWindow = {
      parent: {
        postMessage(message: unknown) {
          posts.push(message);
        },
      },
      setTimeout(callback: () => void) {
        callback();
        return 0;
      },
    } as unknown as Window;
    const sourceDoc = createDocument(`
      <div class="render-unit-wrapper">
        <div class="block docx-text-block" data-block-type="text" data-record-id="p10">Paragraph 10</div>
        <div class="block docx-text-block" data-block-type="text" data-record-id="p11">Paragraph 11</div>
      </div>
    `);
    sourceDoc.title = 'ByteTech title';

    await postBytetechArticleFromSourceFrame(fakeWindow, sourceDoc, LARK_SG_FRAME_URL, {
      maxScrollSteps: 0,
      waitForRender: () => Promise.resolve(),
    });

    sourceDoc.body.innerHTML = `
      <div class="render-unit-wrapper">
        <div class="block docx-text-block" data-block-type="text" data-record-id="p8">Paragraph 8</div>
        <div class="block docx-text-block" data-block-type="text" data-record-id="p9">Paragraph 9</div>
        <div class="block docx-text-block" data-block-type="text" data-record-id="p10">Paragraph 10</div>
      </div>
    `;

    await postBytetechArticleFromSourceFrame(fakeWindow, sourceDoc, LARK_SG_FRAME_URL, {
      maxScrollSteps: 0,
      waitForRender: () => Promise.resolve(),
    });

    const lastPost = posts.at(-1) as {
      payload: {
        blocks: Array<{ id: string; text?: string }>;
      };
    };

    expect(lastPost.payload.blocks.map((block) => block.id)).toEqual(['p8', 'p9', 'p10', 'p11']);
  });

  it('scrolls the rendered article container instead of unrelated scrollable side panels', async () => {
    const sourceDoc = createDocument(`
      <aside id="comments-panel">
        <div style="height: 4000px;">Comments should not drive article collection</div>
      </aside>
      <section id="article-scroll">
        <div class="render-unit-wrapper">
          <div class="block docx-text-block" data-block-type="text" data-record-id="p1">First rendered paragraph</div>
        </div>
      </section>
    `);
    const commentsPanel = sourceDoc.querySelector<HTMLElement>('#comments-panel')!;
    const articleScroll = sourceDoc.querySelector<HTMLElement>('#article-scroll')!;

    setScrollMetrics(commentsPanel, { scrollHeight: 5000, clientHeight: 400 });
    setScrollMetrics(articleScroll, { scrollHeight: 1400, clientHeight: 400 });

    const payload = await collectBytetechLarkArticlePayload(window, sourceDoc, LARK_SG_FRAME_URL, {
      maxScrollSteps: 3,
      waitForRender: () => {
        if (articleScroll.scrollTop > 0) {
          articleScroll.innerHTML = `
            <div class="render-unit-wrapper">
              <div class="block docx-text-block" data-block-type="text" data-record-id="p2">Later rendered paragraph</div>
            </div>
          `;
        }

        return Promise.resolve();
      },
    });

    expect(payload.blocks).toEqual([
      expect.objectContaining({ id: 'p1', text: 'First rendered paragraph' }),
      expect.objectContaining({ id: 'p2', text: 'Later rendered paragraph' }),
    ]);
  });

  it('keeps scrolling through virtualized gaps until later article blocks render', async () => {
    const sourceDoc = createDocument(`
      <section id="article-scroll">
        <div class="render-unit-wrapper">
          <div class="block docx-text-block" data-block-type="text" data-record-id="p1">First rendered paragraph</div>
        </div>
      </section>
    `);
    const articleScroll = sourceDoc.querySelector<HTMLElement>('#article-scroll')!;

    setScrollMetrics(articleScroll, { scrollHeight: 5200, clientHeight: 400 });

    const payload = await collectBytetechLarkArticlePayload(window, sourceDoc, LARK_SG_FRAME_URL, {
      maxScrollSteps: 12,
      waitForRender: () => {
        if (articleScroll.scrollTop >= 3780) {
          articleScroll.innerHTML = `
            <div class="render-unit-wrapper">
              <div class="block docx-text-block" data-block-type="text" data-record-id="p2">Late virtualized paragraph</div>
            </div>
          `;
        }

        return Promise.resolve();
      },
    });

    expect(payload.blocks).toEqual([
      expect.objectContaining({ id: 'p1', text: 'First rendered paragraph' }),
      expect.objectContaining({ id: 'p2', text: 'Late virtualized paragraph' }),
    ]);
  });

  it('mirrors ByteTech Lark iframes from shadow DOM without removing the live frame', async () => {
    const targetDoc = createDocument('<main><tt-docs-component></tt-docs-component></main>');
    const host = targetDoc.querySelector('tt-docs-component');
    const shadowRoot = host?.attachShadow({ mode: 'open' });
    shadowRoot!.innerHTML = `<div><iframe src="${LARK_FRAME_URL}" style="height: 100%;"></iframe></div>`;

    const article = renderBytetechArticlePayload(targetDoc, {
      title: 'Shadow title',
      sourceUrl: LARK_FRAME_URL,
      blocks: [
        {
          id: 'p1',
          text: 'Shadow article body',
          type: 'paragraph',
        },
        {
          id: 'img1',
          src: 'data:image/png;base64,abc',
          type: 'image',
        },
      ],
    });

    expect(shadowRoot?.querySelector('iframe')).not.toBeNull();
    expect(shadowRoot?.querySelector('iframe')?.getAttribute('aria-hidden')).toBe('true');
    expect(shadowRoot?.querySelector('#obsidian-clipper-extended-bytetech-article')).toBeNull();
    expect(targetDoc.querySelector('#obsidian-clipper-extended-bytetech-article')).toBe(article);
    expect(article.textContent).toContain('Shadow article body');

    restoreBytetechEnhancement(targetDoc);

    expect(shadowRoot?.querySelector('iframe')?.src).toBe(LARK_FRAME_URL);
    expect(shadowRoot?.querySelector('iframe')?.hasAttribute('aria-hidden')).toBe(false);
    expect(shadowRoot?.querySelector('#obsidian-clipper-extended-bytetech-article')).toBeNull();
    expect(targetDoc.querySelector('#obsidian-clipper-extended-bytetech-article')).toBeNull();
  });

  it('accepts source-frame payloads when the ByteTech hash is not the document token', () => {
    const targetDoc = createDocument(`<main><iframe src="${LARK_FRAME_URL}"></iframe></main>`);
    const fakeWindow = new EventTarget() as Window;

    Object.defineProperty(fakeWindow, 'location', {
      value: {
        href: 'https://bytetech.info/articles/7633373655913365542#doxlgpsYiN5ZyuRIQcXvgABcqsb',
        origin: 'https://bytetech.info',
      },
    });
    Object.defineProperty(fakeWindow, 'postMessage', {
      value: () => undefined,
    });

    installBytetechArticleReceiver(fakeWindow, targetDoc);
    fakeWindow.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://bytedance.larkoffice.com',
        data: {
          source: 'obsidian-clipper-extended:bytetech',
          type: 'article',
          payload: {
            title: 'ByteTech title',
            sourceUrl: LARK_FRAME_URL,
            blocks: [
              {
                id: 'p1',
                text: 'Article body from iframe',
                type: 'paragraph',
              },
            ],
          },
        },
      }),
    );

    expect(targetDoc.querySelector('#obsidian-clipper-extended-bytetech-article')?.textContent).toContain(
      'Article body from iframe',
    );
  });

  it('accepts sandboxed source-frame payloads with an opaque origin', () => {
    const targetDoc = createDocument(`<main><iframe src="${LARK_FRAME_URL}"></iframe></main>`);
    const fakeWindow = new EventTarget() as Window;

    Object.defineProperty(fakeWindow, 'location', {
      value: {
        href: BYTETECH_URL,
        origin: 'https://bytetech.info',
      },
    });
    Object.defineProperty(fakeWindow, 'postMessage', {
      value: () => undefined,
    });

    installBytetechArticleReceiver(fakeWindow, targetDoc);
    fakeWindow.dispatchEvent(
      new MessageEvent('message', {
        origin: 'null',
        data: {
          source: 'obsidian-clipper-extended:bytetech',
          type: 'article',
          payload: {
            title: 'ByteTech title',
            sourceUrl: LARK_FRAME_URL,
            blocks: [
              {
                id: 'p1',
                text: 'Article body from sandboxed iframe',
                type: 'paragraph',
              },
            ],
          },
        },
      }),
    );

    expect(targetDoc.querySelector('#obsidian-clipper-extended-bytetech-article')?.textContent).toContain(
      'Article body from sandboxed iframe',
    );
  });

  it('mirrors ByteTech content inside the live shadow DOM for Obsidian clipping', () => {
    const targetDoc = createDocument('<main><tt-docs-component></tt-docs-component></main>');
    const host = targetDoc.querySelector('tt-docs-component');
    const shadowRoot = host?.attachShadow({ mode: 'open' });
    shadowRoot!.innerHTML = `<section><iframe src="${LARK_FRAME_URL}" style="height: 100%;"></iframe></section>`;

    const fallbackArticle = targetDoc.createElement('article');
    fallbackArticle.id = 'obsidian-clipper-extended-bytetech-article';
    fallbackArticle.textContent = 'Fallback should be removed after shadow mirroring';
    targetDoc.body.prepend(fallbackArticle);

    const article = renderBytetechArticlePayloadInShadowDom(targetDoc, {
      title: 'Shadow title',
      sourceUrl: LARK_FRAME_URL,
      blocks: [
        {
          id: 'p1',
          text: 'Shadow article body',
          type: 'paragraph',
        },
        {
          id: 'img1',
          src: 'data:image/png;base64,abc',
          type: 'image',
        },
      ],
    });

    expect(article?.getRootNode()).toBe(shadowRoot);
    expect(article?.className).toBe('article-content');
    expect(article?.getAttribute('role')).toBe('article');
    expect(article?.querySelector('img')).toBeNull();
    expect(article?.textContent).toContain('Shadow article body');
    expect(targetDoc.querySelector('#obsidian-clipper-extended-bytetech-article')?.textContent).toContain(
      'Shadow article body',
    );
    expect(shadowRoot?.querySelector('iframe')).not.toBeNull();
    expect(shadowRoot?.querySelector('iframe')?.getAttribute('aria-hidden')).toBe('true');
    expect(host?.getAttribute('data-defuddle-shadow')).toContain('Shadow article body');
    expect(host?.getAttribute('data-defuddle-shadow')).not.toContain('data:image/png;base64,abc');
    expect(host?.getAttribute('data-defuddle-shadow')).not.toContain('data-obsidian-clipper-extended-omitted-src');
    expect(host?.getAttribute('data-defuddle-shadow')).not.toContain('<iframe');
  });

  it('keeps the light DOM article and sanitizes Obsidian shadow flattening', () => {
    document.body.replaceChildren();
    const host = document.createElement('tt-docs-component');
    document.body.appendChild(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `<section><iframe src="${LARK_FRAME_URL}"></iframe></section>`;

    renderBytetechArticlePayload(document, {
      title: 'Light title',
      sourceUrl: LARK_FRAME_URL,
      blocks: [
        {
          id: 'p1',
          text: 'Light DOM body for Obsidian',
          type: 'paragraph',
        },
      ],
    });
    renderBytetechArticlePayloadInShadowDom(document, {
      title: 'Shadow title',
      sourceUrl: LARK_FRAME_URL,
      blocks: [
        {
          id: 'p1',
          text: 'Shadow DOM body for Obsidian',
          type: 'paragraph',
        },
      ],
    });
    installBytetechDefuddleShadowPatch(window);

    host.setAttribute('data-defuddle-shadow', shadowRoot.innerHTML);

    expect(document.querySelector('#obsidian-clipper-extended-bytetech-article')?.textContent).toContain(
      'Shadow DOM body for Obsidian',
    );
    expect(host.getAttribute('data-defuddle-shadow')).toContain('Shadow DOM body for Obsidian');
    expect(host.getAttribute('data-defuddle-shadow')).not.toContain('<iframe');
  });

  it('uses the ByteTech page title instead of the generic Lark document title', () => {
    const targetDoc = createDocument('<main></main>');
    targetDoc.title = '离开，去找模型增长够不到的地方 - 文章 - ByteTech';

    expect(
      normalizeBytetechArticlePayloadForPage(targetDoc, {
        title: 'Docs',
        sourceUrl: LARK_FRAME_URL,
        blocks: [],
      }).title,
    ).toBe('离开，去找模型增长够不到的地方');
  });

  it('parses ByteTech main-world render and restore messages', () => {
    const renderMessage = parseBytetechMainWorldMessage({
      source: 'obsidian-clipper-extended:bytetech-main-world',
      type: 'render',
      payload: {
        title: 'Title',
        sourceUrl: LARK_FRAME_URL,
        blocks: [],
      },
    });

    expect(renderMessage?.type).toBe('render');
    expect(
      parseBytetechMainWorldMessage({
        source: 'obsidian-clipper-extended:bytetech-main-world',
        type: 'restore',
      })?.type,
    ).toBe('restore');
    expect(parseBytetechMainWorldMessage({ source: 'unknown', type: 'restore' })).toBeNull();
  });
});

function createDocument(body: string): Document {
  return new DOMParser().parseFromString(
    `<!doctype html><html><head><title></title></head><body>${body}</body></html>`,
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
