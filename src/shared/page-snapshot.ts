export interface PageSnapshot {
  title: string;
  url: string;
  selectionText: string;
}

export interface PageSnapshotInput {
  title?: string | null;
  url?: string | null;
  selectionText?: string | null;
}

export function normalizePageSnapshot(input: PageSnapshotInput): PageSnapshot {
  return {
    title: normalizeText(input.title) || 'Untitled page',
    url: normalizeText(input.url),
    selectionText: normalizeText(input.selectionText),
  };
}

export function readPageSnapshot(doc = document, selection = window.getSelection()): PageSnapshot {
  return normalizePageSnapshot({
    title: doc.title,
    url: doc.URL,
    selectionText: selection?.toString(),
  });
}

function normalizeText(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

