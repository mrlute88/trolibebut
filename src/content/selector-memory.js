/**
 * Selector Memory
 * Remembers teacher-customized selectors per school subdomain/pattern.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../storage/chrome-storage'), require('../utils/logger'));
  } else {
    root.VnEduSelectorMemory = factory(root.VnEduStorage, root.VnEduLogger);
  }
})(typeof self !== 'undefined' ? self : this, function (Storage, Logger) {
  function getDomainKey() {
    return window.location.hostname || 'default';
  }

  async function loadSelectorsForCurrentPage() {
    const domain = getDomainKey();
    return Storage.getSavedSelectors(domain);
  }

  async function saveSelectorsForCurrentPage(config) {
    const domain = getDomainKey();
    const success = await Storage.saveSelectors(domain, config);
    if (success && Logger) {
      Logger.success(`Đã lưu bộ selector tùy chỉnh cho tên miền: ${domain}`);
    }
    return success;
  }

  return {
    getDomainKey,
    loadSelectorsForCurrentPage,
    saveSelectorsForCurrentPage
  };
});
