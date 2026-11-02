/**
 * DOM Inspector / Manual Element Picker
 * Allows teachers to manually select a comment box or student row if vnEdu layout is custom.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../utils/dom-utils'),
      require('./selector-memory'),
      require('../utils/logger')
    );
  } else {
    root.VnEduDOMInspector = factory(
      root.VnEduDOMUtils,
      root.VnEduSelectorMemory,
      root.VnEduLogger
    );
  }
})(typeof self !== 'undefined' ? self : this, function (DOMUtils, SelectorMemory, Logger) {
  let isSelecting = false;
  let hoveredElement = null;
  let overlayTooltip = null;
  let selectionCallback = null;

  function onMouseMove(e) {
    if (!isSelecting) return;

    // Ignore extension overlay elements
    if (e.target.closest('#vnedu-assistant-root') || e.target.id === 'vnedu-inspector-tip') {
      return;
    }

    if (hoveredElement && hoveredElement !== e.target) {
      hoveredElement.style.outline = hoveredElement.dataset.vneduInspOutline || '';
      hoveredElement.style.cursor = '';
    }

    hoveredElement = e.target;
    hoveredElement.dataset.vneduInspOutline = hoveredElement.style.outline || '';
    hoveredElement.style.outline = '3px dashed #3B82F6';
    hoveredElement.style.cursor = 'crosshair';

    if (overlayTooltip) {
      overlayTooltip.style.top = `${e.clientY + 15}px`;
      overlayTooltip.style.left = `${Math.min(window.innerWidth - 260, e.clientX + 15)}px`;
    }
  }

  function onClick(e) {
    if (!isSelecting) return;

    if (e.target.closest('#vnedu-assistant-root')) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const target = e.target;
    stopInspector();

    const selector = DOMUtils.getUniqueSelector(target);
    const rowEl = target.closest('tr, [role="row"], .grid-row');
    const rowSelector = rowEl ? DOMUtils.getUniqueSelector(rowEl) : '';

    if (Logger) Logger.info('Giáo viên đã chọn phần tử thủ công:', { selector, rowSelector });

    // Save into memory
    SelectorMemory.saveSelectorsForCurrentPage({
      commentFieldSelector: selector,
      studentRowSelector: rowSelector
    });

    if (typeof selectionCallback === 'function') {
      selectionCallback({
        element: target,
        selector,
        rowElement: rowEl,
        rowSelector
      });
    }
  }

  function onKeyDown(e) {
    if (!isSelecting) return;
    if (e.key === 'Escape') {
      stopInspector();
      if (Logger) Logger.info('Đã hủy chế độ chọn thủ công.');
      if (typeof selectionCallback === 'function') {
        selectionCallback(null);
      }
    }
  }

  function startInspector(callback) {
    if (isSelecting) stopInspector();

    isSelecting = true;
    selectionCallback = callback;

    overlayTooltip = document.createElement('div');
    overlayTooltip.id = 'vnedu-inspector-tip';
    overlayTooltip.style.cssText = `
      position: fixed;
      background: #1E293B;
      color: #FFFFFF;
      padding: 8px 12px;
      font-size: 13px;
      font-weight: 500;
      border-radius: 6px;
      z-index: 2147483647;
      pointer-events: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    overlayTooltip.textContent = '🎯 Nhấp vào ô nhận xét mẫu (Nhấn ESC để hủy)';
    document.body.appendChild(overlayTooltip);

    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
  }

  function stopInspector() {
    isSelecting = false;
    if (hoveredElement) {
      hoveredElement.style.outline = hoveredElement.dataset.vneduInspOutline || '';
      hoveredElement.style.cursor = '';
      delete hoveredElement.dataset.vneduInspOutline;
      hoveredElement = null;
    }
    if (overlayTooltip) {
      overlayTooltip.remove();
      overlayTooltip = null;
    }
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
  }

  return {
    startInspector,
    stopInspector
  };
});
