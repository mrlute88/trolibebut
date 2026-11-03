/**
 * vnEdu Page Bridge (Runs in MAIN World context)
 * Directly updates ExtJS Store models so vnEdu's "Lưu" (Save) button
 * recognizes modified records (record.dirty = true, store.modified, .x-grid3-dirty-cell)
 * and sends them to the vnEdu server API.
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
   * Tìm ExtJS Grid component đang hiển thị trên vnEdu
   */
  function findActiveGrid(gridId) {
    const Ext = window.Ext;
    if (!Ext) return null;

    // 1. Tìm theo ID cụ thể nếu được cung cấp
    if (gridId) {
      try {
        if (Ext.getCmp) {
          const c = Ext.getCmp(gridId);
          if (c && (c.getStore || c.store) && (c.getColumnModel || c.colModel)) {
            return c;
          }
        }
        // Thử tìm phần tử DOM rồi leo lên component cha
        const el = document.getElementById(gridId);
        if (el) {
          let curr = el;
          while (curr && curr !== document.body) {
            if (curr.id && Ext.getCmp) {
              const cmp = Ext.getCmp(curr.id);
              if (cmp && (cmp.getStore || cmp.store) && (cmp.getColumnModel || cmp.colModel)) {
                return cmp;
              }
            }
            curr = curr.parentElement;
          }
        }
      } catch (e) {}
    }

    // 2. Tìm qua Ext.ComponentMgr duyệt tất cả components
    let foundGrid = null;
    if (Ext.ComponentMgr && Ext.ComponentMgr.all) {
      Ext.ComponentMgr.all.each(function (cmp) {
        if (cmp && (cmp.getStore || cmp.store) && (cmp.getColumnModel || cmp.colModel)) {
          try {
            // Kiểm tra grid có cột Năng lực / Phẩm chất
            const cm = cmp.getColumnModel ? cmp.getColumnModel() : cmp.colModel;
            const colCount = cm.getColumnCount ? cm.getColumnCount() : (cm.columns ? cm.columns.length : 0);
            let hasCompetencyCol = false;
            for (let c = 0; c < colCount; c++) {
              const h = cm.getColumnHeader ? cm.getColumnHeader(c) : (cm.columns && cm.columns[c] ? cm.columns[c].header : '');
              const cleanH = normalizeText(h);
              if (/năng\s*lực|phẩm\s*chất|tự\s*chủ|giao\s*tiếp|ngôn\s*ngữ|tính\s*toán|yêu\s*nước/i.test(cleanH)) {
                hasCompetencyCol = true;
                break;
              }
            }

            let isVis = true;
            if (cmp.isVisible) isVis = cmp.isVisible();
            else if (cmp.getEl) isVis = cmp.getEl().isVisible();

            if (isVis) {
              if (hasCompetencyCol) {
                foundGrid = cmp;
                return false; // Dừng duyệt khi tìm thấy đúng bảng tổng hợp NL-PC
              }
              if (!foundGrid) {
                foundGrid = cmp;
              }
            }
          } catch (e) {}
        }
      });
    }

    if (foundGrid) return foundGrid;

    // 3. Tìm qua DOM các class đặc thù ExtJS
    if (Ext.getCmp) {
      const gridEls = Array.from(document.querySelectorAll('.x-grid3, .x-panel, .x-grid-panel'));
      for (let i = 0; i < gridEls.length; i++) {
        const el = gridEls[i];
        if (el.id) {
          try {
            const cmp = Ext.getCmp(el.id);
            if (cmp && (cmp.getStore || cmp.store)) {
              return cmp;
            }
          } catch (e) {}
        }
      }
    }

    return null;
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
   * Bật các nút "Lưu" / "Ghi" trên vnEdu
   */
  function enableSaveButtons(grid) {
    const Ext = window.Ext;
    if (!Ext) return;

    try {
      if (grid && grid.getTopToolbar) {
        const topToolbar = grid.getTopToolbar();
        if (topToolbar && topToolbar.items) {
          topToolbar.items.each(function (btn) {
            if (btn && btn.text && /lưu|ghi/i.test(btn.text)) {
              if (btn.enable) btn.enable();
              if (btn.setDisabled) btn.setDisabled(false);
            }
          });
        }
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
  }

  /**
   * CẬP NHẬT TỪNG Ô ĐƠN LẺ TRONG STORE
   * Hỗ trợ chế độ nhập từng ô mỗi 1 giây theo đúng yêu cầu
   */
  function applySingleCellUpdate(payload) {
    const Ext = window.Ext;
    if (!Ext) return { success: false, reason: 'window.Ext chưa sẵn sàng' };

    const grid = findActiveGrid(payload.gridId);
    if (!grid) return { success: false, reason: 'Không tìm thấy Grid' };

    const store = grid.getStore ? grid.getStore() : grid.store;
    const colModel = grid.getColumnModel ? grid.getColumnModel() : grid.colModel;
    if (!store || !colModel) return { success: false };

    const rowIndex = payload.rowIndex;
    const rec = store.getAt ? store.getAt(rowIndex) : (store.data && store.data.items ? store.data.items[rowIndex] : null);
    if (!rec) return { success: false, reason: 'Không tìm thấy record dòng ' + rowIndex };

    const normKey = normalizeText(payload.colKey);
    let dataIndex = null;
    let targetColIdx = -1;

    const colCount = colModel.getColumnCount ? colModel.getColumnCount() : (colModel.columns ? colModel.columns.length : 0);
    for (let ci = 0; ci < colCount; ci++) {
      const dIndex = colModel.getDataIndex ? colModel.getDataIndex(ci) : (colModel.columns && colModel.columns[ci] ? colModel.columns[ci].dataIndex : null);
      const header = colModel.getColumnHeader ? colModel.getColumnHeader(ci) : (colModel.columns && colModel.columns[ci] ? colModel.columns[ci].header : '');
      const colId = colModel.getColumnId ? colModel.getColumnId(ci) : (colModel.columns && colModel.columns[ci] ? colModel.columns[ci].id : null);

      if (matchCanonicalKey(header) === normKey) {
        dataIndex = dIndex;
        targetColIdx = ci;
        break;
      }
      if (payload.colClass && colId && payload.colClass.includes(String(colId))) {
        dataIndex = dIndex;
        targetColIdx = ci;
        break;
      }
      if (payload.colIndex !== undefined && ci === payload.colIndex) {
        dataIndex = dIndex;
        targetColIdx = ci;
      }
    }

    if (!dataIndex) {
      if (rec.data && rec.data[normKey] !== undefined) dataIndex = normKey;
      else if (rec.data && rec.data[payload.colKey] !== undefined) dataIndex = payload.colKey;
    }

    if (!dataIndex) return { success: false, reason: 'Không tìm thấy dataIndex cho ' + payload.colKey };

    const val = payload.value;
    const oldVal = rec.get ? rec.get(dataIndex) : rec.data[dataIndex];

    // 1. Thử dùng startEditing của EditorGridPanel để kích hoạt toàn bộ cơ chế của vnEdu
    if (targetColIdx >= 0 && typeof grid.startEditing === 'function') {
      try {
        grid.startEditing(rowIndex, targetColIdx);
        const editor = grid.activeEditor;
        if (editor) {
          if (editor.field && typeof editor.field.setValue === 'function') {
            editor.field.setValue(val);
          } else if (typeof editor.setValue === 'function') {
            editor.setValue(val);
          }
          if (typeof editor.completeEdit === 'function') {
            editor.completeEdit();
          }
        }
      } catch (e) {}
    }

    // 2. Đảm bảo cập nhật trực tiếp vào Record
    if (typeof rec.beginEdit === 'function') rec.beginEdit();
    if (typeof rec.set === 'function') {
      rec.set(dataIndex, val);
    } else {
      rec.data[dataIndex] = val;
    }
    rec.dirty = true;
    if (!rec.modified) rec.modified = {};
    if (rec.modified[dataIndex] === undefined) {
      rec.modified[dataIndex] = (oldVal !== undefined && oldVal !== null) ? oldVal : '';
    }
    if (typeof rec.endEdit === 'function') rec.endEdit();

    if (!store.modified) store.modified = [];
    if (store.modified.indexOf(rec) === -1) {
      store.modified.push(rec);
    }

    // Kích hoạt sự kiện update và afteredit
    try {
      if (store.fireEvent && Ext.data && Ext.data.Record) {
        store.fireEvent('update', store, rec, Ext.data.Record.EDIT);
      }
      if (grid.fireEvent) {
        grid.fireEvent('afteredit', {
          grid: grid,
          record: rec,
          field: dataIndex,
          value: val,
          originalValue: oldVal,
          row: rowIndex,
          column: targetColIdx
        });
      }
    } catch (e) {}

    // Bật nút Lưu
    enableSaveButtons(grid);

    return {
      success: true,
      rowIndex: rowIndex,
      dataIndex: dataIndex,
      value: val,
      dirtyCount: store.modified.length
    };
  }

  /**
   * Cập nhật toàn bộ mảng thay đổi vào ExtJS Store của Grid (Đồng bộ hàng loạt / chốt sổ)
   */
  function applyStoreUpdates(payload) {
    const Ext = window.Ext;
    if (!Ext) {
      return { success: false, reason: 'window.Ext chưa sẵn sàng trên trang vnEdu' };
    }

    const grid = findActiveGrid(payload.gridId);
    if (!grid) {
      return { success: false, reason: 'Không tìm thấy ExtJS Grid component trên giao diện vnEdu' };
    }

    const store = grid.getStore ? grid.getStore() : grid.store;
    const colModel = grid.getColumnModel ? grid.getColumnModel() : grid.colModel;

    if (!store || !colModel) {
      return { success: false, reason: 'ExtJS Grid không có Store hoặc ColumnModel' };
    }

    if (!store.modified) {
      store.modified = [];
    }

    const colCount = colModel.getColumnCount ? colModel.getColumnCount() : (colModel.columns ? colModel.columns.length : 0);
    const keyToDataIndex = {};
    const colIdToDataIndex = {};

    for (let ci = 0; ci < colCount; ci++) {
      const dIndex = colModel.getDataIndex ? colModel.getDataIndex(ci) : (colModel.columns && colModel.columns[ci] ? colModel.columns[ci].dataIndex : null);
      const header = colModel.getColumnHeader ? colModel.getColumnHeader(ci) : (colModel.columns && colModel.columns[ci] ? colModel.columns[ci].header : '');
      const colId = colModel.getColumnId ? colModel.getColumnId(ci) : (colModel.columns && colModel.columns[ci] ? colModel.columns[ci].id : null);

      if (!dIndex) continue;

      if (colId) {
        colIdToDataIndex[String(colId)] = dIndex;
        const numId = String(colId).replace(/^.*(?:col|td|hd)-/, '');
        if (numId) colIdToDataIndex[numId] = dIndex;
      }

      const matchedKey = matchCanonicalKey(header);
      if (matchedKey && !keyToDataIndex[matchedKey]) {
        keyToDataIndex[matchedKey] = dIndex;
      }
    }

    // Nếu colModel.getColumnHeader chưa có đầy đủ (do vnEdu nhóm cột nhiều tầng), quét tiêu đề DOM
    const missingKeys = [
      'tự chủ và tự học', 'giao tiếp và hợp tác', 'gqvd và sáng tạo',
      'ngôn ngữ', 'tính toán', 'khoa học', 'công nghệ', 'tin học',
      'thẩm mĩ', 'thể chất', 'yêu nước', 'nhân ái', 'chăm chỉ', 'trung thực', 'trách nhiệm'
    ].filter(k => !keyToDataIndex[k]);

    if (missingKeys.length > 0) {
      const gridEl = grid.getEl ? grid.getEl().dom : document.getElementById(grid.id);
      const hdElements = Array.from((gridEl || document).querySelectorAll('.x-grid3-header .x-grid3-hd, .x-grid3-hd-inner'));

      hdElements.forEach(hd => {
        const text = hd.textContent || '';
        const matched = matchCanonicalKey(text);
        if (matched && !keyToDataIndex[matched]) {
          const cls = (hd.className || '') + ' ' + (hd.parentElement ? hd.parentElement.className : '');
          const matchCls = cls.match(/x-grid3-(?:hd|td|col)-([a-zA-Z0-9_-]+)/);
          if (matchCls) {
            const rawColId = matchCls[1];
            if (colIdToDataIndex[rawColId]) {
              keyToDataIndex[matched] = colIdToDataIndex[rawColId];
            } else if (colModel.getIndexById) {
              const cIdx = colModel.getIndexById(rawColId);
              if (cIdx >= 0) {
                keyToDataIndex[matched] = colModel.getDataIndex(cIdx);
              }
            }
          }
        }
      });
    }

    if (Array.isArray(payload.targetColumns)) {
      payload.targetColumns.forEach(tc => {
        if (!tc || !tc.key) return;
        const normK = normalizeText(tc.key);

        if (!keyToDataIndex[normK]) {
          if (tc.colClass) {
            const numMatch = tc.colClass.match(/x-grid3-(?:td|col|hd)-([a-zA-Z0-9_-]+)/);
            if (numMatch && colIdToDataIndex[numMatch[1]]) {
              keyToDataIndex[normK] = colIdToDataIndex[numMatch[1]];
            }
          }
          if (!keyToDataIndex[normK] && tc.index !== undefined && colModel.getDataIndex) {
            const d = colModel.getDataIndex(tc.index);
            if (d) keyToDataIndex[normK] = d;
          }
        }
      });
    }

    const updates = payload.updates || [];
    let updatedRows = 0;
    let updatedCells = 0;

    for (let u = 0; u < updates.length; u++) {
      const item = updates[u];
      const rowIndex = item.rowIndex;
      const rec = store.getAt ? store.getAt(rowIndex) : (store.data && store.data.items ? store.data.items[rowIndex] : null);
      if (!rec) continue;

      const fields = item.fields || {};
      let rowModified = false;

      if (typeof rec.beginEdit === 'function') {
        rec.beginEdit();
      }

      for (const rawKey in fields) {
        const val = fields[rawKey];
        if (!val) continue;

        const canonicalKey = normalizeText(rawKey);
        const dataIndex = keyToDataIndex[canonicalKey] ||
                          (rec.data && rec.data[canonicalKey] !== undefined ? canonicalKey : null) ||
                          (rec.data && rec.data[rawKey] !== undefined ? rawKey : null);

        if (dataIndex) {
          const oldVal = rec.get ? rec.get(dataIndex) : rec.data[dataIndex];
          if (oldVal !== val) {
            if (typeof rec.set === 'function') {
              rec.set(dataIndex, val);
            } else {
              rec.data[dataIndex] = val;
            }

            rec.dirty = true;
            if (!rec.modified) rec.modified = {};
            if (rec.modified[dataIndex] === undefined) {
              rec.modified[dataIndex] = (oldVal !== undefined && oldVal !== null) ? oldVal : '';
            }

            rowModified = true;
            updatedCells++;

            try {
              if (grid.fireEvent) {
                grid.fireEvent('afteredit', {
                  grid: grid,
                  record: rec,
                  field: dataIndex,
                  value: val,
                  originalValue: oldVal,
                  row: rowIndex
                });
              }
            } catch (e) {}
          }
        }
      }

      if (typeof rec.endEdit === 'function') {
        rec.endEdit();
      }

      if (rowModified) {
        rec.dirty = true;
        if (store.modified && store.modified.indexOf(rec) === -1) {
          store.modified.push(rec);
        }
        try {
          if (store.fireEvent && Ext.data && Ext.data.Record) {
            store.fireEvent('update', store, rec, Ext.data.Record.EDIT);
          }
        } catch (e) {}
        updatedRows++;
      }
    }

    // Refresh view để ExtJS hiển thị cờ đỏ dirty mark
    try {
      if (grid.getView && grid.getView().refresh) {
        grid.getView().refresh(false);
      }
    } catch (e) {}

    // Bật nút Lưu
    enableSaveButtons(grid);

    const modifiedRecords = store.getModifiedRecords ? store.getModifiedRecords() : (store.modified || []);
    const modifiedCount = modifiedRecords.length;

    console.log(`[vnEdu Main Bridge] Hoàn tất đồng bộ: ${updatedRows} dòng, ${updatedCells} ô. Tổng records modified trong Store: ${modifiedCount}`);

    return {
      success: true,
      updatedRows,
      updatedCells,
      modifiedCount,
      mappedFieldsCount: Object.keys(keyToDataIndex).length
    };
  }

  // 1. Lắng nghe cập nhật hàng loạt từ Content Script
  window.addEventListener('VNEDU_EXTJS_GRID_UPDATE_REQUEST', function (event) {
    if (!event || !event.detail) return;
    const { requestId, payload } = event.detail;

    try {
      const result = applyStoreUpdates(payload || {});
      window.dispatchEvent(new CustomEvent('VNEDU_EXTJS_GRID_UPDATE_RESPONSE', {
        detail: { requestId, success: true, result }
      }));
    } catch (err) {
      console.error('[vnEdu Main Bridge] Lỗi applyStoreUpdates:', err);
      window.dispatchEvent(new CustomEvent('VNEDU_EXTJS_GRID_UPDATE_RESPONSE', {
        detail: { requestId, success: false, error: err.message || String(err) }
      }));
    }
  });

  // 2. Lắng nghe cập nhật từng ô đơn lẻ (chế độ nhập chậm 1 giây / ô)
  window.addEventListener('VNEDU_EXTJS_GRID_CELL_UPDATE_REQUEST', function (event) {
    if (!event || !event.detail) return;
    const { payload } = event.detail;

    try {
      applySingleCellUpdate(payload || {});
    } catch (err) {
      console.warn('[vnEdu Main Bridge] Lỗi applySingleCellUpdate:', err);
    }
  });

  // Đăng ký toàn cục để có thể gọi trực tiếp
  window.__vneduApplyExtJsGridUpdates = applyStoreUpdates;
  window.__vneduApplyExtJsSingleCellUpdate = applySingleCellUpdate;
  window.__VNEDU_PAGE_BRIDGE_MAIN_READY__ = true;
})();
