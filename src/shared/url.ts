const SNAPSHOT_PROTOCOLS = new Set(['http:', 'https:']);

export function canSnapshotUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  try {
    return SNAPSHOT_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

