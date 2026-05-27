import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileText,
  LoaderCircle,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { browser } from 'wxt/browser';

import {
  createPageSnapshotRequest,
  createRuntimePing,
  isPageSnapshotResponse,
  isRuntimePongResponse,
  type RuntimePingResponse,
} from '../../shared/messages';
import { normalizePageSnapshot, type PageSnapshot } from '../../shared/page-snapshot';
import type { EnhancementStatus } from '../../shared/site-enhancements';
import { canSnapshotUrl } from '../../shared/url';
import { createFeedbackIssueUrl } from '../../shared/feedback';

type StatusKind = 'idle' | 'loading' | 'ready' | 'blocked' | 'error';

interface StatusState {
  kind: StatusKind;
  label: string;
  detail?: string;
}

const INITIAL_RUNTIME_STATE: StatusState = {
  kind: 'idle',
  label: 'Background idle',
};

const INITIAL_PAGE_STATE: StatusState = {
  kind: 'idle',
  label: 'Page idle',
};

export function PopupApp() {
  const [runtimeStatus, setRuntimeStatus] = useState<StatusState>(INITIAL_RUNTIME_STATE);
  const [pageStatus, setPageStatus] = useState<StatusState>(INITIAL_PAGE_STATE);
  const [snapshot, setSnapshot] = useState<PageSnapshot | null>(null);
  const [enhancementStatus, setEnhancementStatus] = useState<EnhancementStatus | null>(null);
  const extensionVersion = useMemo(() => browser.runtime.getManifest().version, []);

  const isRefreshing = runtimeStatus.kind === 'loading' || pageStatus.kind === 'loading';

  const refresh = useCallback(async () => {
    setRuntimeStatus({
      kind: 'loading',
      label: 'Checking background',
    });
    setPageStatus({
      kind: 'loading',
      label: 'Reading current tab',
    });
    setSnapshot(null);
    setEnhancementStatus(null);

    await Promise.all([
      checkBackground(setRuntimeStatus),
      readCurrentTab(setPageStatus, setSnapshot, setEnhancementStatus),
    ]);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const snapshotRows = useMemo(
    () => [
      ['Title', snapshot?.title || 'No title yet'],
      ['URL', snapshot?.url || 'No page URL yet'],
      ['Selection', snapshot?.selectionText || 'No selected text'],
    ],
    [snapshot],
  );

  return (
    <main className="popup-shell">
      <header className="popup-header">
        <div>
          <p className="eyebrow">Obsidian</p>
          <h1>Clipper Prep</h1>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={() => void refresh()}
          disabled={isRefreshing}
          aria-label="Refresh status"
          title="Refresh status"
        >
          <RefreshCw size={18} className={isRefreshing ? 'spin' : undefined} />
        </button>
      </header>

      <section className="status-grid" aria-label="Extension status">
        <StatusPanel title="Runtime" status={runtimeStatus} />
        <StatusPanel title="Page" status={pageStatus} />
      </section>

      {enhancementStatus?.site ? <EnhancementPanel status={enhancementStatus} /> : null}

      <section className="snapshot-panel" aria-label="Current page snapshot">
        <div className="section-title">
          <FileText size={17} />
          <h2>Current Page</h2>
        </div>
        <dl className="snapshot-list">
          {snapshotRows.map(([label, value]) => (
            <div className="snapshot-row" key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <FeedbackPanel
        snapshot={snapshot}
        enhancementStatus={enhancementStatus}
        extensionVersion={extensionVersion}
      />
    </main>
  );
}

function StatusPanel({ title, status }: { title: string; status: StatusState }) {
  return (
    <article className={`status-panel status-${status.kind}`}>
      <div className="status-heading">
        <StatusIcon kind={status.kind} />
        <h2>{title}</h2>
      </div>
      <p>{status.label}</p>
      {status.detail ? <small>{status.detail}</small> : null}
    </article>
  );
}

function EnhancementPanel({ status }: { status: EnhancementStatus }) {
  const rows = [
    ['Site', getSiteLabel(status.site)],
    ['Mode', status.enabled ? 'Enabled' : 'Disabled'],
    ['Images', `${status.normalizedImageCount}/${status.imageCount}`],
  ];

  return (
    <section className={`enhancement-panel ${status.active ? 'active' : 'disabled'}`}>
      <div className="section-title">
        <ShieldCheck size={17} />
        <h2>Enhancement</h2>
      </div>
      <p className="enhancement-label">{status.label}</p>
      <dl className="enhancement-meta">
        {rows.map(([label, value]) => (
          <div className="enhancement-meta-row" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function FeedbackPanel({
  snapshot,
  enhancementStatus,
  extensionVersion,
}: {
  snapshot: PageSnapshot | null;
  enhancementStatus: EnhancementStatus | null;
  extensionVersion: string;
}) {
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const pageUrl = snapshot?.url.trim() ?? '';
  const isDisabled = !pageUrl;

  const openIssue = async () => {
    if (!snapshot || !pageUrl) {
      setError('Current page URL unavailable.');
      return;
    }

    try {
      const issueUrl = createFeedbackIssueUrl({
        pageTitle: snapshot.title,
        pageUrl,
        extensionVersion,
        enhancementStatus,
        notes,
      });

      await browser.tabs.create({ url: issueUrl });
      setError('');
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    }
  };

  return (
    <section className="feedback-panel" aria-label="Report markdown issue">
      <div className="section-title">
        <MessageSquare size={17} />
        <h2>Report Markdown Issue</h2>
      </div>
      <div className="feedback-form">
        <label htmlFor="feedback-notes">Additional notes</label>
        <textarea
          id="feedback-notes"
          className="feedback-textarea"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional details about the missing or incorrect markdown"
          rows={4}
        />
        <button
          className="primary-button"
          type="button"
          onClick={() => void openIssue()}
          disabled={isDisabled}
        >
          <ExternalLink size={16} />
          <span>Open GitHub Issue</span>
        </button>
        {isDisabled ? (
          <p className="feedback-status">Current page URL unavailable.</p>
        ) : null}
        {error ? <p className="feedback-status error">{error}</p> : null}
      </div>
    </section>
  );
}

function StatusIcon({ kind }: { kind: StatusKind }) {
  if (kind === 'loading') {
    return <LoaderCircle size={17} className="spin" />;
  }

  if (kind === 'ready') {
    return <CheckCircle2 size={17} />;
  }

  return <AlertCircle size={17} />;
}

async function checkBackground(setStatus: (status: StatusState) => void) {
  try {
    const response = await browser.runtime.sendMessage(createRuntimePing('popup'));

    if (!isRuntimePongResponse(response)) {
      throw new Error('Unexpected background response');
    }

    setStatus({
      kind: 'ready',
      label: 'Background connected',
      detail: formatLatency(response),
    });
  } catch (error) {
    setStatus({
      kind: 'error',
      label: 'Background unavailable',
      detail: getErrorMessage(error),
    });
  }
}

async function readCurrentTab(
  setStatus: (status: StatusState) => void,
  setSnapshot: (snapshot: PageSnapshot | null) => void,
  setEnhancementStatus: (enhancementStatus: EnhancementStatus | null) => void,
) {
  let fallbackSnapshot: PageSnapshot | null = null;

  try {
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!activeTab?.id) {
      setEnhancementStatus(null);
      setStatus({
        kind: 'blocked',
        label: 'No active tab',
      });
      return;
    }

    fallbackSnapshot = normalizePageSnapshot({
      title: activeTab.title,
      url: activeTab.url,
      selectionText: '',
    });

    if (fallbackSnapshot.url) {
      setSnapshot(fallbackSnapshot);
    }

    if (!canSnapshotUrl(activeTab.url)) {
      setEnhancementStatus(null);
      setStatus({
        kind: 'blocked',
        label: 'Unsupported page',
        detail: activeTab.url ?? 'This tab has no readable URL',
      });
      return;
    }

    const response = await browser.tabs.sendMessage(activeTab.id, createPageSnapshotRequest());

    if (!isPageSnapshotResponse(response)) {
      throw new Error('Unexpected page response');
    }

    setSnapshot(response.snapshot);
    setEnhancementStatus(response.enhancementStatus);
    setStatus(createPageStatus(response.enhancementStatus));
  } catch (error) {
    if (fallbackSnapshot) {
      setSnapshot(fallbackSnapshot);
    }

    setEnhancementStatus(null);
    setStatus({
      kind: 'error',
      label: 'Page script unavailable',
      detail: getErrorMessage(error),
    });
  }
}

function createPageStatus(enhancementStatus: EnhancementStatus | null): StatusState {
  if (!enhancementStatus?.site) {
    return {
      kind: 'ready',
      label: 'Page snapshot ready',
    };
  }

  if (!enhancementStatus.enabled) {
    return {
      kind: 'blocked',
      label: `${getSiteLabel(enhancementStatus.site)} enhancer disabled`,
    };
  }

  if (!enhancementStatus.active) {
    return {
      kind: 'blocked',
      label: `${getSiteLabel(enhancementStatus.site)} enhancer inactive`,
      detail: enhancementStatus.label,
    };
  }

  return {
    kind: 'ready',
    label: `${getSiteLabel(enhancementStatus.site)} enhancer active`,
    detail: `${enhancementStatus.normalizedImageCount}/${enhancementStatus.imageCount} images normalized`,
  };
}

function getSiteLabel(site: EnhancementStatus['site']): string {
  if (site === 'wechat') {
    return 'WeChat Official Accounts';
  }

  if (site === 'bytetech') {
    return 'ByteTech';
  }

  if (site === 'feishu') {
    return 'Feishu Documents';
  }

  return 'Unknown';
}

function formatLatency(response: RuntimePingResponse): string {
  return `${Math.max(0, response.receivedAt - response.echo.sentAt)} ms round trip`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
