import type { EnhancementStatus } from './site-enhancements';

const FEEDBACK_ISSUE_URL =
  'https://github.com/merrier/obsidian-clipper-extended/issues/new';

export interface FeedbackIssuePayload {
  pageTitle: string;
  pageUrl: string;
  extensionVersion: string;
  enhancementStatus: EnhancementStatus | null;
  notes?: string;
}

export function createFeedbackIssueUrl(payload: FeedbackIssuePayload): string {
  const issueUrl = new URL(FEEDBACK_ISSUE_URL);
  const issueTitle = `Markdown conversion issue: ${getIssueSubject(payload)}`;

  issueUrl.searchParams.set('title', issueTitle);
  issueUrl.searchParams.set('body', createFeedbackIssueBody(payload));

  return issueUrl.href;
}

function createFeedbackIssueBody(payload: FeedbackIssuePayload): string {
  const enhancementStatus = payload.enhancementStatus;
  const notes = payload.notes?.trim() || '(No additional notes provided)';
  const diagnostics = enhancementStatus
    ? [
        `- Enhancement site: ${enhancementStatus.site ?? 'none'}`,
        `- Enhancement enabled: ${String(enhancementStatus.enabled)}`,
        `- Enhancement active: ${String(enhancementStatus.active)}`,
        `- Images normalized: ${enhancementStatus.normalizedImageCount}/${enhancementStatus.imageCount}`,
        `- Enhancement label: ${sanitizeLine(enhancementStatus.label)}`,
      ]
    : ['- Enhancement: unavailable'];

  return [
    '## Page',
    `- Title: ${sanitizeLine(payload.pageTitle) || 'Untitled page'}`,
    `- URL: ${sanitizeLine(payload.pageUrl)}`,
    '',
    '## Diagnostics',
    `- Extension version: ${sanitizeLine(payload.extensionVersion) || 'unknown'}`,
    ...diagnostics,
    '',
    '## User notes',
    notes,
  ].join('\n');
}

function getIssueSubject(payload: FeedbackIssuePayload): string {
  const pageTitle = payload.pageTitle.trim();

  if (pageTitle) {
    return pageTitle;
  }

  try {
    return new URL(payload.pageUrl).hostname || 'Unknown page';
  } catch {
    return 'Unknown page';
  }
}

function sanitizeLine(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}
