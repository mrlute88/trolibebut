/**
 * Mutation Observer
 * Detects dynamic DOM changes (AJAX, SPA pagination, class/subject dropdown changes)
 * and safely invalidates mapping to prevent accidental mismatches.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../utils/logger'));
  } else {
    root.VnEduMutationObserver = factory(root.VnEduLogger);
  }
})(typeof self !== 'undefined' ? self : this, function (Logger) {
  'use strict';

  let observer = null;
  let debounceTimer = null;
  let changeListeners = [];
  let isEnabled = false;

  function isTableOrGridMutation(m) {
    if (!m.target) return false;

    // Ignore changes within extension overlay
    if (m.target.id === 'vnedu-assistant-root' || (typeof m.target.closest === 'function' && m.target.closest('#vnedu-assistant-root'))) {
      return false;
    }

    // Ignore floating tips, combo dropdowns, masks, animations, cursors
    const targetClass = typeof m.target.className === 'string' ? m.target.className : '';
    if (/x-tip|x-combo-list|x-shadow|tooltip|loading|x-mask|x-layer/i.test(targetClass)) {
      return false;
    }

    // Check if added/removed nodes contain tr, table, or grid rows
    const checkNodes = (nodeList) => {
      if (!nodeList || nodeList.length === 0) return false;
      for (let i = 0; i < nodeList.length; i++) {
        const node = nodeList[i];
        if (node.nodeType !== 1) continue; // Only element nodes
        const tag = (node.tagName || '').toLowerCase();
        const cls = typeof node.className === 'string' ? node.className : '';
        if (tag === 'tr' || tag === 'table' || tag === 'tbody' || /x-grid3-row|ant-table-row|grid-row/i.test(cls)) {
          return true;
        }
        if (typeof node.querySelector === 'function' && node.querySelector('tr, table, .x-grid3-row, .ant-table-row')) {
          return true;
        }
      }
      return false;
    };

    return checkNodes(m.addedNodes) || checkNodes(m.removedNodes);
  }

  function initObserver(onChangeCallback) {
    if (onChangeCallback && !changeListeners.includes(onChangeCallback)) {
      changeListeners.push(onChangeCallback);
    }

    if (observer) return;

    if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') {
      return;
    }

    observer = new MutationObserver((mutations) => {
      if (!isEnabled) return;

      let relevantChange = false;
      for (let i = 0; i < mutations.length; i++) {
        if (isTableOrGridMutation(mutations[i])) {
          relevantChange = true;
          break;
        }
      }

      if (!relevantChange) return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (Logger) Logger.info('Phát hiện cập nhật bảng dữ liệu trên vnEdu, đồng bộ lại dữ liệu...');
        changeListeners.forEach(cb => {
          try {
            cb();
          } catch (e) {}
        });
      }, 1200);
    });

    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }

  function start() {
    isEnabled = true;
  }

  function pause() {
    isEnabled = false;
    if (debounceTimer) clearTimeout(debounceTimer);
  }

  function addChangeListener(cb) {
    if (cb && !changeListeners.includes(cb)) {
      changeListeners.push(cb);
    }
  }

  return {
    initObserver,
    start,
    pause,
    addChangeListener
  };
});
