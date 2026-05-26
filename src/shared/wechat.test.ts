import { describe, expect, it } from 'vitest';

import {
  collectArticleImageUrls,
  enhanceWeChatArticle,
  getBestImageSource,
  getWeChatEnhancementStatus,
  isWeChatArticleUrl,
  normalizeWeChatImageUrl,
  restoreWeChatEnhancement,
} from './wechat';

const ARTICLE_URL =
  'https://mp.weixin.qq.com/s?__biz=MzE5ODY5MDU4Mw==&mid=2247484318&idx=1&sn=example';

describe('WeChat article enhancement', () => {
  it('detects WeChat article URLs', () => {
    expect(isWeChatArticleUrl(ARTICLE_URL)).toBe(true);
    expect(isWeChatArticleUrl('https://mp.weixin.qq.com/s/example')).toBe(true);
    expect(isWeChatArticleUrl('https://mp.weixin.qq.com/cgi-bin/appmsg')).toBe(false);
    expect(isWeChatArticleUrl('https://example.com/s/example')).toBe(false);
  });

  it('normalizes all article images regardless of URL parameters', () => {
    const doc = createDocument(`
      <div id="js_content">
        <section>
          <img
            data-src="https://mmbiz.qpic.cn/a/640?wx_fmt=jpeg#imgIndex=1"
            src="https://mmbiz.qpic.cn/a/640?wx_fmt=jpeg&tp=webp&wxfrom=5&wx_lazy=1#imgIndex=1"
            srcset="https://mmbiz.qpic.cn/a/320?wx_fmt=jpeg 320w"
            data-w="785"
            data-ratio="0.4445859872611465"
            alt="图片一"
          />
        </section>
        <section>
          <img src="https://mmbiz.qpic.cn/b/640?wx_fmt=png&from=appmsg#imgIndex=2" alt="图片二" />
        </section>
        <section>
          <img src="https://mmbiz.qpic.cn/c/640?wx_fmt=jpeg&watermark=1#imgIndex=3" alt="图片三" />
        </section>
        <section>
          <img data-src="//mmbiz.qpic.cn/d/640?wx_fmt=jpeg&from=appmsg&watermark=1#imgIndex=4" alt="图片四" />
        </section>
        <section>
          <img data-src="//mmbiz.qpic.cn/e/640?wx_fmt=jpeg&from=appmsg&watermark=1#imgIndex=5" alt="图片" />
        </section>
      </div>
    `);

    const status = enhanceWeChatArticle(doc, ARTICLE_URL);
    const images = Array.from(doc.querySelectorAll<HTMLImageElement>('#js_content img'));

    expect(status).toMatchObject({
      site: 'wechat',
      enabled: true,
      active: true,
      imageCount: 5,
      normalizedImageCount: 5,
    });
    expect(images[0].getAttribute('src')).toBe(
      'https://mmbiz.qpic.cn/a/640?wx_fmt=jpeg&from=appmsg&watermark=1#imgIndex=1',
    );
    expect(images[0].getAttribute('data-src')).toBe(
      'https://mmbiz.qpic.cn/a/640?wx_fmt=jpeg&from=appmsg&watermark=1#imgIndex=1',
    );
    expect(images[0].hasAttribute('srcset')).toBe(false);
    expect(images[0].getAttribute('loading')).toBe('eager');
    expect(images[0].getAttribute('alt')).toBe('图片一');
    expect(images[0].getAttribute('width')).toBe('785');
    expect(images[0].getAttribute('height')).toBe('349');
    expect(images[1].getAttribute('src')).toBe(
      'https://mmbiz.qpic.cn/b/640?wx_fmt=png&from=appmsg&watermark=1#imgIndex=2',
    );
    expect(images[1].getAttribute('alt')).toBe('图片二');
    expect(images[2].getAttribute('src')).toBe(
      'https://mmbiz.qpic.cn/c/640?wx_fmt=jpeg&watermark=1&from=appmsg#imgIndex=3',
    );
    expect(images[3].getAttribute('src')).toBe(
      'https://mmbiz.qpic.cn/d/640?wx_fmt=jpeg&from=appmsg&watermark=1#imgIndex=4',
    );
    expect(images[4].getAttribute('alt')).toBe('图片 5');
  });

  it('prefers data-src over WeChat lazy src URLs', () => {
    const doc = createDocument(`
      <div id="js_content">
        <img
          data-src="https://mmbiz.qpic.cn/real/640?wx_fmt=jpeg#imgIndex=1"
          src="https://mmbiz.qpic.cn/real/640?wx_fmt=jpeg&tp=webp&wxfrom=5&wx_lazy=1#imgIndex=1"
        />
      </div>
    `);
    const image = doc.querySelector<HTMLImageElement>('img');

    expect(image ? getBestImageSource(image, ARTICLE_URL) : '').toBe(
      'https://mmbiz.qpic.cn/real/640?wx_fmt=jpeg&from=appmsg&watermark=1#imgIndex=1',
    );
  });

  it('canonicalizes WeChat CDN image URLs for Obsidian Web Clipper extraction', () => {
    expect(
      normalizeWeChatImageUrl(
        'https://mmbiz.qpic.cn/real/640?wx_fmt=jpeg&tp=webp&wxfrom=5&wx_lazy=1#imgIndex=1',
        ARTICLE_URL,
      ),
    ).toBe('https://mmbiz.qpic.cn/real/640?wx_fmt=jpeg&from=appmsg&watermark=1#imgIndex=1');
    expect(
      normalizeWeChatImageUrl('https://cdn.example.com/image.png?wx_fmt=png', ARTICLE_URL),
    ).toBe('https://cdn.example.com/image.png?wx_fmt=png');
  });

  it('restores image attributes when enhancement is disabled', () => {
    const doc = createDocument(`
      <div id="js_content">
        <img
          data-src="https://mmbiz.qpic.cn/real/640?wx_fmt=jpeg#imgIndex=1"
          src="https://mmbiz.qpic.cn/real/640?wx_fmt=jpeg&tp=webp&wxfrom=5&wx_lazy=1#imgIndex=1"
          srcset="https://mmbiz.qpic.cn/real/320?wx_fmt=jpeg 320w"
          data-w="640"
          data-ratio="0.5"
        />
      </div>
    `);
    const image = doc.querySelector<HTMLImageElement>('img');

    enhanceWeChatArticle(doc, ARTICLE_URL);
    restoreWeChatEnhancement(doc);

    expect(image?.getAttribute('src')).toBe(
      'https://mmbiz.qpic.cn/real/640?wx_fmt=jpeg&tp=webp&wxfrom=5&wx_lazy=1#imgIndex=1',
    );
    expect(image?.getAttribute('data-src')).toBe(
      'https://mmbiz.qpic.cn/real/640?wx_fmt=jpeg#imgIndex=1',
    );
    expect(image?.getAttribute('srcset')).toBe(
      'https://mmbiz.qpic.cn/real/320?wx_fmt=jpeg 320w',
    );
    expect(image?.hasAttribute('alt')).toBe(false);
    expect(image?.hasAttribute('width')).toBe(false);
    expect(image?.hasAttribute('height')).toBe(false);
  });

  it('unwraps image-only code blocks so Obsidian Web Clipper can see screenshots', () => {
    const doc = createDocument(`
      <div id="js_content">
        <p>切换Agent：</p>
        <pre style="margin-bottom: 8px;"></pre>
        <pre style="margin-bottom: 8px;"><code data-line="55"><span leaf>
          <img data-src="https://mmbiz.qpic.cn/agent/640?wx_fmt=png#imgIndex=5" alt="图片" />
        </span></code></pre>
        <pre><code><span>  </span></code></pre>
        <pre style="margin-bottom: 8px;"><code data-line="55"><span leaf>
          <span textstyle>切换模型：</span>
        </span></code></pre>
        <pre><code data-line="55"><span leaf>
          <span textstyle>那么，</span><span textstyle>OpenCode 的这套组合优缺点如何？</span>
        </span></code></pre>
        <pre><code>npm install -g opencode-ai</code></pre>
      </div>
    `);

    enhanceWeChatArticle(doc, ARTICLE_URL);

    const unwrappedImage = doc.querySelector<HTMLImageElement>(
      '[data-obsidian-clipper-extended-unwrapped-code-image] img',
    );
    const preBlocks = Array.from(doc.querySelectorAll<HTMLPreElement>('pre'));

    expect(unwrappedImage?.getAttribute('src')).toBe(
      'https://mmbiz.qpic.cn/agent/640?wx_fmt=png&from=appmsg&watermark=1#imgIndex=5',
    );
    expect(unwrappedImage?.getAttribute('alt')).toBe('图片 5');
    expect(doc.querySelector('pre img')).toBeNull();
    expect(doc.querySelectorAll('[data-obsidian-clipper-extended-unwrapped-code-text]')).toHaveLength(2);
    expect(doc.querySelector('[data-obsidian-clipper-extended-unwrapped-code-text]')?.textContent).toContain(
      '切换模型：',
    );
    expect(preBlocks).toHaveLength(1);
    expect(preBlocks[0].textContent).toContain('npm install -g opencode-ai');
    expect(preBlocks[0].textContent).not.toBe('');

    restoreWeChatEnhancement(doc);

    expect(doc.querySelector('[data-obsidian-clipper-extended-unwrapped-code-image]')).toBeNull();
    expect(doc.querySelector('[data-obsidian-clipper-extended-unwrapped-code-text]')).toBeNull();
    expect(doc.querySelector('pre img')).not.toBeNull();
  });

  it('reports disabled and missing-content states', () => {
    expect(getWeChatEnhancementStatus(createDocument('<div id="js_content"></div>'), ARTICLE_URL, false)).toMatchObject({
      site: 'wechat',
      enabled: false,
      active: false,
    });
    expect(enhanceWeChatArticle(createDocument('<main></main>'), ARTICLE_URL)).toMatchObject({
      site: 'wechat',
      enabled: true,
      active: false,
      label: 'WeChat article content not found',
    });
  });

  it('collects unique image URLs from article content', () => {
    const doc = createDocument(`
      <div id="js_content">
        <img data-src="https://mmbiz.qpic.cn/a/640?wx_fmt=jpeg" />
        <img src="https://mmbiz.qpic.cn/a/640?wx_fmt=jpeg" />
        <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" />
      </div>
    `);
    const contentRoot = doc.querySelector('#js_content');

    expect(contentRoot ? collectArticleImageUrls(contentRoot, ARTICLE_URL).size : 0).toBe(1);
  });
});

function createDocument(body: string): Document {
  return new DOMParser().parseFromString(
    `<!doctype html><html><body>${body}</body></html>`,
    'text/html',
  );
}
