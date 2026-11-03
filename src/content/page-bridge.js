/**
 * vnEdu Page Bridge (Runs in ISOLATED World context)
 * Communicates with page-bridge-main.js (Main World) to update ExtJS Store
 * records directly, ensuring the "Lưu" button recognizes all changes.
 */

(function () {
  'use strict';

  let scriptInjected = false;

  /**
   * Đảm bảo page-bridge-main.js đã được nhúng vào Main World
   */
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
   * Cập nhật ngay lập tức từng ô đơn lẻ (cho chế độ nhập 1 giây / ô)
   * @param {Object} payload { gridId, rowIndex, colIndex, colClass, colKey, value }
   */
  function applySingleCellUpdate(payload) {
    try {
      ensureBridgeInjected();
      if (typeof window.__vneduApplyExtJsSingleCellUpdate === 'function') {
        return window.__vneduApplyExtJsSingleCellUpdate(payload);
      }
      window.dispatchEvent(new CustomEvent('VNEDU_EXTJS_GRID_CELL_UPDATE_REQUEST', {
        detail: { payload: payload || {} }
      }));
    } catch (e) {
      console.warn('[PageBridge] Lỗi khi gửi cập nhật ô đơn lẻ:', e);
    }
  }

  /**
   * Gửi yêu cầu cập nhật đồng bộ toàn bộ ExtJS Store sang Main World
   * @param {Object} payload { gridId, updates, targetColumns }
   * @returns {Promise<Object>}
   */
  function applyStoreUpdates(payload) {
    return new Promise(function (resolve) {
      ensureBridgeInjected();

      const requestId = 'vnedu_bridge_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
      let isResolved = false;
      let timeoutId = null;

      function onResponse(event) {
        if (!event || !event.detail) return;
        if (event.detail.requestId === requestId) {
          cleanup();
          if (event.detail.success) {
            resolve(event.detail.result || { success: true });
          } else {
            resolve({ success: false, reason: event.detail.error || 'Lỗi cập nhật ExtJS Store' });
          }
        }
      }

      function cleanup() {
        if (isResolved) return;
        isResolved = true;
        if (timeoutId) clearTimeout(timeoutId);
        window.removeEventListener('VNEDU_EXTJS_GRID_UPDATE_RESPONSE', onResponse);
      }

      window.addEventListener('VNEDU_EXTJS_GRID_UPDATE_RESPONSE', onResponse);

      // Gửi event yêu cầu cập nhật
      window.dispatchEvent(new CustomEvent('VNEDU_EXTJS_GRID_UPDATE_REQUEST', {
        detail: {
          requestId: requestId,
          payload: payload || {}
        }
      }));

      // Timeout dự phòng
      timeoutId = setTimeout(function () {
        if (!isResolved) {
          cleanup();
          console.warn('[PageBridge] Hết thời gian chờ phản hồi từ Main World ExtJS Bridge');
          resolve({ success: false, reason: 'Timeout: Không nhận được phản hồi từ ExtJS Bridge trong Main World' });
        }
      }, 1200);
    });
  }

  // Xuất ra phạm vi toàn cục của Content Script
  window.PageBridge = {
    applySingleCellUpdate: applySingleCellUpdate,
    applyStoreUpdates: applyStoreUpdates,
    ensureBridgeInjected: ensureBridgeInjected
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.PageBridge;
  }
})();
