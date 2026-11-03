/**
 * Background Service Worker (Manifest V3)
 * Handles commands, extension icon click, and tab message routing.
 * Strictly stateless: state stored in chrome.storage.
 */

// Install & Update Listener
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[vnEdu Assistant] Service worker đã được cài đặt:', details.reason);

  // Dọn sạch các key bản quyền cũ đã lưu để áp dụng hệ thống key mới
  try {
    await chrome.storage.local.remove(['vnedu_assistant_activated_key']);
  } catch (e) {}

  // Set default settings if not exists
  const { vnedu_settings } = await chrome.storage.local.get('vnedu_settings');
  if (!vnedu_settings) {
    await chrome.storage.local.set({
      vnedu_settings: {
        showFloatingButton: true,
        autoScanOnLoad: true,
        confirmBeforeBatchFill: true,
        fillDelayMs: 450,
        anonymizeStudentNamesForAI: true,
        saveHistory: true,
        aiProvider: 'offline',
        geminiApiKey: ''
      }
    });
  }
});

// Handle Hotkeys / Shortcut Commands
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  try {
    if (command === 'toggle-panel') {
      await chrome.tabs.sendMessage(tab.id, { action: 'OPEN_PANEL' });
    } else if (command === 'scan-page') {
      await chrome.tabs.sendMessage(tab.id, { action: 'SCAN_PAGE' });
    }
  } catch (err) {
    console.log('[vnEdu Assistant] Thông báo gửi lệnh tới tab:', err && err.message ? err.message : err);
  }
});

// Message listener from popup / content
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.action === 'PING') {
        sendResponse({ status: 'PONG', time: Date.now() });
      } else {
        sendResponse({ received: true });
      }
    } catch (e) {
      sendResponse({ error: e.message });
    }
  })();
  return true; // Keep message channel open for async response
});
