import { browser } from 'wxt/browser';

interface RuntimeI18n {
  getMessage(messageName: string, substitutions?: string | string[]): string;
}

export function t(key: string, substitutions?: string | string[]): string {
  const i18n = browser.i18n as unknown as RuntimeI18n;
  return i18n.getMessage(key, substitutions) || key;
}
