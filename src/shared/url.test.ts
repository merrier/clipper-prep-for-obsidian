import { describe, expect, it } from 'vitest';

import { canSnapshotUrl } from './url';

describe('snapshot URL support', () => {
  it('allows http and https pages', () => {
    expect(canSnapshotUrl('https://example.com')).toBe(true);
    expect(canSnapshotUrl('http://localhost:3000')).toBe(true);
  });

  it('rejects browser and invalid URLs', () => {
    expect(canSnapshotUrl('chrome://extensions')).toBe(false);
    expect(canSnapshotUrl('about:blank')).toBe(false);
    expect(canSnapshotUrl('not a url')).toBe(false);
    expect(canSnapshotUrl(undefined)).toBe(false);
  });
});

