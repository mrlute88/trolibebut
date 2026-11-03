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
   * Hỗ trợ cả ExtJS 3 (ComponentMgr) và ExtJS 4+ (ComponentQuery)
   */
  function findActiveGrid(gridId) {
    const Ext = window.Ext;
    if (!Ext) return null;

    // 1. Tìm theo ID cụ thể nếu được cung cấp
    if (gridId) {
      try {
        if (Ext.getCmp) {
          const c = Ext.getCmp(gridId);
          if (c && (c.getStore || c.store)) {
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
              if (cmp && (cmp.getStore || cmp.store)) {
                return cmp;
              }
            }
            curr = curr.parentElement;
          }
        }
      } catch (e) {}
    }

    // 2. Tìm qua Ext.ComponentQuery (ExtJS 4+) như gợi ý kỹ thuật
    if (Ext.ComponentQuery && typeof Ext.ComponentQuery.query === 'function') {
      try {
        const grids = Ext.ComponentQuery.query('gridpanel, editorgrid, grid');
        if (Array.isArray(grids) && grids.length > 0) {
          // Lọc ra grid đang hiển thị và có dữ liệu học sinh
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

    // 3. Tìm qua Ext.ComponentMgr (ExtJS 3.4 - chuẩn hệ thống vnEdu)
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

            // Kiểm tra grid có chứa cột Năng lực / Phẩm chất
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
              return false; // Dừng duyệt khi tìm thấy đúng bảng tổng hợp NL-PC
            }
            if (!foundGrid) {
              foundGrid = cmp;
            }
          } catch (e) {}
        }
      });
    }

    if (foundGrid) return foundGrid;

    // 4. Tìm qua DOM các class đặc thù ExtJS
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
   * Cập nhật trực tiếp dữ liệu vào ExtJS Store của Grid (Solution 1)
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
    const colModel = grid.getColumnModel ? grid.getColumnModel() : (grid.colModel || grid.columns);

    if (!store || !colModel) {
      return { success: false, reason: 'ExtJS Grid không có Store hoặc ColumnModel' };
    }

    // Đảm bảo mảng modified của store tồn tại
    if (!store.modified) {
      store.modified = [];
    }

    // Lấy record mẫu đầu tiên để kiểm tra cấu trúc data
    const sampleRec = store.getAt ? store.getAt(0) : (store.data && store.data.items ? store.data.items[0] : null);
    if (sampleRec && sampleRec.data) {
      console.log('%c[Trợ lý vnEdu] ExtJS Store sample record[0].data:', 'color: #10B981; font-weight: bold;', sampleRec.data);
    }

    const colCount = colModel.getColumnCount ? colModel.getColumnCount() : (colModel.length || (colModel.columns ? colModel.columns.length : 0));
    const keyToDataIndex = {};
    const colIdToDataIndex = {};

    // 1. Ánh xạ trực tiếp từ ColumnModel config (kiểm tra cả .header và .text)
    for (let ci = 0; ci < colCount; ci++) {
      const colObj = (colModel.columns && colModel.columns[ci]) || (Array.isArray(colModel) ? colModel[ci] : (colModel.config ? colModel.config[ci] : null));
      const dIndex = colModel.getDataIndex ? colModel.getDataIndex(ci) : (colObj ? colObj.dataIndex : null);
      const header = colModel.getColumnHeader ? colModel.getColumnHeader(ci) : (colObj ? (colObj.header || colObj.text) : '');
      const colId = colModel.getColumnId ? colModel.getColumnId(ci) : (colObj ? (colObj.id || colObj.itemId) : null);

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

    // 2. Nếu colModel.getColumnHeader chưa có đầy đủ (do nhóm cột nhiều tầng), quét tiêu đề DOM của Grid
    const missingKeys = [
      'tự chủ và tự học', 'giao tiếp và hợp tác', 'gqvd và sáng tạo',
      'ngôn ngữ', 'tính toán', 'khoa học', 'công nghệ', 'tin học',
      'thẩm mĩ', 'thể chất', 'yêu nước', 'nhân ái', 'chăm chỉ', 'trung thực', 'trách nhiệm'
    ].filter(k => !keyToDataIndex[k]);

    if (missingKeys.length > 0) {
      const gridEl = grid.getEl ? grid.getEl().dom : document.getElementById(grid.id);
      const hdElements = Array.from((gridEl || document).querySelectorAll('.x-grid3-header .x-grid3-hd, .x-grid3-hd-inner, th, [role="columnheader"]'));

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

    // 3. Sử dụng cấu trúc targetColumns gửi kèm từ content script nếu có
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

    // 4. Nếu vẫn còn thiếu, đối chiếu trực tiếp các trường trong sampleRec.data
    if (sampleRec && sampleRec.data) {
      const dataKeys = Object.keys(sampleRec.data);
      const remainingMissing = missingKeys.filter(k => !keyToDataIndex[k]);
      remainingMissing.forEach(k => {
        // Tìm key tương ứng trong record.data
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
        } else if (k.includes('yêu nước')) {
          const fk = dataKeys.find(key => /yeunuoc|pc_1/i.test(key));
          if (fk) keyToDataIndex[k] = fk;
        }
      });
    }

    console.log('%c[Trợ lý vnEdu] Bảng ánh xạ các cột NL-PC (Key -> columnFieldName):', 'color: #3B82F6; font-weight: bold;', keyToDataIndex);

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

            // Đảm bảo record được đánh dấu dirty
            rec.dirty = true;
            if (!rec.modified) rec.modified = {};
            if (rec.modified[dataIndex] === undefined) {
              rec.modified[dataIndex] = (oldVal !== undefined && oldVal !== null) ? oldVal : '';
            }

            rowModified = true;
            updatedCells++;

            // Kích hoạt sự kiện afteredit trên Grid để vnEdu nhận diện
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

    // Refresh view để ExtJS hiển thị ngay cờ đỏ dirty mark (.x-grid3-dirty-cell)
    try {
      if (grid.getView && grid.getView().refresh) {
        grid.getView().refresh(false);
      }
    } catch (e) {}

    // Bật nút "Lưu" / "Ghi" trên vnEdu (nếu đang bị disable)
    try {
      // 1. Kiểm tra trên toolbar của grid
      const topToolbar = grid.getTopToolbar ? grid.getTopToolbar() : null;
      if (topToolbar && topToolbar.items) {
        topToolbar.items.each(function (btn) {
          if (btn && btn.text && /lưu|ghi/i.test(btn.text)) {
            if (btn.enable) btn.enable();
            if (btn.setDisabled) btn.setDisabled(false);
          }
        });
      }

      // 2. Kiểm tra trên toàn bộ Ext.ComponentMgr
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

    console.log(`%c[vnEdu Main Bridge] Hoàn tất cập nhật: ${updatedRows} dòng, ${updatedCells} ô. Tổng records modified trong Store: ${modifiedCount}`, 'color: #10B981; font-weight: bold;');

    return {
      success: true,
      updatedRows,
      updatedCells,
      modifiedCount,
      mappedFieldsCount: Object.keys(keyToDataIndex).length
    };
  }

  // Lắng nghe yêu cầu cập nhật từ Content Script qua CustomEvent
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

  // Đăng ký toàn cục để người dùng / dev có thể gọi trực tiếp từ F12 Console
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
    console.log('Total Records:', store ? store.getCount() : 0);
    console.log('Modified Records:', store && store.getModifiedRecords ? store.getModifiedRecords() : []);
    if (store && store.getAt && store.getAt(0)) {
      console.log('Record[0].data:', store.getAt(0).data);
    }
    return { grid, store };
  };

  window.__VNEDU_PAGE_BRIDGE_MAIN_READY__ = true;
  console.log('%c[Trợ lý vnEdu] Cầu nối Main World ExtJS Bridge đã sẵn sàng!', 'color: #10B981; font-weight: bold;');
})();
