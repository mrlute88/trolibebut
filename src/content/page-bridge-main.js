/**
 * vnEdu Page Bridge (Runs in MAIN World context)
 * Directly updates ExtJS Store models so vnEdu's "Lưu" (Save) button
 * recognizes modified records (record.dirty = true, store.modified, .x-grid3-dirty-cell)
 * and sends them to the vnEdu server API.
 * 
 * Supports both ExtJS 3.4 (vnEdu standard) and ExtJS 4+ (ComponentQuery).
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

    // 1. ƯU TIÊN 1: Tìm theo thẻ đánh dấu từ Content Script (độ chính xác 100%)
    try {
      const markedEl = document.querySelector('[data-vnedu-active-grid="true"]');
      if (markedEl) {
        let curr = markedEl;
        while (curr && curr !== document.body) {
          if (curr.id && Ext.getCmp) {
            const cmp = Ext.getCmp(curr.id);
            if (cmp && (cmp.getStore || cmp.store)) {
              return cmp;
            }
          }
          curr = curr.parentElement;
        }
      }
    } catch (e) {}

    // 2. Tìm theo ID cụ thể nếu được cung cấp
    if (gridId) {
      try {
        if (Ext.getCmp) {
          const c = Ext.getCmp(gridId);
          if (c && (c.getStore || c.store)) {
            return c;
          }
        }
        const el = document.getElementById(gridId);
        if (el) {
          let curr = el;
          while (curr && curr !== document.body) {
            if (curr.id && Ext.getCmp) {
              const cmp = Ext.getCmp(curr.id);
              if (cmp && (cmp.getStore || cmp.store)) {
                return cmp;
              }
            }
            curr = curr.parentElement;
          }
        }
      } catch (e) {}
    }

    // 3. Tìm qua Ext.ComponentQuery (ExtJS 4+)
    if (Ext.ComponentQuery && typeof Ext.ComponentQuery.query === 'function') {
      try {
        const grids = Ext.ComponentQuery.query('gridpanel, editorgrid, grid');
        if (Array.isArray(grids) && grids.length > 0) {
          const activeGrid = grids.find(g => {
            try {
              const st = g.getStore ? g.getStore() : g.store;
              const count = st ? (st.getCount ? st.getCount() : (st.data ? st.data.length : 0)) : 0;
              const isVis = g.isVisible ? g.isVisible() : true;
              return isVis && count > 0;
            } catch (e) {
              return false;
            }
          });
          if (activeGrid) {
            return activeGrid;
          }
        }
      } catch (e) {}
    }

    // 4. Tìm qua Ext.ComponentMgr (ExtJS 3.4 - chuẩn hệ thống vnEdu)
    let foundGrid = null;
    if (Ext.ComponentMgr && Ext.ComponentMgr.all) {
      Ext.ComponentMgr.all.each(function (cmp) {
        if (cmp && (cmp.getStore || cmp.store)) {
          try {
            const st = cmp.getStore ? cmp.getStore() : cmp.store;
            const count = st ? (st.getCount ? st.getCount() : (st.data ? st.data.length : 0)) : 0;
            if (count === 0) return;

            let isVis = true;
            if (cmp.isVisible) isVis = cmp.isVisible();
            else if (cmp.getEl) isVis = cmp.getEl().isVisible();
            if (!isVis) return;

            const cm = cmp.getColumnModel ? cmp.getColumnModel() : (cmp.colModel || cmp.columns);
            const colCount = cm ? (cm.getColumnCount ? cm.getColumnCount() : (cm.length || 0)) : 0;
            let hasCompetencyCol = false;

            for (let c = 0; c < colCount; c++) {
              const h = cm.getColumnHeader ? cm.getColumnHeader(c) : (cm[c] ? (cm[c].header || cm[c].text) : '');
              const cleanH = normalizeText(h);
              if (/năng\s*lực|phẩm\s*chất|tự\s*chủ|giao\s*tiếp|ngôn\s*ngữ|tính\s*toán|yêu\s*nước/i.test(cleanH)) {
                hasCompetencyCol = true;
                break;
              }
            }

            if (hasCompetencyCol) {
              foundGrid = cmp;
              return false;
            }
            if (!foundGrid) {
              foundGrid = cmp;
            }
          } catch (e) {}
        }
      });
    }

    if (foundGrid) return foundGrid;

    // 5. Tìm qua DOM các class đặc thù ExtJS
    if (Ext.getCmp) {
      const gridEls = Array.from(document.querySelectorAll('.x-grid3, .x-panel, .x-grid-panel, .x-grid'));
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
   * Cập nhật trực tiếp dữ liệu vào ExtJS Store của Grid
   */
  function applyStoreUpdates(payload) {
    const Ext = window.Ext;
    if (!Ext) {
      console.warn('[vnEdu Main Bridge] window.Ext chưa tồn tại!');
      return { success: false, reason: 'window.Ext chưa sẵn sàng trên trang vnEdu' };
    }

    const grid = findActiveGrid(payload.gridId);
    if (!grid) {
      console.warn('[vnEdu Main Bridge] Không tìm thấy ExtJS Grid component!');
      return { success: false, reason: 'Không tìm thấy ExtJS Grid component trên giao diện vnEdu' };
    }

    const store = grid.getStore ? grid.getStore() : grid.store;
    const colModel = grid.getColumnModel ? grid.getColumnModel() : (grid.colModel || grid.columns);
    const view = grid.getView ? grid.getView() : null;

    if (!store || !colModel) {
      console.warn('[vnEdu Main Bridge] Grid thiếu Store hoặc ColumnModel!');
      return { success: false, reason: 'ExtJS Grid không có Store hoặc ColumnModel' };
    }

    if (!store.modified) {
      store.modified = [];
    }

    const colCount = colModel.getColumnCount ? colModel.getColumnCount() : (colModel.length || (colModel.columns ? colModel.columns.length : 0));
    const keyToDataIndex = {};
    const colIdToDataIndex = {};
    const colIndexToDataIndex = {};

    // 1. Ánh xạ trực tiếp từ ColumnModel config
    for (let ci = 0; ci < colCount; ci++) {
      const colObj = (colModel.columns && colModel.columns[ci]) || (Array.isArray(colModel) ? colModel[ci] : (colModel.config ? colModel.config[ci] : null));
      const dIndex = colModel.getDataIndex ? colModel.getDataIndex(ci) : (colObj ? colObj.dataIndex : null);
      const header = colModel.getColumnHeader ? colModel.getColumnHeader(ci) : (colObj ? (colObj.header || colObj.text) : '');
      const colId = colModel.getColumnId ? colModel.getColumnId(ci) : (colObj ? (colObj.id || colObj.itemId) : null);

      if (!dIndex) continue;

      colIndexToDataIndex[ci] = dIndex;

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

    // 2. Sử dụng targetColumns gửi kèm từ Content Script
    if (Array.isArray(payload.targetColumns)) {
      payload.targetColumns.forEach(tc => {
        if (!tc || !tc.key) return;
        const normK = normalizeText(tc.key);

        if (!keyToDataIndex[normK]) {
          // Thử trích xuất ID từ colClass (vd: "x-grid3-td-20" -> "20")
          if (tc.colClass) {
            const numMatch = tc.colClass.match(/x-grid3-(?:td|col|hd)-([a-zA-Z0-9_\-]+)/);
            if (numMatch && colIdToDataIndex[numMatch[1]]) {
              keyToDataIndex[normK] = colIdToDataIndex[numMatch[1]];
            } else if (numMatch && colModel.getIndexById) {
              const cIdx = colModel.getIndexById(numMatch[1]);
              if (cIdx >= 0) {
                keyToDataIndex[normK] = colModel.getDataIndex(cIdx);
              }
            }
          }
          // Thử qua colIndex
          if (!keyToDataIndex[normK] && tc.index !== undefined && colModel.getDataIndex) {
            const d = colModel.getDataIndex(tc.index);
            if (d) keyToDataIndex[normK] = d;
          }
        }
      });
    }

    // 3. Nếu vẫn thiếu cột, quét tiêu đề DOM
    const sampleRec = store.getAt ? store.getAt(0) : (store.data && store.data.items ? store.data.items[0] : null);
    if (sampleRec && sampleRec.data) {
      const dataKeys = Object.keys(sampleRec.data);
      const allCanonical = [
        'tự chủ và tự học', 'giao tiếp và hợp tác', 'gqvd và sáng tạo',
        'ngôn ngữ', 'tính toán', 'khoa học', 'công nghệ', 'tin học',
        'thẩm mĩ', 'thể chất', 'yêu nước', 'nhân ái', 'chăm chỉ', 'trung thực', 'trách nhiệm'
      ];
      allCanonical.forEach(k => {
        if (!keyToDataIndex[k]) {
          if (k.includes('tự chủ')) {
            const fk = dataKeys.find(key => /tuchu|tc_th|nl_1/i.test(key));
            if (fk) keyToDataIndex[k] = fk;
          } else if (k.includes('giao tiếp')) {
            const fk = dataKeys.find(key => /giaotiep|gt_ht|nl_2/i.test(key));
            if (fk) keyToDataIndex[k] = fk;
          } else if (k.includes('gqvd')) {
            const fk = dataKeys.find(key => /gqvd|sangtao|nl_3/i.test(key));
            if (fk) keyToDataIndex[k] = fk;
          } else if (k.includes('ngôn ngữ')) {
            const fk = dataKeys.find(key => /ngonngu|nl_4/i.test(key));
            if (fk) keyToDataIndex[k] = fk;
          } else if (k.includes('tính toán')) {
            const fk = dataKeys.find(key => /tinhtoan|nl_5/i.test(key));
            if (fk) keyToDataIndex[k] = fk;
          } else if (k.includes('khoa học')) {
            const fk = dataKeys.find(key => /khoahoc|nl_6/i.test(key));
            if (fk) keyToDataIndex[k] = fk;
          } else if (k.includes('công nghệ')) {
            const fk = dataKeys.find(key => /congnghe|nl_7/i.test(key));
            if (fk) keyToDataIndex[k] = fk;
          } else if (k.includes('tin học')) {
            const fk = dataKeys.find(key => /tinhoc|nl_8/i.test(key));
            if (fk) keyToDataIndex[k] = fk;
          } else if (k.includes('thẩm mĩ')) {
            const fk = dataKeys.find(key => /thammi|tham_my|nl_9/i.test(key));
            if (fk) keyToDataIndex[k] = fk;
          } else if (k.includes('thể chất')) {
            const fk = dataKeys.find(key => /thechat|the_duc|nl_10/i.test(key));
            if (fk) keyToDataIndex[k] = fk;
          } else if (k.includes('yêu nước')) {
            const fk = dataKeys.find(key => /yeunuoc|pc_1/i.test(key));
            if (fk) keyToDataIndex[k] = fk;
          } else if (k.includes('nhân ái')) {
            const fk = dataKeys.find(key => /nhanai|pc_2/i.test(key));
            if (fk) keyToDataIndex[k] = fk;
          } else if (k.includes('chăm chỉ')) {
            const fk = dataKeys.find(key => /chamchi|pc_3/i.test(key));
            if (fk) keyToDataIndex[k] = fk;
          } else if (k.includes('trung thực')) {
            const fk = dataKeys.find(key => /trungthuc|pc_4/i.test(key));
            if (fk) keyToDataIndex[k] = fk;
          } else if (k.includes('trách nhiệm')) {
            const fk = dataKeys.find(key => /trachnhiem|pc_5/i.test(key));
            if (fk) keyToDataIndex[k] = fk;
          }
        }
      });
    }

    console.log('%c[Trợ lý vnEdu] Bảng ánh xạ cột NL-PC:', 'color: #3B82F6; font-weight: bold;', keyToDataIndex);

    const updates = payload.updates || [];
    let updatedRows = 0;
    let updatedCells = 0;

    for (let u = 0; u < updates.length; u++) {
      const item = updates[u];
      const rowIndex = item.rowIndex;
      const rec = store.getAt ? store.getAt(rowIndex) : (store.data && store.data.items ? store.data.items[rowIndex] : null);
      if (!rec) continue;

      const fields = item.fields || {};
      const byColClass = item.byColClass || {};
      const byIndex = item.byIndex || {};
      let rowModified = false;

      if (typeof rec.beginEdit === 'function') {
        rec.beginEdit();
      }

      // Cách 1: Cập nhật qua tên trường ánh xạ (keyToDataIndex)
      for (const rawKey in fields) {
        const val = fields[rawKey];
        if (!val) continue;

        const canonicalKey = normalizeText(rawKey);
        const dataIndex = keyToDataIndex[canonicalKey] ||
                          (rec.data && rec.data[canonicalKey] !== undefined ? canonicalKey : null) ||
                          (rec.data && rec.data[rawKey] !== undefined ? rawKey : null);

        if (dataIndex) {
          const oldVal = rec.get ? rec.get(dataIndex) : rec.data[dataIndex];
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

      // Cách 2: Cập nhật bổ trợ qua colClass nếu có
      for (const cls in byColClass) {
        const val = byColClass[cls];
        if (!val) continue;
        const numMatch = cls.match(/x-grid3-(?:td|col|hd)-([a-zA-Z0-9_\-]+)/);
        if (numMatch) {
          const colId = numMatch[1];
          const dIndex = colIdToDataIndex[colId] || (colModel.getIndexById ? colModel.getDataIndex(colModel.getIndexById(colId)) : null);
          if (dIndex && rec.data[dIndex] !== val) {
            const oldVal = rec.get ? rec.get(dIndex) : rec.data[dIndex];
            if (typeof rec.set === 'function') {
              rec.set(dIndex, val);
            } else {
              rec.data[dIndex] = val;
            }
            rec.dirty = true;
            if (!rec.modified) rec.modified = {};
            if (rec.modified[dIndex] === undefined) {
              rec.modified[dIndex] = (oldVal !== undefined && oldVal !== null) ? oldVal : '';
            }
            rowModified = true;
          }
        }
      }

      // Cách 3: Cập nhật bổ trợ qua byIndex nếu chưa được gán
      for (const idx in byIndex) {
        const val = byIndex[idx];
        if (!val) continue;
        const dIndex = colModel.getDataIndex ? colModel.getDataIndex(parseInt(idx, 10)) : null;
        if (dIndex && rec.data[dIndex] !== val) {
          const oldVal = rec.get ? rec.get(dIndex) : rec.data[dIndex];
          if (typeof rec.set === 'function') {
            rec.set(dIndex, val);
          } else {
            rec.data[dIndex] = val;
          }
          rec.dirty = true;
          if (!rec.modified) rec.modified = {};
          if (rec.modified[dIndex] === undefined) {
            rec.modified[dIndex] = (oldVal !== undefined && oldVal !== null) ? oldVal : '';
          }
          rowModified = true;
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

    // Refresh view và gắn cờ đỏ tam giác (.x-grid3-dirty-cell)
    try {
      if (view && view.refresh) {
        view.refresh(false);
      }
    } catch (e) {}

    // Bật nút "Lưu" / "Ghi" trên vnEdu
    try {
      const topToolbar = grid.getTopToolbar ? grid.getTopToolbar() : null;
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

    const modifiedRecords = store.getModifiedRecords ? store.getModifiedRecords() : (store.modified || []);
    const modifiedCount = modifiedRecords.length;

    console.log(`%c[vnEdu Main Bridge] ĐÃ CẬP NHẬT EXTJS STORE THÀNH CÔNG: ${updatedRows} dòng, ${updatedCells} ô. Tổng records modified trong Store: ${modifiedCount}`, 'background: #10B981; color: white; font-weight: bold; padding: 4px;');
    if (sampleRec) {
      console.log('[vnEdu Main Bridge] Record[0].data sau cập nhật:', sampleRec.data);
    }

    return {
      success: true,
      updatedRows,
      updatedCells,
      modifiedCount,
      mappedFieldsCount: Object.keys(keyToDataIndex).length
    };
  }

  // Bộ lắng nghe nhận yêu cầu từ Content Script (lắng nghe cả trên document và window)
  function handleUpdateRequest(event) {
    if (!event || !event.detail) return;
    const { requestId, payload } = event.detail;

    try {
      const result = applyStoreUpdates(payload || {});
      const respEvent = new CustomEvent('VNEDU_EXTJS_GRID_UPDATE_RESPONSE', {
        detail: { requestId, success: true, result },
        bubbles: true
      });
      document.dispatchEvent(respEvent);
      window.dispatchEvent(respEvent);
    } catch (err) {
      console.error('[vnEdu Main Bridge] Lỗi applyStoreUpdates:', err);
      const respEvent = new CustomEvent('VNEDU_EXTJS_GRID_UPDATE_RESPONSE', {
        detail: { requestId, success: false, error: err.message || String(err) },
        bubbles: true
      });
      document.dispatchEvent(respEvent);
      window.dispatchEvent(respEvent);
    }
  }

  document.addEventListener('VNEDU_EXTJS_GRID_UPDATE_REQUEST', handleUpdateRequest);
  window.addEventListener('VNEDU_EXTJS_GRID_UPDATE_REQUEST', handleUpdateRequest);

  // Đăng ký toàn cục để có thể gọi trực tiếp bất kỳ lúc nào
  window.__vneduApplyExtJsGridUpdates = applyStoreUpdates;
  window.__vneduFindActiveGrid = findActiveGrid;
  window.vnEduDebugGrid = function () {
    const grid = findActiveGrid();
    if (!grid) {
      console.warn('Không tìm thấy Grid nào trên màn hình vnEdu');
      return null;
    }
    const store = grid.getStore ? grid.getStore() : grid.store;
    console.log('Grid:', grid);
    console.log('Store:', store);
    console.log('Total Records:', store ? (store.getCount ? store.getCount() : store.data.length) : 0);
    console.log('Modified Records:', store && store.getModifiedRecords ? store.getModifiedRecords() : (store ? store.modified : []));
    if (store && store.getAt && store.getAt(0)) {
      console.log('Record[0].data:', store.getAt(0).data);
    }
    return { grid, store };
  };

  window.__VNEDU_PAGE_BRIDGE_MAIN_READY__ = true;
  console.log('%c[Trợ lý vnEdu] Cầu nối Main World ExtJS Bridge đã sẵn sàng!', 'color: #10B981; font-weight: bold;');
})();
