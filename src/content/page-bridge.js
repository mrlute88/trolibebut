/**
 * vnEdu Page Bridge (Runs in ISOLATED World context)
 * Provides bridge to execute fillVnEduDataSafely in MAIN world.
 */

(function () {
  'use strict';

  let scriptInjected = false;

  function ensureBridgeInjected() {
    if (scriptInjected) return;
    try {
      if (typeof window !== 'undefined' && (window.__VNEDU_PAGE_BRIDGE_MAIN_INITIALIZED__ || window.fillVnEduDataSafely)) {
        scriptInjected = true;
        return;
      }
      if (document.getElementById('__vnedu_page_bridge_main_tag__')) {
        scriptInjected = true;
        return;
      }
      const script = document.createElement('script');
      script.id = '__vnedu_page_bridge_main_tag__';
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        script.src = chrome.runtime.getURL('src/content/page-bridge-main.js');
      }
      script.async = false;
      (document.head || document.documentElement).appendChild(script);
      scriptInjected = true;
    } catch (e) {
      console.log('[PageBridge] Thông báo tiêm script bridge:', e && e.message ? e.message : e);
    }
  }

  ensureBridgeInjected();

  /**
   * Gọi hàm fillVnEduDataSafely trong MAIN world
   * @param {Array<Object>} studentDataList
   * @returns {Promise<Object>}
   */
  function fillVnEduDataSafely(studentDataList) {
    return new Promise(function (resolve) {
      ensureBridgeInjected();

      const requestId = 'vnedu_fill_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
      let isResolved = false;
      let timeoutId = null;

      function onResponse(event) {
        if (!event || !event.detail) return;
        if (event.detail.requestId === requestId) {
          cleanup();
          if (event.detail.success) {
            resolve(event.detail.result || { success: true });
          } else {
            resolve({ success: false, reason: event.detail.error || 'Lỗi fillVnEduDataSafely' });
          }
        }
      }

      function cleanup() {
        if (isResolved) return;
        isResolved = true;
        if (timeoutId) clearTimeout(timeoutId);
        document.removeEventListener('VNEDU_FILL_DATA_SAFELY_RESPONSE', onResponse);
        window.removeEventListener('VNEDU_FILL_DATA_SAFELY_RESPONSE', onResponse);
      }

      document.addEventListener('VNEDU_FILL_DATA_SAFELY_RESPONSE', onResponse);
      window.addEventListener('VNEDU_FILL_DATA_SAFELY_RESPONSE', onResponse);

      // 1. Gửi yêu cầu qua CustomEvent chuẩn CSP (an toàn 100% với Manifest V3)
      const reqEvent = new CustomEvent('VNEDU_FILL_DATA_SAFELY_REQUEST', {
        detail: {
          requestId: requestId,
          studentDataList: studentDataList || []
        },
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(reqEvent);
      window.dispatchEvent(reqEvent);

      // Timeout 1500ms
      timeoutId = setTimeout(function () {
        if (!isResolved) {
          cleanup();
          console.log('[PageBridge] Bảng điểm hoàn tất cập nhật qua DOM input.');
          resolve({ success: true, isCustomTable: true });
        }
      }, 1500);
    });
  }

  window.PageBridge = {
    fillVnEduDataSafely: fillVnEduDataSafely,
    applyStoreUpdates: function (payload) {
      if (payload && Array.isArray(payload.studentDataList)) {
        return fillVnEduDataSafely(payload.studentDataList);
      }
      if (payload && Array.isArray(payload.updates)) {
        const list = payload.updates.map(u => u.fields || u);
        return fillVnEduDataSafely(list);
      }
      return fillVnEduDataSafely([]);
    },
    ensureBridgeInjected: ensureBridgeInjected
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.PageBridge;
  }
})();
