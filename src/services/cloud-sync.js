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

  // URL chính thức: GitHub API (cập nhật tức thì 0s delay), GitHub Raw, và jsDelivr CDN
  const API_RAW_URL = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${REMOTE_DATA_PATH}`;
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
   * So sánh phiên bản dữ liệu chuẩn theo từng phân đoạn số (vd: 2026.11.04.1 vs 2026.11.02.1)
   */
  function compareVersions(v1, v2) {
    if (!v1 && !v2) return 0;
    if (!v1) return -1;
    if (!v2) return 1;
    const parts1 = String(v1).split('.').map(p => parseInt(p, 10) || 0);
    const parts2 = String(v2).split('.').map(p => parseInt(p, 10) || 0);
    const len = Math.max(parts1.length, parts2.length);
    for (let i = 0; i < len; i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  }

  /**
   * Tải file JSON cấu hình từ GitHub (thử API trước để lấy dữ liệu mới nhất tức thì, sau đó Raw và CDN)
   */
  async function fetchRemoteData() {
    // 1. ƯU TIÊN 1: GitHub API với header Accept raw (cập nhật 0s, không bị Fastly CDN cache 5 phút)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const apiResp = await fetch(API_RAW_URL, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/vnd.github.v3.raw',
          'Cache-Control': 'no-cache, no-store'
        }
      });
      clearTimeout(timeoutId);
      if (apiResp.ok) {
        const json = await apiResp.json();
        if (json && json.dataVersion) {
          return json;
        }
      }
    } catch (e) {
      // Nếu API bị giới hạn lượt gọi hoặc lỗi mạng, chuyển sang Raw URL
    }

    // 2. ƯU TIÊN 2 & 3: GitHub Raw URL & CDN Fallback
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

      // So sánh phiên bản dữ liệu và mã nguồn ứng dụng (tiện ích)
      const localAppVersion = (typeof chrome !== 'undefined' && chrome.runtime?.getManifest?.()?.version) || '1.2.1';
      const remoteAppVersion = remoteData.appVersion || remoteData.version || '1.2.1';
      const hasAppUpdate = compareVersions(remoteAppVersion, localAppVersion) > 0;

      const isNewer = compareVersions(remoteData.dataVersion, currentVer) > 0;
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
          hasAppUpdate,
          remoteAppVersion,
          localAppVersion,
          remoteData
        };
      }

      return {
        updated: false,
        currentVersion: currentVer,
        hasAppUpdate,
        remoteAppVersion,
        localAppVersion,
        remoteData
      };
    } catch (e) {
      return { updated: false, error: e.message };
    }
  }

  /**
   * Lấy thông tin trạng thái đồng bộ hiện tại
   */
  async function getSyncInfo() {
    const stored = await storageGet([STORAGE_KEY_VERSION, STORAGE_KEY_LAST_CHECK]);
    const localAppVersion = (typeof chrome !== 'undefined' && chrome.runtime?.getManifest?.()?.version) || '1.2.1';
    return {
      currentVersion: stored[STORAGE_KEY_VERSION] || 'Mặc định cục bộ',
      localAppVersion,
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

