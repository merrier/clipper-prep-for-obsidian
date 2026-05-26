import type { PageSnapshot } from './page-snapshot';
import type { EnhancementStatus } from './site-enhancements';

export type MessageSource = 'popup' | 'options';

export interface RuntimePingRequest {
  type: 'runtime:ping';
  source: MessageSource;
  sentAt: number;
}

export interface RuntimePingResponse {
  type: 'runtime:pong';
  source: 'background';
  receivedAt: number;
  echo: RuntimePingRequest;
}

export interface PageSnapshotRequest {
  type: 'page:snapshot';
}

export interface PageSnapshotResponse {
  type: 'page:snapshot:result';
  snapshot: PageSnapshot;
  enhancementStatus: EnhancementStatus | null;
}

export type AppRequest = RuntimePingRequest | PageSnapshotRequest;
export type AppResponse = RuntimePingResponse | PageSnapshotResponse;

export function createRuntimePing(source: MessageSource, sentAt = Date.now()): RuntimePingRequest {
  return {
    type: 'runtime:ping',
    source,
    sentAt,
  };
}

export function createRuntimePong(
  echo: RuntimePingRequest,
  receivedAt = Date.now(),
): RuntimePingResponse {
  return {
    type: 'runtime:pong',
    source: 'background',
    receivedAt,
    echo,
  };
}

export function createPageSnapshotRequest(): PageSnapshotRequest {
  return {
    type: 'page:snapshot',
  };
}

export function createPageSnapshotResponse(
  snapshot: PageSnapshot,
  enhancementStatus: EnhancementStatus | null = null,
): PageSnapshotResponse {
  return {
    type: 'page:snapshot:result',
    snapshot,
    enhancementStatus,
  };
}

export function isRuntimePingRequest(value: unknown): value is RuntimePingRequest {
  return (
    isRecord(value) &&
    value.type === 'runtime:ping' &&
    isMessageSource(value.source) &&
    typeof value.sentAt === 'number'
  );
}

export function isRuntimePongResponse(value: unknown): value is RuntimePingResponse {
  return (
    isRecord(value) &&
    value.type === 'runtime:pong' &&
    value.source === 'background' &&
    typeof value.receivedAt === 'number' &&
    isRuntimePingRequest(value.echo)
  );
}

export function isPageSnapshotRequest(value: unknown): value is PageSnapshotRequest {
  return isRecord(value) && value.type === 'page:snapshot';
}

export function isPageSnapshotResponse(value: unknown): value is PageSnapshotResponse {
  return (
    isRecord(value) &&
    value.type === 'page:snapshot:result' &&
    isRecord(value.snapshot) &&
    typeof value.snapshot.title === 'string' &&
    typeof value.snapshot.url === 'string' &&
    typeof value.snapshot.selectionText === 'string' &&
    (value.enhancementStatus === null || isEnhancementStatus(value.enhancementStatus))
  );
}

function isEnhancementStatus(value: unknown): value is EnhancementStatus {
  return (
    isRecord(value) &&
    (value.site === null || value.site === 'wechat' || value.site === 'bytetech' || value.site === 'feishu') &&
    typeof value.enabled === 'boolean' &&
    typeof value.active === 'boolean' &&
    typeof value.imageCount === 'number' &&
    typeof value.normalizedImageCount === 'number' &&
    typeof value.label === 'string'
  );
}

function isMessageSource(value: unknown): value is MessageSource {
  return value === 'popup' || value === 'options';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
