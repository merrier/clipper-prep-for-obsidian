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
  type PageSnapshotResponse,
  type RuntimePingResponse,
} from '../../shared/messages';
import { normalizePageSnapshot, type PageSnapshot } from '../../shared/page-snapshot';
import type { EnhancementStatus } from '../../shared/site-enhancements';
import { canSnapshotUrl } from '../../shared/url';
import { createFeedbackIssueUrl } from '../../shared/feedback';
import { t } from '../../shared/i18n';

type StatusKind = 'idle' | 'loading' | 'ready' | 'blocked' | 'error';

interface StatusState {
  kind: StatusKind;
  label: string;
  detail?: string;
}

const INITIAL_RUNTIME_STATE: StatusState = {
  kind: 'idle',
  label: t('backgroundIdle'),
};

const INITIAL_PAGE_STATE: StatusState = {
  kind: 'idle',
  label: t('pageIdle'),
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
      label: t('checkingBackground'),
    });
    setPageStatus({
      kind: 'loading',
      label: t('readingCurrentTab'),
    });
    setSnapshot(null);
    setEnhancementStatus(null);

    await Promise.all([
      checkBackground(setRuntimeStatus),
      readCurrentTab(setPageStatus, setSnapshot, setEnhancementStatus),
    ]);
  }, []);

  useEffect(() => {
    document.title = t('popupDocumentTitle');
    void refresh();
  }, [refresh]);

  const snapshotRows = useMemo(
    () => [
      [t('snapshotTitle'), snapshot?.title || t('noTitleYet')],
      [t('snapshotUrl'), snapshot?.url || t('noPageUrlYet')],
      [t('snapshotSelection'), snapshot?.selectionText || t('noSelectedText')],
    ],
    [snapshot],
  );

  return (
    <main className="popup-shell">
      <header className="popup-header">
        <div>
          <p className="eyebrow">Obsidian</p>
          <h1>{t('extensionShortName')}</h1>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={() => void refresh()}
          disabled={isRefreshing}
          aria-label={t('refreshStatus')}
          title={t('refreshStatus')}
        >
          <RefreshCw size={18} className={isRefreshing ? 'spin' : undefined} />
        </button>
      </header>

      <section className="status-grid" aria-label={t('extensionStatus')}>
        <StatusPanel title={t('runtimeTitle')} status={runtimeStatus} />
        <StatusPanel title={t('pageTitle')} status={pageStatus} />
      </section>

      {enhancementStatus?.site ? <EnhancementPanel status={enhancementStatus} /> : null}

      <section className="snapshot-panel" aria-label={t('currentPageSnapshot')}>
        <div className="section-title">
          <FileText size={17} />
          <h2>{t('currentPage')}</h2>
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
    [t('siteMeta'), getSiteLabel(status.site)],
    [t('modeMeta'), status.enabled ? t('enabled') : t('disabled')],
    [t('imagesMeta'), `${status.normalizedImageCount}/${status.imageCount}`],
  ];

  return (
    <section className={`enhancement-panel ${status.active ? 'active' : 'disabled'}`}>
      <div className="section-title">
        <ShieldCheck size={17} />
        <h2>{t('enhancementTitle')}</h2>
      </div>
      <p className="enhancement-label">{formatEnhancementStatusLabel(status)}</p>
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
      setError(t('currentPageUrlUnavailable'));
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
    <section className="feedback-panel" aria-label={t('reportMarkdownIssue')}>
      <div className="section-title">
        <MessageSquare size={17} />
        <h2>{t('reportMarkdownIssue')}</h2>
      </div>
      <div className="feedback-form">
        <label htmlFor="feedback-notes">{t('additionalNotes')}</label>
        <textarea
          id="feedback-notes"
          className="feedback-textarea"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder={t('feedbackPlaceholder')}
          rows={4}
        />
        <button
          className="primary-button"
          type="button"
          onClick={() => void openIssue()}
          disabled={isDisabled}
        >
          <ExternalLink size={16} />
          <span>{t('openGitHubIssue')}</span>
        </button>
        {isDisabled ? (
          <p className="feedback-status">{t('currentPageUrlUnavailable')}</p>
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
      throw new Error(t('unexpectedBackgroundResponse'));
    }

    setStatus({
      kind: 'ready',
      label: t('backgroundConnected'),
      detail: formatLatency(response),
    });
  } catch (error) {
    setStatus({
      kind: 'error',
      label: t('backgroundUnavailable'),
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
        label: t('noActiveTab'),
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
        label: t('unsupportedPage'),
        detail: activeTab.url ?? t('tabHasNoReadableUrl'),
      });
      return;
    }

    const response = await requestPageSnapshot(activeTab.id);

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
      label: t('pageScriptUnavailable'),
      detail: getErrorMessage(error),
    });
  }
}

async function requestPageSnapshot(tabId: number): Promise<PageSnapshotResponse> {
  try {
    return await sendPageSnapshotRequest(tabId);
  } catch {
    await injectPageContentScript(tabId);
    return sendPageSnapshotRequest(tabId);
  }
}

async function sendPageSnapshotRequest(tabId: number): Promise<PageSnapshotResponse> {
  const response = await browser.tabs.sendMessage(tabId, createPageSnapshotRequest());

  if (!isPageSnapshotResponse(response)) {
    throw new Error(t('unexpectedPageResponse'));
  }

  return response;
}

async function injectPageContentScript(tabId: number): Promise<void> {
  await browser.scripting.executeScript({
    target: {
      tabId,
      allFrames: true,
    },
    files: ['content-scripts/page.js'],
  });
}

function createPageStatus(enhancementStatus: EnhancementStatus | null): StatusState {
  if (!enhancementStatus?.site) {
    return {
      kind: 'ready',
      label: t('pageSnapshotReady'),
    };
  }

  if (!enhancementStatus.enabled) {
    return {
      kind: 'blocked',
      label: t('siteEnhancerDisabled', getSiteLabel(enhancementStatus.site)),
    };
  }

  if (!enhancementStatus.active) {
    return {
      kind: 'blocked',
      label: t('siteEnhancerInactive', getSiteLabel(enhancementStatus.site)),
      detail: formatEnhancementStatusLabel(enhancementStatus),
    };
  }

  return {
    kind: 'ready',
    label: t('siteEnhancerActive', getSiteLabel(enhancementStatus.site)),
    detail: t('imagesNormalized', [
      String(enhancementStatus.normalizedImageCount),
      String(enhancementStatus.imageCount),
    ]),
  };
}

function getSiteLabel(site: EnhancementStatus['site']): string {
  if (site === 'wechat') {
    return t('siteWeChat');
  }

  if (site === 'bytetech') {
    return t('siteByteTechShort');
  }

  if (site === 'feishu') {
    return t('siteFeishu');
  }

  return t('unknown');
}

function formatEnhancementStatusLabel(status: EnhancementStatus): string {
  if (!status.site) {
    return t('noSiteEnhancerActive');
  }

  const siteLabel = getSiteLabel(status.site);

  if (!status.enabled) {
    return t('siteEnhancerDisabled', siteLabel);
  }

  if (!status.active) {
    return t('siteEnhancerWaiting', siteLabel);
  }

  if (status.site === 'wechat') {
    return t('wechatEnhancerActiveLabel', [
      String(status.normalizedImageCount),
      String(status.imageCount),
    ]);
  }

  return t('siteEnhancerReady', siteLabel);
}

function formatLatency(response: RuntimePingResponse): string {
  return t('roundTripMs', String(Math.max(0, response.receivedAt - response.echo.sentAt)));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : t('unknownError');
}
