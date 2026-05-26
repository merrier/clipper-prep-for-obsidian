import { describe, expect, it } from 'vitest';

import { normalizeSettings, settingsToFormValues } from './settings';

describe('settings helpers', () => {
  it('normalizes enabled sites and removes unknown values', () => {
    expect(
      normalizeSettings({
        enabledSites: ['wechat', 'unknown', 'wechat', 'bytetech', 'feishu'],
      }),
    ).toEqual({
      enabledSites: ['wechat', 'bytetech', 'feishu'],
      knownSiteIds: ['wechat', 'bytetech', 'feishu'],
      enabledGlobalProcessors: ['markdownLinks'],
      knownGlobalProcessorIds: ['markdownLinks'],
    });
  });

  it('auto-enables newly supported sites for older saved settings', () => {
    expect(
      normalizeSettings({
        enabledSites: ['wechat'],
      }),
    ).toEqual({
      enabledSites: ['wechat', 'bytetech', 'feishu'],
      knownSiteIds: ['wechat', 'bytetech', 'feishu'],
      enabledGlobalProcessors: ['markdownLinks'],
      knownGlobalProcessorIds: ['markdownLinks'],
    });
  });

  it('respects saved settings after known sites have been recorded', () => {
    expect(
      normalizeSettings({
        enabledSites: ['wechat'],
        knownSiteIds: ['wechat', 'bytetech', 'feishu'],
        enabledGlobalProcessors: [],
        knownGlobalProcessorIds: ['markdownLinks'],
      }),
    ).toEqual({
      enabledSites: ['wechat'],
      knownSiteIds: ['wechat', 'bytetech', 'feishu'],
      enabledGlobalProcessors: [],
      knownGlobalProcessorIds: ['markdownLinks'],
    });
  });

  it('auto-enables supported sites missing from older known site records', () => {
    expect(
      normalizeSettings({
        enabledSites: ['wechat'],
        knownSiteIds: ['wechat', 'bytetech'],
      }),
    ).toEqual({
      enabledSites: ['wechat', 'feishu'],
      knownSiteIds: ['wechat', 'bytetech', 'feishu'],
      enabledGlobalProcessors: ['markdownLinks'],
      knownGlobalProcessorIds: ['markdownLinks'],
    });
  });

  it('does not auto-enable new sites while saving form values', () => {
    expect(
      normalizeSettings(
        {
          enabledSites: ['wechat'],
        },
        { autoEnableNewSites: false },
      ),
    ).toEqual({
      enabledSites: ['wechat'],
      knownSiteIds: ['wechat', 'bytetech', 'feishu'],
      enabledGlobalProcessors: [],
      knownGlobalProcessorIds: ['markdownLinks'],
    });
  });

  it('converts optional settings to form values', () => {
    expect(
      settingsToFormValues({
        enabledSites: ['wechat', 'bytetech', 'feishu'],
        knownSiteIds: ['wechat', 'bytetech', 'feishu'],
        enabledGlobalProcessors: ['markdownLinks'],
        knownGlobalProcessorIds: ['markdownLinks'],
      }),
    ).toEqual({
      enabledSites: ['wechat', 'bytetech', 'feishu'],
      enabledGlobalProcessors: ['markdownLinks'],
    });
  });
});
