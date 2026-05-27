import { CheckCircle2, Link, LoaderCircle, Newspaper, Save } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';

import {
  createRuntimePing,
  isRuntimePongResponse,
} from '../../shared/messages';
import {
  DEFAULT_SETTINGS,
  settingsToFormValues,
  type SettingsFormValues,
} from '../../shared/settings';
import {
  isGlobalProcessorEnabled,
  type GlobalProcessorId,
} from '../../shared/global-processing';
import { isSiteEnabled, type EnhancedSiteId } from '../../shared/site-enhancements';
import { getSettings, saveSettings } from '../../shared/storage';
import { t } from '../../shared/i18n';

type SaveState = 'idle' | 'loading' | 'saved' | 'error';

export function OptionsApp() {
  const [formValues, setFormValues] = useState<SettingsFormValues>(DEFAULT_SETTINGS);
  const [saveState, setSaveState] = useState<SaveState>('loading');
  const [message, setMessage] = useState(t('statusLoadingSettings'));
  const [runtimeReady, setRuntimeReady] = useState(false);

  useEffect(() => {
    document.title = t('optionsDocumentTitle');

    let cancelled = false;

    async function load() {
      try {
        const [settings, pingResponse] = await Promise.all([
          getSettings(),
          browser.runtime.sendMessage(createRuntimePing('options')),
        ]);

        if (cancelled) {
          return;
        }

        setFormValues(settingsToFormValues(settings));
        setRuntimeReady(isRuntimePongResponse(pingResponse));
        setSaveState('idle');
        setMessage(t('statusSettingsLoaded'));
      } catch (error) {
        if (cancelled) {
          return;
        }

        setSaveState('error');
        setMessage(getErrorMessage(error));
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveState('loading');
    setMessage(t('statusSavingSettings'));

    try {
      const savedSettings = await saveSettings(formValues);
      setFormValues(settingsToFormValues(savedSettings));
      setSaveState('saved');
      setMessage(t('statusSettingsSaved'));
    } catch (error) {
      setSaveState('error');
      setMessage(getErrorMessage(error));
    }
  }

  function setSiteEnabled(site: EnhancedSiteId, enabled: boolean) {
    setFormValues((current) => {
      const nextSites = enabled
        ? [...new Set([...current.enabledSites, site])]
        : current.enabledSites.filter((enabledSite) => enabledSite !== site);

      return {
        ...current,
        enabledSites: nextSites,
      };
    });
  }

  function setGlobalProcessorEnabled(processor: GlobalProcessorId, enabled: boolean) {
    setFormValues((current) => {
      const nextProcessors = enabled
        ? [...new Set([...current.enabledGlobalProcessors, processor])]
        : current.enabledGlobalProcessors.filter(
            (enabledProcessor) => enabledProcessor !== processor,
          );

      return {
        ...current,
        enabledGlobalProcessors: nextProcessors,
      };
    });
  }

  return (
    <main className="options-shell">
      <header className="options-header">
        <div>
          <p className="eyebrow">{t('extensionName')}</p>
          <h1>{t('settingsTitle')}</h1>
        </div>
        <RuntimeStatus ready={runtimeReady} />
      </header>

      <form className="settings-form" onSubmit={(event) => void handleSubmit(event)}>
        <section className="settings-section" aria-labelledby="enhanced-sites-title">
          <div className="section-heading">
            <Newspaper size={18} />
            <h2 id="enhanced-sites-title">{t('enhancedSitesTitle')}</h2>
          </div>

          <label className="site-option">
            <input
              type="checkbox"
              checked={isSiteEnabled(formValues.enabledSites, 'wechat')}
              onChange={(event) => setSiteEnabled('wechat', event.target.checked)}
            />
            <span>
              <strong>{t('siteWeChat')}</strong>
              <small>mp.weixin.qq.com/s...</small>
            </span>
          </label>

          <label className="site-option">
            <input
              type="checkbox"
              checked={isSiteEnabled(formValues.enabledSites, 'bytetech')}
              onChange={(event) => setSiteEnabled('bytetech', event.target.checked)}
            />
            <span>
              <strong>{t('siteByteTech')}</strong>
              <small>bytetech.info/articles...</small>
            </span>
          </label>

          <label className="site-option">
            <input
              type="checkbox"
              checked={isSiteEnabled(formValues.enabledSites, 'feishu')}
              onChange={(event) => setSiteEnabled('feishu', event.target.checked)}
            />
            <span>
              <strong>{t('siteFeishu')}</strong>
              <small>feishu.cn/docx|wiki..., larkoffice.com/docx|wiki...</small>
            </span>
          </label>
        </section>

        <section className="settings-section" aria-labelledby="global-processing-title">
          <div className="section-heading">
            <Link size={18} />
            <h2 id="global-processing-title">{t('globalProcessingTitle')}</h2>
          </div>

          <label className="site-option">
            <input
              type="checkbox"
              checked={isGlobalProcessorEnabled(formValues.enabledGlobalProcessors, 'markdownLinks')}
              onChange={(event) => setGlobalProcessorEnabled('markdownLinks', event.target.checked)}
            />
            <span>
              <strong>{t('processorMarkdownLinks')}</strong>
              <small>{t('processorMarkdownLinksDescription')}</small>
            </span>
          </label>
        </section>

        <footer className="form-footer">
          <StatusMessage state={saveState} message={message} />
          <button className="save-button" type="submit" disabled={saveState === 'loading'}>
            {saveState === 'loading' ? <LoaderCircle size={18} className="spin" /> : <Save size={18} />}
            <span>{t('saveButton')}</span>
          </button>
        </footer>
      </form>
    </main>
  );
}

function RuntimeStatus({ ready }: { ready: boolean }) {
  return (
    <div className={ready ? 'runtime-status ready' : 'runtime-status'}>
      {ready ? <CheckCircle2 size={17} /> : <LoaderCircle size={17} className="spin" />}
      <span>{ready ? t('runtimeConnected') : t('runtimePending')}</span>
    </div>
  );
}

function StatusMessage({ state, message }: { state: SaveState; message: string }) {
  return (
    <p className={`status-message ${state}`}>
      {state === 'loading' ? <LoaderCircle size={16} className="spin" /> : null}
      <span>{message}</span>
    </p>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : t('unknownError');
}
