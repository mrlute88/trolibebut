/**
 * DOM Utilities for Safe Inspection and Filling
 * Handles native setter injection for React / Vue / Angular / plain HTML controlled components.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VnEduDOMUtils = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  /**
   * Set value into an input / textarea / contenteditable with framework awareness
   */
  function setFieldValue(element, text) {
    if (!element) return false;

    // 1. Scroll element into view smoothly and center it
    try {
      element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    } catch (e) {
      try { element.scrollIntoView(false); } catch (err) {}
    }

    // 2. Focus element
    try { element.focus(); } catch (e) {}

    const tagName = (element.tagName || '').toUpperCase();
    const isContentEditable = typeof element.getAttribute === 'function' && element.getAttribute('contenteditable') === 'true';

    if (isContentEditable) {
      // For contenteditable div/span
      try {
        const beforeInputEvent = new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: text
        });
        element.dispatchEvent(beforeInputEvent);
      } catch (e) {}

      element.innerText = text;
      element.textContent = text;

      try {
        const inputEvent = new InputEvent('input', {
          bubbles: true,
          composed: true,
          inputType: 'insertText',
          data: text
        });
        element.dispatchEvent(inputEvent);
      } catch (e) {}

      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    // 3. User-level typing emulation with execCommand (crucial for ExtJS, React, Vue, Angular)
    try {
      if (typeof document !== 'undefined' && document.execCommand) {
        if (typeof element.select === 'function') element.select();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, text);
      }
    } catch (e) {}

    // 4. Native property descriptor setter for HTMLTextAreaElement or HTMLInputElement
    const win = (element.ownerDocument && element.ownerDocument.defaultView) || (typeof window !== 'undefined' ? window : global);
    const proto = tagName === 'TEXTAREA'
      ? (win.HTMLTextAreaElement ? win.HTMLTextAreaElement.prototype : (typeof HTMLTextAreaElement !== 'undefined' ? HTMLTextAreaElement.prototype : null))
      : (win.HTMLInputElement ? win.HTMLInputElement.prototype : (typeof HTMLInputElement !== 'undefined' ? HTMLInputElement.prototype : null));

    if (proto) {
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
      if (descriptor && descriptor.set) {
        try { descriptor.set.call(element, text); } catch (e) { element.value = text; }
      } else {
        element.value = text;
      }
    } else {
      element.value = text;
    }

    // Direct property assignments ensuring text is visible in DOM
    element.value = text;
    if (tagName === 'TEXTAREA') {
      element.textContent = text;
      element.innerText = text;
    }
    if ('defaultValue' in element) {
      try { element.defaultValue = text; } catch (e) {}
    }

    // 5. Dispatch standard input events
    try {
      if (typeof InputEvent !== 'undefined') {
        element.dispatchEvent(new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: text
        }));
        element.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          composed: true,
          inputType: 'insertText',
          data: text
        }));
      } else if (typeof Event !== 'undefined') {
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } catch (e) {}

    try {
      if (typeof Event !== 'undefined') {
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } catch (e) {}

    try {
      if (typeof KeyboardEvent !== 'undefined') {
        element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));
      }
    } catch (e) {}

    // 6. ExtJS-specific integration (vnEdu V5 Desktop Web)
    try {
      if (win.Ext) {
        // Update ExtJS component directly if registered
        const cmp = (win.Ext.getCmp && win.Ext.getCmp(element.id)) ||
                    (win.Ext.ComponentMgr && win.Ext.ComponentMgr.get && win.Ext.ComponentMgr.get(element.id));
        if (cmp && typeof cmp.setValue === 'function') {
          cmp.setValue(text);
          if (typeof cmp.fireEvent === 'function') {
            cmp.fireEvent('change', cmp, text, '');
          }
        }

        // If inside an ExtJS Grid, update grid record
        const gridEl = element.closest && element.closest('.x-grid3, .x-grid, .x-panel');
        if (gridEl && win.Ext.getCmp) {
          const grid = win.Ext.getCmp(gridEl.id);
          if (grid && typeof grid.getStore === 'function') {
            const rowEl = element.closest('tr, .x-grid3-row');
            if (rowEl && rowEl.parentElement) {
              const rowIndex = Array.from(rowEl.parentElement.children).indexOf(rowEl);
              if (rowIndex >= 0) {
                const record = grid.getStore().getAt(rowIndex);
                if (record && record.set) {
                  for (const fName in record.data) {
                    if (/nhan_?xet|comment|nx|danh_?gia/i.test(fName)) {
                      record.set(fName, text);
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch (e) {}

    // NOTE: We deliberately do NOT dispatch 'blur' here because ExtJS onBlur reverts uncommitted cell values!
    return true;
  }

  /**
   * Safe sleep / delay helper
   */
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Highlight element temporarily for Test Mode or Manual Element Inspection
   */
  const highlightedElements = new Set();

  function highlightElement(element, color = '#10B981', label = '') {
    if (!element || !(element instanceof HTMLElement)) return;

    element.dataset.vneduOriginalOutline = element.style.outline || '';
    element.dataset.vneduOriginalPosition = element.style.position || '';
    element.style.outline = `3px solid ${color}`;
    element.style.outlineOffset = '2px';

    highlightedElements.add(element);

    if (label) {
      let badge = element.querySelector('.vnedu-test-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'vnedu-test-badge';
        badge.style.cssText = `
          position: absolute;
          background: ${color};
          color: #ffffff;
          font-size: 11px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 4px;
          z-index: 10000;
          pointer-events: none;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        `;
        if (element.style.position === 'static' || !element.style.position) {
          element.style.position = 'relative';
        }
        element.appendChild(badge);
      }
      badge.textContent = label;
    }
  }

  function clearHighlights() {
    highlightedElements.forEach(el => {
      if (el && el.style) {
        el.style.outline = el.dataset.vneduOriginalOutline || '';
        if (el.dataset.vneduOriginalPosition) {
          el.style.position = el.dataset.vneduOriginalPosition;
        }
        const badge = el.querySelector('.vnedu-test-badge');
        if (badge) badge.remove();
        delete el.dataset.vneduOriginalOutline;
        delete el.dataset.vneduOriginalPosition;
      }
    });
    highlightedElements.clear();

    document.querySelectorAll('.vnedu-test-badge').forEach(b => b.remove());
  }

  /**
   * Generate unique DOM CSS selector path for an element
   */
  function getUniqueSelector(element) {
    if (!(element instanceof Element)) return '';

    if (element.id && !/\d{5,}/.test(element.id)) {
      return `#${CSS.escape(element.id)}`;
    }

    if (element.getAttribute('name')) {
      return `${element.tagName.toLowerCase()}[name="${CSS.escape(element.getAttribute('name'))}"]`;
    }

    const path = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.id && !/\d{5,}/.test(current.id)) {
        selector = `#${CSS.escape(current.id)}`;
        path.unshift(selector);
        break;
      }

      let sibling = current;
      let nth = 1;
      while (sibling.previousElementSibling) {
        sibling = sibling.previousElementSibling;
        if (sibling.tagName === current.tagName) nth++;
      }
      if (nth > 1) {
        selector += `:nth-of-type(${nth})`;
      }
      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  }

  return {
    setFieldValue,
    sleep,
    highlightElement,
    clearHighlights,
    getUniqueSelector
  };
});
