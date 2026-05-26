import { browser } from 'wxt/browser';

import {
  normalizeSettings,
  type ExtensionSettings,
  type SettingsFormValues,
} from './settings';

export const SETTINGS_STORAGE_KEY = 'settings';

export async function getSettings(): Promise<ExtensionSettings> {
  const result = await browser.storage.local.get(SETTINGS_STORAGE_KEY);
  return normalizeSettings(result[SETTINGS_STORAGE_KEY]);
}

export async function saveSettings(settings: ExtensionSettings | SettingsFormValues): Promise<ExtensionSettings> {
  const normalized = normalizeSettings(settings, { autoEnableNewSites: false });
  await browser.storage.local.set({
    [SETTINGS_STORAGE_KEY]: normalized,
  });
  return normalized;
}
