import { describe, expect, it } from 'vitest';

import {
  createPageSnapshotRequest,
  createPageSnapshotResponse,
  createRuntimePing,
  createRuntimePong,
  isPageSnapshotRequest,
  isPageSnapshotResponse,
  isRuntimePingRequest,
  isRuntimePongResponse,
} from './messages';

describe('typed extension messages', () => {
  it('creates and validates runtime ping messages', () => {
    const ping = createRuntimePing('popup', 100);
    const pong = createRuntimePong(ping, 125);

    expect(isRuntimePingRequest(ping)).toBe(true);
    expect(isRuntimePongResponse(pong)).toBe(true);
    expect(pong.echo.source).toBe('popup');
    expect(pong.receivedAt).toBe(125);
  });

  it('rejects malformed runtime messages', () => {
    expect(isRuntimePingRequest({ type: 'runtime:ping', source: 'content', sentAt: 1 })).toBe(false);
    expect(isRuntimePongResponse({ type: 'runtime:pong', source: 'background' })).toBe(false);
  });

  it('creates and validates page snapshot messages', () => {
    const request = createPageSnapshotRequest();
    const response = createPageSnapshotResponse({
      title: 'Example',
      url: 'https://example.com/',
      selectionText: 'Selected',
    });

    expect(isPageSnapshotRequest(request)).toBe(true);
    expect(isPageSnapshotResponse(response)).toBe(true);
    expect(response.snapshot.title).toBe('Example');
    expect(response.enhancementStatus).toBeNull();
  });

  it('validates page snapshot messages with enhancement status', () => {
    const response = createPageSnapshotResponse(
      {
        title: 'WeChat article',
        url: 'https://mp.weixin.qq.com/s/example',
        selectionText: '',
      },
      {
        site: 'wechat',
        enabled: true,
        active: true,
        imageCount: 2,
        normalizedImageCount: 2,
        label: 'WeChat enhancer active for 2/2 images',
      },
    );

    expect(isPageSnapshotResponse(response)).toBe(true);
  });

  it('validates ByteTech enhancement status in page snapshot messages', () => {
    const response = createPageSnapshotResponse(
      {
        title: 'ByteTech article',
        url: 'https://bytetech.info/articles/example',
        selectionText: '',
      },
      {
        site: 'bytetech',
        enabled: true,
        active: true,
        imageCount: 0,
        normalizedImageCount: 0,
        label: 'ByteTech enhancer active for 12 blocks',
      },
    );

    expect(isPageSnapshotResponse(response)).toBe(true);
  });

  it('validates Feishu enhancement status in page snapshot messages', () => {
    const response = createPageSnapshotResponse(
      {
        title: 'Feishu document',
        url: 'https://bytedance.sg.larkoffice.com/docx/example',
        selectionText: '',
      },
      {
        site: 'feishu',
        enabled: true,
        active: true,
        imageCount: 0,
        normalizedImageCount: 0,
        label: 'Feishu document enhancer active for 12 blocks',
      },
    );

    expect(isPageSnapshotResponse(response)).toBe(true);
  });
});
