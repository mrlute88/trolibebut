/**
 * Chrome Storage Wrapper
 * Handles settings, history, and selector memory.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VnEduStorage = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const DEFAULT_SETTINGS = {
    showFloatingButton: true,
    autoScanOnLoad: true,
    confirmBeforeBatchFill: true,
    fillDelayMs: 450,
    anonymizeStudentNamesForAI: true, // Privacy first: default ON
    saveHistory: true,
    enableMultiPage: false,
    aiProvider: 'offline', // 'gemini', 'openai', 'offline'
    geminiApiKey: '',
    openaiApiKey: '',
    aiModel: 'gemini-1.5-flash',
    customPrompt: '',
    testMode: false,
    strictRowNameCheck: true // Anti-mismatch check before filling each row
  };

  const isExtensionContext = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  // Local in-memory / localStorage fallback for unit testing outside extension
  const memoryFallback = {
    get: function (keys) {
      const res = {};
      const keyList = Array.isArray(keys) ? keys : [keys];
      keyList.forEach(k => {
        try {
          const val = localStorage.getItem(`vnedu_${k}`);
          if (val !== null) res[k] = JSON.parse(val);
        } catch (e) {}
      });
      return Promise.resolve(res);
    },
    set: function (items) {
      for (const k in items) {
        try {
          localStorage.setItem(`vnedu_${k}`, JSON.stringify(items[k]));
        } catch (e) {}
      }
      return Promise.resolve();
    }
  };

  async function getSettings() {
    try {
      let stored;
      if (isExtensionContext) {
        stored = await chrome.storage.local.get('vnedu_settings');
      } else {
        stored = await memoryFallback.get('vnedu_settings');
      }
      return { ...DEFAULT_SETTINGS, ...(stored.vnedu_settings || {}) };
    } catch (e) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  async function saveSettings(newSettings) {
    const current = await getSettings();
    const updated = { ...current, ...newSettings };
    if (isExtensionContext) {
      await chrome.storage.local.set({ vnedu_settings: updated });
    } else {
      await memoryFallback.set({ vnedu_settings: updated });
    }
    return updated;
  }

  async function getSavedSelectors(domain) {
    try {
      let stored;
      if (isExtensionContext) {
        stored = await chrome.storage.local.get('vnedu_selectors');
      } else {
        stored = await memoryFallback.get('vnedu_selectors');
      }
      const all = stored.vnedu_selectors || {};
      return domain ? all[domain] || null : all;
    } catch (e) {
      return null;
    }
  }

  async function saveSelectors(domain, selectorConfig) {
    try {
      let stored;
      if (isExtensionContext) {
        stored = await chrome.storage.local.get('vnedu_selectors');
      } else {
        stored = await memoryFallback.get('vnedu_selectors');
      }
      const all = stored.vnedu_selectors || {};
      all[domain] = {
        ...selectorConfig,
        updatedAt: new Date().toISOString()
      };
      if (isExtensionContext) {
        await chrome.storage.local.set({ vnedu_selectors: all });
      } else {
        await memoryFallback.set({ vnedu_selectors: all });
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  async function addHistorySession(session) {
    try {
      const settings = await getSettings();
      if (!settings.saveHistory) return;

      let stored;
      if (isExtensionContext) {
        stored = await chrome.storage.local.get('vnedu_history');
      } else {
        stored = await memoryFallback.get('vnedu_history');
      }
      const history = stored.vnedu_history || [];
      history.unshift({
        id: 'sess_' + Date.now(),
        date: new Date().toLocaleString('vi-VN'),
        ...session
      });
      // Keep last 30 sessions
      if (history.length > 30) history.pop();

      if (isExtensionContext) {
        await chrome.storage.local.set({ vnedu_history: history });
      } else {
        await memoryFallback.set({ vnedu_history: history });
      }
    } catch (e) {}
  }

  async function getHistory() {
    try {
      let stored;
      if (isExtensionContext) {
        stored = await chrome.storage.local.get('vnedu_history');
      } else {
        stored = await memoryFallback.get('vnedu_history');
      }
      return stored.vnedu_history || [];
    } catch (e) {
      return [];
    }
  }

  return {
    DEFAULT_SETTINGS,
    getSettings,
    saveSettings,
    getSavedSelectors,
    saveSelectors,
    addHistorySession,
    getHistory
  };
});
