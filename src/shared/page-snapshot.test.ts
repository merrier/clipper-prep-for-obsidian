import { describe, expect, it } from 'vitest';

import { normalizePageSnapshot } from './page-snapshot';

describe('page snapshot normalization', () => {
  it('trims page snapshot fields', () => {
    expect(
      normalizePageSnapshot({
        title: '  Example page  ',
        url: '  https://example.com/path  ',
        selectionText: '  Some selected text  ',
      }),
    ).toEqual({
      title: 'Example page',
      url: 'https://example.com/path',
      selectionText: 'Some selected text',
    });
  });

  it('uses a fallback title and empty strings for missing fields', () => {
    expect(normalizePageSnapshot({ title: '', url: null, selectionText: undefined })).toEqual({
      title: 'Untitled page',
      url: '',
      selectionText: '',
    });
  });
});

