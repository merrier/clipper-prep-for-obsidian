export const ENHANCED_SITE_IDS = ['wechat', 'bytetech', 'feishu'] as const;

export type EnhancedSiteId = (typeof ENHANCED_SITE_IDS)[number];

export interface EnhancementStatus {
  site: EnhancedSiteId | null;
  enabled: boolean;
  active: boolean;
  imageCount: number;
  normalizedImageCount: number;
  label: string;
}

export const INACTIVE_ENHANCEMENT_STATUS: EnhancementStatus = {
  site: null,
  enabled: false,
  active: false,
  imageCount: 0,
  normalizedImageCount: 0,
  label: 'No site enhancer active',
};

export function isEnhancedSiteId(value: unknown): value is EnhancedSiteId {
  return typeof value === 'string' && ENHANCED_SITE_IDS.includes(value as EnhancedSiteId);
}

export function normalizeEnabledSites(value: unknown): EnhancedSiteId[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.filter(isEnhancedSiteId))];
}

export function isSiteEnabled(enabledSites: readonly EnhancedSiteId[], site: EnhancedSiteId): boolean {
  return enabledSites.includes(site);
}
