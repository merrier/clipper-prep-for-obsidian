import { describe, expect, it } from 'vitest';

import { createFeedbackIssueUrl } from './feedback';
import type { EnhancementStatus } from './site-enhancements';

const ENHANCEMENT_STATUS: EnhancementStatus = {
  site: 'wechat',
  enabled: true,
  active: true,
  imageCount: 6,
  normalizedImageCount: 6,
  label: 'WeChat enhancer active for 6/6 images',
};

describe('feedback issue URL', () => {
  it('creates a prefilled GitHub issue URL', () => {
    const issueUrl = new URL(
      createFeedbackIssueUrl({
        pageTitle: 'OpenCode + oh-my-opencode',
        pageUrl: 'https://mp.weixin.qq.com/s?__biz=example',
        extensionVersion: '0.1.0',
        enhancementStatus: ENHANCEMENT_STATUS,
        notes: 'Missing screenshots after 切换Agent.',
      }),
    );

    expect(issueUrl.origin + issueUrl.pathname).toBe(
      'https://github.com/merrier/obsidian-clipper-extended/issues/new',
    );
    expect(issueUrl.searchParams.get('title')).toBe(
      'Markdown conversion issue: OpenCode + oh-my-opencode',
    );
    expect(issueUrl.searchParams.get('body')).toContain(
      '- URL: https://mp.weixin.qq.com/s?__biz=example',
    );
    expect(issueUrl.searchParams.get('body')).toContain('- Extension version: 0.1.0');
    expect(issueUrl.searchParams.get('body')).toContain('- Enhancement site: wechat');
    expect(issueUrl.searchParams.get('body')).toContain('- Images normalized: 6/6');
    expect(issueUrl.searchParams.get('body')).toContain('Missing screenshots after 切换Agent.');
  });

  it('falls back when optional notes and enhancement status are unavailable', () => {
    const issueUrl = new URL(
      createFeedbackIssueUrl({
        pageTitle: '',
        pageUrl: 'https://example.com/article',
        extensionVersion: '',
        enhancementStatus: null,
        notes: '   ',
      }),
    );
    const body = issueUrl.searchParams.get('body') ?? '';

    expect(issueUrl.searchParams.get('title')).toBe(
      'Markdown conversion issue: example.com',
    );
    expect(body).toContain('- Title: Untitled page');
    expect(body).toContain('- Extension version: unknown');
    expect(body).toContain('- Enhancement: unavailable');
    expect(body).toContain('(No additional notes provided)');
  });
});
