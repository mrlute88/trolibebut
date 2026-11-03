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
      console.warn('[PageBridge] Không thể tiêm script bridge:', e);
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

      // 1. Phát sự kiện CustomEvent
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

      // 2. Đồng thời kích hoạt trực tiếp qua tiêm inline script trong Main World
      try {
        const inlineScript = document.createElement('script');
        const dataJson = JSON.stringify(studentDataList || []);
        inlineScript.textContent = `
          (function() {
            try {
              var data = ${dataJson};
              var res = null;
              if (typeof window.fillVnEduDataSafely === 'function') {
                res = window.fillVnEduDataSafely(data);
              } else if (typeof window.__vneduFillVnEduDataSafely === 'function') {
                res = window.__vneduFillVnEduDataSafely(data);
              }
              if (res) {
                var respEvent = new CustomEvent('VNEDU_FILL_DATA_SAFELY_RESPONSE', {
                  detail: { requestId: '${requestId}', success: true, result: res },
                  bubbles: true
                });
                document.dispatchEvent(respEvent);
                window.dispatchEvent(respEvent);
              }
            } catch(e) {
              var errEvent = new CustomEvent('VNEDU_FILL_DATA_SAFELY_RESPONSE', {
                detail: { requestId: '${requestId}', success: false, error: e.message || String(e) },
                bubbles: true
              });
              document.dispatchEvent(errEvent);
              window.dispatchEvent(errEvent);
            }
          })();
        `;
        (document.head || document.documentElement).appendChild(inlineScript);
        inlineScript.remove();
      } catch (e) {
        console.warn('[PageBridge] Lỗi inline fallback:', e);
      }

      // Timeout 2500ms
      timeoutId = setTimeout(function () {
        if (!isResolved) {
          cleanup();
          console.warn('[PageBridge] Timeout khi chờ phản hồi từ fillVnEduDataSafely');
          resolve({ success: false, reason: 'Timeout khi thực thi fillVnEduDataSafely' });
        }
      }, 2500);
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
