import {
  ENHANCED_SITE_IDS,
  normalizeEnabledSites,
  type EnhancedSiteId,
} from './site-enhancements';
import {
  GLOBAL_PROCESSOR_IDS,
  normalizeEnabledGlobalProcessors,
  type GlobalProcessorId,
} from './global-processing';

export interface ExtensionSettings {
  enabledSites: EnhancedSiteId[];
  knownSiteIds: EnhancedSiteId[];
  enabledGlobalProcessors: GlobalProcessorId[];
  knownGlobalProcessorIds: GlobalProcessorId[];
}

export interface SettingsFormValues {
  enabledSites: EnhancedSiteId[];
  enabledGlobalProcessors: GlobalProcessorId[];
}

const AUTO_ENABLE_NEW_SITE_IDS: EnhancedSiteId[] = ['bytetech', 'feishu'];
const AUTO_ENABLE_NEW_GLOBAL_PROCESSOR_IDS: GlobalProcessorId[] = ['markdownLinks'];

export const DEFAULT_SETTINGS: SettingsFormValues = {
  enabledSites: AUTO_ENABLE_NEW_SITE_IDS,
  enabledGlobalProcessors: AUTO_ENABLE_NEW_GLOBAL_PROCESSOR_IDS,
};

export function normalizeSettings(
  value: unknown,
  options: { autoEnableNewSites?: boolean } = {},
): ExtensionSettings {
  const candidate = isRecord(value) ? value : {};
  const enabledSites = normalizeEnabledSites(candidate.enabledSites);
  const knownSiteIds = normalizeEnabledSites(candidate.knownSiteIds);
  const enabledGlobalProcessors = normalizeEnabledGlobalProcessors(candidate.enabledGlobalProcessors);
  const knownGlobalProcessorIds = normalizeEnabledGlobalProcessors(candidate.knownGlobalProcessorIds);
  const autoEnabledSites =
    options.autoEnableNewSites === false
      ? []
      : AUTO_ENABLE_NEW_SITE_IDS.filter((siteId) => !knownSiteIds.includes(siteId));
  const autoEnabledGlobalProcessors =
    options.autoEnableNewSites === false
      ? []
      : AUTO_ENABLE_NEW_GLOBAL_PROCESSOR_IDS.filter(
          (processorId) => !knownGlobalProcessorIds.includes(processorId),
        );

  return {
    enabledSites: [...new Set([...enabledSites, ...autoEnabledSites])],
    knownSiteIds: [...ENHANCED_SITE_IDS],
    enabledGlobalProcessors: [
      ...new Set([...enabledGlobalProcessors, ...autoEnabledGlobalProcessors]),
    ],
    knownGlobalProcessorIds: [...GLOBAL_PROCESSOR_IDS],
  };
}

export function settingsToFormValues(settings: ExtensionSettings): SettingsFormValues {
  return {
    enabledSites: settings.enabledSites,
    enabledGlobalProcessors: settings.enabledGlobalProcessors,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
