/**
 * Cloud Sync Service
 * Đồng bộ dữ liệu nhận xét, quy tắc môn học từ xa qua GitHub (không cần cài lại extension).
 * Tự động kiểm tra và cập nhật ngầm, tuân thủ 100% Manifest V3.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VnEduCloudSync = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const GITHUB_REPO_OWNER = 'mrlute88';
  const GITHUB_REPO_NAME = 'trolibebut';
  const GITHUB_BRANCH = 'main';
  const REMOTE_DATA_PATH = 'data/vnedu-online-data.json';

  // URL chính thức (GitHub Raw) & URL dự phòng siêu tốc (jsDelivr CDN)
  const PRIMARY_URL = `https://raw.githubusercontent.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/${GITHUB_BRANCH}/${REMOTE_DATA_PATH}`;
  const CDN_FALLBACK_URL = `https://cdn.jsdelivr.net/gh/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}@${GITHUB_BRANCH}/${REMOTE_DATA_PATH}`;

  const STORAGE_KEY_DATA = 'vnedu_cloud_data';
  const STORAGE_KEY_VERSION = 'vnedu_cloud_version';
  const STORAGE_KEY_LAST_CHECK = 'vnedu_cloud_last_check';
  const MIN_AUTO_CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 phút tự động kiểm tra một lần

  let activeData = null;

  const isExtensionContext = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  function storageGet(keys) {
    return new Promise(resolve => {
      if (isExtensionContext) {
        chrome.storage.local.get(keys, res => resolve(res || {}));
      } else {
        const res = {};
        const list = Array.isArray(keys) ? keys : [keys];
        list.forEach(k => {
          try {
            const v = localStorage.getItem(k);
            if (v !== null) res[k] = JSON.parse(v);
          } catch (e) {}
        });
        resolve(res);
      }
    });
  }

  function storageSet(obj) {
    return new Promise(resolve => {
      if (isExtensionContext) {
        chrome.storage.local.set(obj, () => resolve());
      } else {
        for (const k in obj) {
          try {
            localStorage.setItem(k, JSON.stringify(obj[k]));
          } catch (e) {}
        }
        resolve();
      }
    });
  }

  /**
   * Tải file JSON cấu hình từ GitHub (thử Primary trước, lỗi thì sang CDN)
   */
  async function fetchRemoteData() {
    const urls = [
      `${PRIMARY_URL}?_nocache=${Date.now()}`,
      `${CDN_FALLBACK_URL}?_nocache=${Date.now()}`
    ];

    for (const url of urls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const resp = await fetch(url, {
          signal: controller.signal,
          cache: 'no-store'
        });
        clearTimeout(timeoutId);

        if (resp.ok) {
          const json = await resp.json();
          if (json && json.dataVersion) {
            return json;
          }
        }
      } catch (e) {
        // Bỏ qua lỗi và thử URL dự phòng tiếp theo
      }
    }
    return null;
  }

  /**
   * Áp dụng dữ liệu đám mây vào bộ nhớ chạy hiện tại của extension
   */
  function applyDataToRuntime(data) {
    if (!data || typeof data !== 'object') return false;
    activeData = data;

    // 1. Áp dụng các mẫu nhận xét bổ sung vào OfflineCommentTemplates
    try {
      const templates = (typeof self !== 'undefined' && self.VnEduOfflineTemplates) || (typeof window !== 'undefined' && window.VnEduOfflineTemplates);
      if (templates && typeof templates.applyRemoteData === 'function') {
        templates.applyRemoteData(data);
      }
    } catch (e) {}

    // 2. Áp dụng quy tắc tên môn viết tắt bổ sung vào GridAdapter & TableAdapter
    try {
      if (Array.isArray(data.subjectAliases)) {
        const gridAdapter = (typeof self !== 'undefined' && self.VnEduGridAdapter) || (typeof window !== 'undefined' && window.VnEduGridAdapter);
        if (gridAdapter && typeof gridAdapter.setRemoteMatchers === 'function') {
          gridAdapter.setRemoteMatchers(data.subjectAliases);
        }
        const tableAdapter = (typeof self !== 'undefined' && self.VnEduTableAdapter) || (typeof window !== 'undefined' && window.VnEduTableAdapter);
        if (tableAdapter && typeof tableAdapter.setRemoteMatchers === 'function') {
          tableAdapter.setRemoteMatchers(data.subjectAliases);
        }
      }
    } catch (e) {}

    return true;
  }

  /**
   * Khởi động: Đọc dữ liệu đã lưu từ trước và áp dụng ngay lập tức
   */
  async function loadStoredData() {
    try {
      const stored = await storageGet([STORAGE_KEY_DATA, STORAGE_KEY_VERSION]);
      if (stored && stored[STORAGE_KEY_DATA]) {
        applyDataToRuntime(stored[STORAGE_KEY_DATA]);
        return stored[STORAGE_KEY_DATA];
      }
    } catch (e) {}
    return null;
  }

  /**
   * Kiểm tra và cập nhật dữ liệu từ xa
   * @param {boolean} force - Nếu true, bỏ qua giới hạn thời gian 30 phút (khi người dùng bấm nút cập nhật thủ công)
   */
  async function checkAndUpdate(force = false) {
    try {
      const stored = await storageGet([STORAGE_KEY_DATA, STORAGE_KEY_VERSION, STORAGE_KEY_LAST_CHECK]);
      const currentVer = stored[STORAGE_KEY_VERSION] || '0';
      const lastCheck = stored[STORAGE_KEY_LAST_CHECK] || 0;
      const now = Date.now();

      // Nếu không phải kiểm tra thủ công và vừa mới kiểm tra < 30 phút trước -> bỏ qua
      if (!force && (now - lastCheck < MIN_AUTO_CHECK_INTERVAL_MS)) {
        return { updated: false, currentVersion: currentVer, skippedThrottled: true };
      }

      await storageSet({ [STORAGE_KEY_LAST_CHECK]: now });

      const remoteData = await fetchRemoteData();
      if (!remoteData) {
        return { updated: false, currentVersion: currentVer, error: 'CANNOT_CONNECT' };
      }

      // So sánh phiên bản dữ liệu
      const isNewer = String(remoteData.dataVersion) > String(currentVer);
      if (isNewer || force) {
        await storageSet({
          [STORAGE_KEY_DATA]: remoteData,
          [STORAGE_KEY_VERSION]: remoteData.dataVersion,
          [STORAGE_KEY_LAST_CHECK]: now
        });

        applyDataToRuntime(remoteData);

        return {
          updated: isNewer,
          currentVersion: remoteData.dataVersion,
          previousVersion: currentVer,
          remoteData
        };
      }

      return { updated: false, currentVersion: currentVer, remoteData };
    } catch (e) {
      return { updated: false, error: e.message };
    }
  }

  /**
   * Lấy thông tin trạng thái đồng bộ hiện tại
   */
  async function getSyncInfo() {
    const stored = await storageGet([STORAGE_KEY_VERSION, STORAGE_KEY_LAST_CHECK]);
    return {
      currentVersion: stored[STORAGE_KEY_VERSION] || 'Mặc định cục bộ',
      lastCheckedTime: stored[STORAGE_KEY_LAST_CHECK] || 0,
      repoUrl: `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`,
      primaryUrl: PRIMARY_URL
    };
  }

  return {
    PRIMARY_URL,
    CDN_FALLBACK_URL,
    loadStoredData,
    fetchRemoteData,
    checkAndUpdate,
    applyDataToRuntime,
    getSyncInfo,
    getActiveData: () => activeData
  };
});

