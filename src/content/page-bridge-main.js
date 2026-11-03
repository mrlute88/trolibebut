/**
 * vnEdu Page Bridge (Runs in MAIN World context)
 * Directly updates ExtJS Store models using native ExtJS Store API.
 * Does not touch DOM HTML, keeping cells interactive (click-to-edit)
 * and triggering vnEdu's dirty flags (red triangles) for saving.
 */

(function () {
  'use strict';

  if (window.__VNEDU_PAGE_BRIDGE_MAIN_INITIALIZED__) {
    return;
  }
  window.__VNEDU_PAGE_BRIDGE_MAIN_INITIALIZED__ = true;

  /**
   * Chuẩn hóa văn bản tiếng Việt để so khớp nhãn cột
   */
  function normalizeText(text) {
    if (!text) return '';
    return String(text)
      .replace(/<[^>]+>/g, ' ')
      .normalize('NFC')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Nhận diện nhãn chuẩn từ chuỗi tiêu đề cột
   */
  function matchCanonicalKey(headerText) {
    const txt = normalizeText(headerText);
    if (!txt) return null;

    if (/tự\s*chủ/i.test(txt)) return 'tự chủ và tự học';
    if (/giao\s*tiếp/i.test(txt)) return 'giao tiếp và hợp tác';
    if (/gqvđ|gqvd|sáng\s*tạo|giải\s*quyết/i.test(txt)) return 'gqvd và sáng tạo';
    if (/ngôn\s*ngữ/i.test(txt)) return 'ngôn ngữ';
    if (/tính\s*toán/i.test(txt)) return 'tính toán';
    if (/khoa\s*học/i.test(txt)) return 'khoa học';
    if (/công\s*nghệ/i.test(txt)) return 'công nghệ';
    if (/tin\s*học/i.test(txt)) return 'tin học';
    if (/thẩm\s*m[ĩỹ]/i.test(txt)) return 'thẩm mĩ';
    if (/thể\s*chất/i.test(txt)) return 'thể chất';
    if (/yêu\s*nước/i.test(txt)) return 'yêu nước';
    if (/nhân\s*ái/i.test(txt)) return 'nhân ái';
    if (/chăm\s*chỉ/i.test(txt)) return 'chăm chỉ';
    if (/trung\s*thực/i.test(txt)) return 'trung thực';
    if (/trách\s*nhiệm/i.test(txt)) return 'trách nhiệm';

    return null;
  }

  /**
   * Cập nhật dữ liệu vnEdu an toàn qua API gốc Ext.data.Store
   * @param {Array<Object>} studentDataList Mảng dữ liệu từng học sinh theo rowIndex
   * @returns {Object} Kết quả cập nhật
   */
  function fillVnEduDataSafely(studentDataList) {
    const Ext = window.Ext;
    if (typeof Ext === 'undefined') {
      console.log("[vnEdu Bridge] Trang web không sử dụng ExtJS. Dữ liệu đã được điền trực tiếp qua các thẻ input.");
      return { success: true, isCustomTable: true, reason: "Bảng điểm sử dụng input HTML tùy biến" };
    }

    if (!Array.isArray(studentDataList) || studentDataList.length === 0) {
      return { success: false, reason: "Danh sách dữ liệu học sinh rỗng" };
    }

    // 1. Tìm đúng bảng điểm đang mở và hiển thị trên màn hình
    let grids = [];
    if (Ext.ComponentQuery && typeof Ext.ComponentQuery.query === 'function') {
      try {
        grids = Ext.ComponentQuery.query('gridpanel, editorgrid, grid') || [];
      } catch (e) {}
    }
    if ((!grids || grids.length === 0) && Ext.ComponentMgr && Ext.ComponentMgr.all) {
      Ext.ComponentMgr.all.each(function (c) {
        if (c && (c.getStore || c.store) && (c.getColumnModel || c.colModel || c.columns)) {
          grids.push(c);
        }
      });
    }
    if (!grids || grids.length === 0) {
      const domGrids = Array.from(document.querySelectorAll('.x-grid3, .x-panel, .x-grid-panel, .x-grid'));
      for (let i = 0; i < domGrids.length; i++) {
        const el = domGrids[i];
        if (el.id && Ext.getCmp) {
          const c = Ext.getCmp(el.id);
          if (c && (c.getStore || c.store)) {
            grids.push(c);
          }
        }
      }
    }

    // Ưu tiên grid được đánh dấu cờ DOM từ Content Script
    let activeGrid = null;
    const markedEl = document.querySelector('[data-vnedu-active-grid="true"]');
    if (markedEl) {
      let curr = markedEl;
      while (curr && curr !== document.body) {
        if (curr.id && Ext.getCmp) {
          const cmp = Ext.getCmp(curr.id);
          if (cmp && (cmp.getStore || cmp.store)) {
            activeGrid = cmp;
            break;
          }
        }
        curr = curr.parentElement;
      }
    }

    if (!activeGrid) {
      activeGrid = grids.find(g => {
        try {
          const st = g.getStore ? g.getStore() : g.store;
          const isVis = g.isVisible ? g.isVisible() : (g.getEl ? g.getEl().isVisible() : true);
          const count = st ? (st.getCount ? st.getCount() : (st.data ? st.data.length : 0)) : 0;
          return isVis && count > 0;
        } catch (e) {
          return false;
        }
      });
    }

    if (!activeGrid) {
      console.log("[vnEdu Bridge] Bảng điểm vnEdu sử dụng các thẻ input tùy biến (không phải ExtJS GridPanel). Đã điền thành công qua DOM input.");
      return { success: true, isCustomTable: true, reason: "Bảng điểm sử dụng input HTML tùy biến" };
    }

    // 2. Đóng mọi ô đang mở dở (nếu có) để tránh kẹt trạng thái click
    try {
      const editingPlugin = activeGrid.editingPlugin || (activeGrid.plugins && activeGrid.plugins.find && activeGrid.plugins.find(p => p.isCellEditing));
      if (editingPlugin && typeof editingPlugin.cancelEdit === 'function') {
        editingPlugin.cancelEdit();
      }
      if (typeof activeGrid.stopEditing === 'function') {
        activeGrid.stopEditing(true);
      }
    } catch (e) {}

    const store = activeGrid.getStore ? activeGrid.getStore() : activeGrid.store;
    if (!store) {
      console.log("[vnEdu Bridge] Bảng không có Store ExtJS. Dữ liệu đã được điền trực tiếp vào thẻ input.");
      return { success: true, isCustomTable: true, reason: "Bảng không có Store ExtJS" };
    }

    // 3. Lấy danh sách các cột thực tế có gắn dữ liệu (dataIndex)
    let columns = [];
    const view = activeGrid.getView ? activeGrid.getView() : null;
    if (view && typeof view.getGridColumns === 'function') {
      columns = view.getGridColumns();
    } else if (activeGrid.getColumnModel) {
      const cm = activeGrid.getColumnModel();
      const count = cm.getColumnCount ? cm.getColumnCount() : (cm.columns ? cm.columns.length : 0);
      for (let i = 0; i < count; i++) {
        columns.push({
          index: i,
          text: cm.getColumnHeader ? cm.getColumnHeader(i) : (cm.columns && cm.columns[i] ? cm.columns[i].header : ''),
          header: cm.getColumnHeader ? cm.getColumnHeader(i) : (cm.columns && cm.columns[i] ? cm.columns[i].header : ''),
          dataIndex: cm.getDataIndex ? cm.getDataIndex(i) : (cm.columns && cm.columns[i] ? cm.columns[i].dataIndex : null),
          id: cm.getColumnId ? cm.getColumnId(i) : (cm.columns && cm.columns[i] ? cm.columns[i].id : null)
        });
      }
    } else if (activeGrid.columns) {
      columns = activeGrid.columns;
    }

    // In ra Console sơ đồ cột để kiểm tra tên trường (fieldName) thực tế của vnEdu
    try {
      console.log('%c[vnEdu Safe Fill] Sơ đồ các cột trên giao diện vnEdu:', 'color: #3B82F6; font-weight: bold;');
      console.table(columns.map((col, idx) => ({
        index: idx,
        text: String(col.text || col.header || '').replace(/<[^>]+>/g, '').trim(),
        dataIndex: col.dataIndex
      })));
    } catch (e) {}

    // Bảng ánh xạ từ nhãn chuẩn sang cột
    const textToCol = {};
    columns.forEach(col => {
      const rawText = String(col.text || col.header || '');
      const canonical = matchCanonicalKey(rawText);
      if (canonical && !textToCol[canonical]) {
        textToCol[canonical] = col;
      }
      const clean = normalizeText(rawText);
      if (clean && !textToCol[clean]) {
        textToCol[clean] = col;
      }
    });

    // 4. Tiến hành cập nhật dữ liệu thông qua Store Record
    if (typeof store.suspendEvents === 'function') {
      store.suspendEvents(false); // Tạm dừng vẽ lại từng ô để tăng tốc và tránh đơ giao diện
    }

    if (!store.modified) {
      store.modified = [];
    }

    let updatedRows = 0;
    let updatedCells = 0;

    try {
      const storeCount = store.getCount ? store.getCount() : (store.data ? store.data.length : 0);
      for (let rowIndex = 0; rowIndex < storeCount; rowIndex++) {
        const record = store.getAt ? store.getAt(rowIndex) : (store.data && store.data.items ? store.data.items[rowIndex] : null);
        if (!record) continue;

        const studentInput = studentDataList[rowIndex];
        if (!studentInput) continue;

        let rowModified = false;

        // Thay vì sửa DOM (td), ta dùng record.set(dataIndex, value)
        Object.keys(studentInput).forEach(colIndexOrField => {
          const newValue = studentInput[colIndexOrField];
          if (newValue === undefined || newValue === null || newValue === '') return;

          let fieldName = null;

          // Nếu truyền vào số thứ tự cột -> tự động dịch sang dataIndex chuẩn của ExtJS
          if (!isNaN(colIndexOrField) && columns[parseInt(colIndexOrField, 10)]) {
            fieldName = columns[parseInt(colIndexOrField, 10)].dataIndex;
          }

          // Nếu truyền vào tên chỉ tiêu tiếng Việt
          if (!fieldName) {
            const canonical = matchCanonicalKey(colIndexOrField);
            if (canonical && textToCol[canonical]) {
              fieldName = textToCol[canonical].dataIndex;
            } else {
              const clean = normalizeText(colIndexOrField);
              if (textToCol[clean]) {
                fieldName = textToCol[clean].dataIndex;
              }
            }
          }

          // Nếu colIndexOrField chính là tên trường dữ liệu trong record
          if (!fieldName && (record.get && record.get(colIndexOrField) !== undefined || (record.data && record.data[colIndexOrField] !== undefined))) {
            fieldName = colIndexOrField;
          }

          if (fieldName && (record.get && record.get(fieldName) !== undefined || (record.data && record.data[fieldName] !== undefined))) {
            const oldVal = record.get ? record.get(fieldName) : record.data[fieldName];
            if (oldVal !== newValue) {
              if (typeof record.set === 'function') {
                record.set(fieldName, newValue);
              } else {
                record.data[fieldName] = newValue;
              }

              // Đảm bảo cờ dirty và danh sách modified
              record.dirty = true;
              if (!record.modified) record.modified = {};
              if (record.modified[fieldName] === undefined) {
                record.modified[fieldName] = oldVal !== undefined ? oldVal : '';
              }

              rowModified = true;
              updatedCells++;
            }
          }
        });

        if (rowModified) {
          record.dirty = true;
          if (store.modified && store.modified.indexOf(record) === -1) {
            store.modified.push(record);
          }
          updatedRows++;
        }
      }
    } finally {
      if (typeof store.resumeEvents === 'function') {
        store.resumeEvents();
      }
      if (activeGrid.getView && typeof activeGrid.getView().refresh === 'function') {
        activeGrid.getView().refresh(); // Vẽ lại bảng sạch sẽ, giữ nguyên sự kiện click cho các ô
      }
    }

    // Bật nút Lưu trên thanh công cụ vnEdu nếu đang bị disable
    try {
      const topToolbar = activeGrid.getTopToolbar ? activeGrid.getTopToolbar() : null;
      if (topToolbar && topToolbar.items) {
        topToolbar.items.each(function (btn) {
          if (btn && btn.text && /lưu|ghi/i.test(btn.text)) {
            if (btn.enable) btn.enable();
            if (btn.setDisabled) btn.setDisabled(false);
          }
        });
      }

      if (Ext.ComponentMgr && Ext.ComponentMgr.all) {
        Ext.ComponentMgr.all.each(function (cmp) {
          if (cmp && cmp.isXType && cmp.isXType('button')) {
            const btnText = cmp.getText ? cmp.getText() : (cmp.text || '');
            if (/lưu|ghi/i.test(btnText)) {
              if (cmp.enable) cmp.enable();
              if (cmp.setDisabled) cmp.setDisabled(false);
            }
          }
        });
      }
    } catch (e) {}

    const modifiedCount = store.getModifiedRecords ? store.getModifiedRecords().length : (store.modified ? store.modified.length : 0);
    console.log(`%c[vnEdu Safe Fill] Hoàn tất an toàn: Cập nhật ${updatedRows} học sinh (${updatedCells} ô). Tổng Modified Records trong Store: ${modifiedCount}`, 'background: #10B981; color: white; font-weight: bold; padding: 4px;');

    return {
      success: true,
      updatedCount: updatedRows,
      updatedCells: updatedCells,
      modifiedCount: modifiedCount
    };
  }

  /**
   * Hàm điền điểm Phẩm chất - Năng lực chuẩn xác cho thẻ input vnEdu trong Main World
   */
  function fillVnEduCell(dataHang, dataCot, value, fallbackCell) {
    if (!value) return false;
    let input = null;
    if (dataHang && dataCot) {
      input = document.querySelector(`input[data-hang="${dataHang}"][data-cot="${dataCot}"]`) ||
              document.querySelector(`td[data-hang="${dataHang}"][data-cot="${dataCot}"] input`) ||
              document.querySelector(`[data-hang="${dataHang}"][data-cot="${dataCot}"] input`) ||
              document.querySelector(`td[data-hang="${dataHang}"][data-cot="${dataCot}"] textarea`);
    }
    if (!input && fallbackCell) {
      input = fallbackCell.tagName === 'INPUT' ? fallbackCell : fallbackCell.querySelector('input.txtInput, input[type="text"], input, textarea');
    }
    if (!input && dataHang && dataCot) {
      const row = document.querySelector(`tr[data-hang="${dataHang}"], [data-hang="${dataHang}"]`);
      if (row) {
        input = row.querySelector(`[data-cot="${dataCot}"] input, input[data-cot="${dataCot}"]`);
      }
    }

    if (input) {
      const upperVal = String(value).toUpperCase().trim();
      const codeChar = upperVal === 'Đ' ? 'D' : upperVal;
      const keyCode = upperVal === 'T' ? 84 : (upperVal === 'Đ' ? 68 : (upperVal === 'C' ? 67 : upperVal.charCodeAt(0)));
      const keyInit = {
        bubbles: true,
        cancelable: true,
        key: upperVal,
        code: 'Key' + codeChar,
        keyCode: keyCode,
        which: keyCode
      };

      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', keyInit));
      input.dispatchEvent(new KeyboardEvent('keypress', keyInit));

      input.value = upperVal;
      input.setAttribute('value', upperVal);
      input.defaultValue = upperVal;

      input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', keyInit));

      if (typeof input.oninput === 'function') {
        try { input.oninput(); } catch (e) {}
      }
      if (typeof input.onchange === 'function') {
        try { input.onchange(); } catch (e) {}
      }
      if (typeof input.onkeyup === 'function') {
        try { input.onkeyup({ keyCode, key: upperVal }); } catch (e) {}
      }

      input.dispatchEvent(new Event('blur', { bubbles: true }));
      input.blur();

      const td = fallbackCell || input.closest('td');
      if (td) {
        td.setAttribute('data-value', upperVal);
        td.classList.add('x-grid3-dirty-cell');
        td.classList.add('dirty');
      }
      return true;
    }
    return false;
  }

  // Đăng ký các hàm toàn cục
  window.fillVnEduCell = fillVnEduCell;
  window.fillVnEduDataSafely = fillVnEduDataSafely;
  window.__vneduFillVnEduDataSafely = fillVnEduDataSafely;
  window.__vneduApplyExtJsGridUpdates = function (payload) {
    if (payload && Array.isArray(payload.studentDataList)) {
      return fillVnEduDataSafely(payload.studentDataList);
    }
    if (payload && Array.isArray(payload.updates)) {
      const list = payload.updates.map(u => u.fields || u);
      return fillVnEduDataSafely(list);
    }
    return fillVnEduDataSafely([]);
  };

  // Lắng nghe sự kiện từ Content Script
  function onFillRequest(event) {
    if (!event || !event.detail) return;
    const { requestId, studentDataList } = event.detail;

    try {
      const result = fillVnEduDataSafely(studentDataList || []);
      const resp = new CustomEvent('VNEDU_FILL_DATA_SAFELY_RESPONSE', {
        detail: { requestId, success: true, result },
        bubbles: true
      });
      document.dispatchEvent(resp);
      window.dispatchEvent(resp);
    } catch (err) {
      console.log('[vnEdu Main Bridge]', err && err.message ? err.message : err);
      const resp = new CustomEvent('VNEDU_FILL_DATA_SAFELY_RESPONSE', {
        detail: { requestId, success: true, isCustomTable: true, error: err.message || String(err) },
        bubbles: true
      });
      document.dispatchEvent(resp);
      window.dispatchEvent(resp);
    }
  }

  document.addEventListener('VNEDU_FILL_DATA_SAFELY_REQUEST', onFillRequest);
  window.addEventListener('VNEDU_FILL_DATA_SAFELY_REQUEST', onFillRequest);

  console.log('%c[Trợ lý vnEdu] Hàm chuẩn fillVnEduDataSafely đã sẵn sàng trong MAIN world!', 'color: #10B981; font-weight: bold;');
})();
