/**
 * Form / Modal vnEdu Adapter (VNEDU_ADAPTER_FORM)
 * Chuyên trách xử lý:
 * 1. Cửa sổ pop-up "Phẩm chất - Năng lực ghi học bạ" (ExtJS Window trên vnEdu)
 * 2. Cửa sổ nhập nhận xét chi tiết từng học sinh (Nhập NL-PC)
 * 3. Các biểu mẫu đánh giá học sinh dạng form / modal
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./vnedu-adapter'),
      require('../utils/vietnamese-name'),
      require('../utils/confidence'),
      require('../utils/dom-utils'),
      require('../utils/logger')
    );
  } else {
    root.VnEduFormAdapter = factory(
      root.VnEduBaseAdapter,
      root.VietnameseNameDetector,
      root.VnEduConfidence,
      root.VnEduDOMUtils,
      root.VnEduLogger
    );
  }
})(typeof self !== 'undefined' ? self : this, function (
  BaseAdapterModule,
  VietnameseNameDetector,
  ConfidenceModule,
  DOMUtils,
  Logger
) {
  const { VnEduBaseAdapter, registerAdapter } = BaseAdapterModule;

  class VnEduFormAdapter extends VnEduBaseAdapter {
    constructor(options = {}) {
      super(options);
      this.name = 'VNEDU_ADAPTER_FORM';
      this.activeWindow = null;
      this.isCompetencyModal = false;
      this.detectedPeriod = 'GK1';
    }

    /**
     * Kiểm tra xem trên trang có cửa sổ popup/modal ExtJS "Phẩm chất - Năng lực ghi học bạ" đang mở không
     */
    canHandle() {
      // 1. Quét tìm cửa sổ ExtJS (.x-window) đang hiển thị ở foreground
      const allWindows = Array.from(document.querySelectorAll('.x-window, .modal-dialog, .modal'));
      for (const win of allWindows) {
        const style = window.getComputedStyle(win);
        if (style.display === 'none' || style.visibility === 'hidden' || win.offsetHeight < 80) {
          continue;
        }

        const titleText = (win.querySelector('.x-window-header-text, .x-panel-header-text, .x-window-header, .modal-title, h1, h2, h3')?.textContent || win.textContent || '').toLowerCase();

        // NẾU LÀ CỬA SỔ SỔ NHẬN XÉT, SỔ ĐIỂM, SỔ THEO DÕI... (BẢNG ĐIỂM CỦA CẢ LỚP):
        // Bắt buộc BỎ QUA để VnEduGridAdapter hoặc VnEduTableAdapter xử lý từng học sinh trong bảng!
        if (/sổ\s*nhận\s*xét|sổ\s*điểm|sổ\s*theo\s*dõi|bảng\s*điểm|sổ\s*chi\s*tiết|đánh\s*giá\s*môn\s*học/i.test(titleText)) {
          continue;
        }

        // Nếu trong cửa sổ là một bảng danh sách nhiều học sinh (có cột STT, Họ và tên và nhiều hàng dữ liệu)
        const hasStudentTableGrid = win.querySelectorAll('.x-grid3-row, tbody tr, tr.x-grid-row').length >= 3 &&
          win.querySelector('.x-grid3-header, thead, th');
        if (hasStudentTableGrid && !/phẩm\s*chất|năng\s*lực|ghi\s*học\s*bạ/i.test(titleText)) {
          continue;
        }

        const hasTextareas = win.querySelectorAll('textarea').length > 0;

        // Nhận diện cửa sổ Phẩm chất - Năng lực ghi học bạ
        const isCompetency = (/phẩm\s*chất/i.test(titleText) && /năng\s*lực/i.test(titleText)) ||
          /ghi\s*học\s*bạ|nhập\s*nl[\-\s]*pc/i.test(titleText);

        // FormAdapter CHỈ xử lý khi đúng là cửa sổ Phẩm chất - Năng lực ghi học bạ
        if (hasTextareas && isCompetency) {
          this.activeWindow = win;
          this.isCompetencyModal = true;
          return true;
        }
      }

      this.activeWindow = null;
      this.isCompetencyModal = false;
      return false;
    }

    detectPage() {
      if (this.canHandle()) {
        return {
          type: 'COMMENT_ENTRY',
          isAssessmentPage: true,
          confidence: 98,
          isModal: true
        };
      }
      return { type: 'UNKNOWN', isAssessmentPage: false, confidence: 20 };
    }

    detectClass() {
      const container = this.activeWindow || document.body;
      let detectedClass = '';
      let detectedGrade = '';
      let detectedSemester = '1';

      // 1. Quét nhãn và ô input trên thanh công cụ của modal hoặc trang
      const labels = Array.from(container.querySelectorAll('label, .x-form-item-label, span, td, div'));
      for (const lbl of labels) {
        const txt = (lbl.textContent || '').trim().toLowerCase();
        if (/^lớp\s*[:\-]?$/i.test(txt) || /^chọn\s*lớp\s*[:\-]?$/i.test(txt)) {
          const nextInp = lbl.parentElement?.querySelector('input, select') || lbl.nextElementSibling?.querySelector?.('input, select') || lbl.nextElementSibling;
          const val = (nextInp?.value || nextInp?.textContent || '').trim();
          if (val && /^(?:1[0-2]|[1-9])[A-Za-z0-9_\-\/\.\s]+$/i.test(val)) {
            detectedClass = val;
          }
        }
        if (/^khối\s*[:\-]?$/i.test(txt) || /^chọn\s*khối\s*[:\-]?$/i.test(txt)) {
          const nextInp = lbl.parentElement?.querySelector('input, select') || lbl.nextElementSibling?.querySelector?.('input, select') || lbl.nextElementSibling;
          const val = (nextInp?.value || nextInp?.textContent || '').trim();
          const match = val.match(/\b(1[0-2]|[1-9])\b/) || val.match(/(1[0-2]|[1-9])/);
          if (match) detectedGrade = match[1];
        }
        if (/^học\s*k[ỳìyi]\s*[:\-]?$/i.test(txt)) {
          const nextInp = lbl.parentElement?.querySelector('input, select') || lbl.nextElementSibling?.querySelector?.('input, select') || lbl.nextElementSibling;
          const val = (nextInp?.value || nextInp?.textContent || '').trim();
          if (/2|II/i.test(val)) detectedSemester = '2';
          else if (/1|I/i.test(val)) detectedSemester = '1';
        }
      }

      // 2. Quét trực tiếp các ô input trên thanh toolbar của vnEdu
      const toolbarInputs = Array.from(container.querySelectorAll('.x-toolbar input, .x-panel-tbar input, input.x-form-text, input'));
      for (const inp of toolbarInputs) {
        const val = (inp.value || inp.getAttribute?.('value') || '').trim();
        if (!detectedGrade && /^khối\s*(1[0-2]|[1-9])/i.test(val)) {
          const m = val.match(/^khối\s*(1[0-2]|[1-9])/i);
          if (m) detectedGrade = m[1];
        } else if (!detectedClass && /^(?:1[0-2]|[1-9])[A-Za-z0-9_\-\/\.]+$/.test(val)) {
          detectedClass = val;
        } else if (/học\s*k[ỳìyi]\s*(1|2|I|II)/i.test(val)) {
          if (/2|II/i.test(val)) detectedSemester = '2';
          else detectedSemester = '1';
        }
      }

      // 3. Quét tiêu đề và text xung quanh
      const textSources = (container.textContent || '') + ' ' + (typeof document !== 'undefined' ? document.title : '');
      if (!detectedClass) {
        const classMatch = textSources.match(/lớp\s*[:\-]?\s*((?:1[0-2]|[1-9])[A-Za-z0-9\/\-_]+)/i) ||
          textSources.match(/\b((?:1[0-2]|[1-9])[A-Za-z0-9]{1,4})\b/);
        if (classMatch) detectedClass = classMatch[1].trim();
      }

      if (detectedClass) {
        const gradeFromClass = (detectedClass.match(/^(1[0-2]|[1-9])/) || [])[1];
        if (gradeFromClass) detectedGrade = gradeFromClass;
      }
      if (!detectedGrade) {
        const gradeMatch = textSources.match(/khối\s*(1[0-2]|[1-9])/i);
        detectedGrade = gradeMatch ? gradeMatch[1] : '4';
      }

      return {
        className: detectedClass || '',
        grade: detectedGrade || '4',
        schoolYear: '',
        semester: detectedSemester || '1'
      };
    }

    _detectPeriod() {
      const container = this.activeWindow || document.body;
      const inputs = Array.from(container.querySelectorAll('input.x-form-text, input.x-combo-text, input, select'));
      for (const inp of inputs) {
        const val = (inp.tagName === 'SELECT' ? (inp.options[inp.selectedIndex]?.text || inp.value) : (inp.value || '')).trim().toLowerCase();
        if (/giữa\s*k[ỳìyi]\s*1|\bgk1\b/i.test(val)) return 'GK1';
        if (/cuối\s*k[ỳìyi]\s*1|\bck1\b/i.test(val)) return 'CK1';
        if (/giữa\s*k[ỳìyi]\s*2|\bgk2\b/i.test(val)) return 'GK2';
        if (/cuối\s*k[ỳìyi]\s*2|cuối\s*năm|\bck2\b|cả\s*năm/i.test(val)) return 'CK2';
      }

      const text = (container.textContent || '').toLowerCase();
      if (/giữa\s*k[ỳìyi]\s*1|\bgk1\b/i.test(text)) return 'GK1';
      if (/cuối\s*k[ỳìyi]\s*1|\bck1\b/i.test(text)) return 'CK1';
      if (/giữa\s*k[ỳìyi]\s*2|\bgk2\b/i.test(text)) return 'GK2';
      if (/cuối\s*k[ỳìyi]\s*2|cuối\s*năm|\bck2\b|cả\s*năm/i.test(text)) return 'CK2';

      return 'GK1';
    }

    detectSubject() {
      this.detectedPeriod = this._detectPeriod();
      return {
        subject: 'Năng lực và Phẩm chất',
        period: this.detectedPeriod
      };
    }

    /**
     * Kiểm tra xem dòng học sinh có đang được chọn (selected / active) trong ExtJS không
     */
    isRowSelected(row) {
      if (!row) return false;
      const cls = (row.className || '').toLowerCase();
      if (cls.includes('x-grid3-row-selected') ||
        cls.includes('x-grid-row-selected') ||
        cls.includes('row-selected') ||
        cls.includes('selected') ||
        cls.includes('x-grid3-row-focus') ||
        cls.includes('focused') ||
        cls.includes('active') ||
        row.getAttribute('aria-selected') === 'true' ||
        row.getAttribute('aria-current') === 'true') {
        return true;
      }
      try {
        const bg = window.getComputedStyle(row).backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && bg !== 'rgb(255, 255, 255)') {
          return true;
        }
      } catch (e) { }
      return false;
    }

    /**
     * Bóc tách toàn bộ danh sách học sinh từ bảng danh sách bên trái cửa sổ pop-up
     */
    getAllStudents() {
      if (!this.activeWindow || !this.activeWindow.isConnected) this.canHandle();
      const container = this.activeWindow || document.body;

      const studentRows = Array.from(container.querySelectorAll('.x-grid3-row, .x-grid-row, tr[class*="row"], .x-list-item')).filter(r => {
        if (r.closest('.x-grid3-header, thead, .x-grid-header')) return false;
        const txt = (r.textContent || '').trim();
        return txt.length >= 2 && !/^(stt|họ\s*tên|tìm\s*kiếm)$/i.test(txt);
      });

      if (studentRows.length === 0) {
        return [];
      }

      return studentRows.map((r, idx) => {
        let sttIndex = idx + 1;
        let studentName = '';

        const cells = Array.from(r.querySelectorAll('td, .x-grid3-cell, .x-grid3-cell-inner, div, span'));
        for (const c of cells) {
          const val = (c.textContent || '').trim();
          if (/^\d+$/.test(val) && parseInt(val, 10) > 0 && parseInt(val, 10) < 100) {
            sttIndex = parseInt(val, 10);
          } else if (val && VietnameseNameDetector.isVietnameseName(val)) {
            studentName = VietnameseNameDetector.cleanStudentName(val);
          }
        }

        if (!studentName) {
          const rowTxt = (r.textContent || '').trim().replace(/^\d+\s*/, '');
          if (VietnameseNameDetector.isVietnameseName(rowTxt)) {
            studentName = VietnameseNameDetector.cleanStudentName(rowTxt);
          }
        }

        if (!studentName) {
          studentName = `Học sinh ${sttIndex}`;
        }

        return {
          index: sttIndex,
          studentName: studentName,
          studentId: '',
          rowElement: r,
          rowIndex: idx,
          isSelected: this.isRowSelected(r)
        };
      });
    }

    /**
     * Lấy chỉ số (0-based) của học sinh đang được chọn trong danh sách bên trái
     */
    getSelectedStudentIndex() {
      const all = this.getAllStudents();
      const idx = all.findIndex(s => s.isSelected);
      return idx >= 0 ? idx : 0;
    }

    /**
     * Bóc tách danh sách học sinh từ danh sách bên trái cửa sổ pop-up
     */
    detectStudents() {
      const all = this.getAllStudents();
      if (all.length > 0) {
        return all;
      }

      // Fallback nếu không quét được danh sách học sinh bên trái
      if (!this.activeWindow || !this.activeWindow.isConnected) this.canHandle();
      const container = this.activeWindow || document.body;
      let studentName = '';
      const titleMatch = (container.textContent || '').match(/học sinh\s*[:\-]?\s*([A-Za-zÀ-ỹ\s]+?)(?:\s*[\-\|]|\s*$)/i);
      if (titleMatch) studentName = titleMatch[1].trim();

      return [{
        index: 1,
        studentName: studentName || 'Học sinh đang chọn',
        studentId: '',
        rowElement: container,
        isSelected: true,
        rowIndex: 0
      }];
    }

    /**
     * Chuyển chọn sang học sinh theo chỉ số hoặc phần tử dòng
     * Tích hợp Smart Polling chờ nạp chữ màu đỏ (T, Đ, C) và Auto-Retry
     */
    async selectStudent(targetIndexOrRow, options = {}) {
      if (!this.activeWindow || !this.activeWindow.isConnected) this.canHandle();
      const container = this.activeWindow || document.body;

      let targetRow = null;
      let targetIndex = -1;

      if (typeof targetIndexOrRow === 'number') {
        targetIndex = targetIndexOrRow;
        const all = this.getAllStudents();
        if (targetIndex >= 0 && targetIndex < all.length) {
          targetRow = all[targetIndex].rowElement;
        }
      } else if (targetIndexOrRow && targetIndexOrRow.nodeType) {
        targetRow = targetIndexOrRow;
        const all = this.getAllStudents();
        targetIndex = all.findIndex(s => s.rowElement === targetRow);
      }

      if (!targetRow) return false;

      // Hàm kích hoạt chọn dòng học sinh trên ExtJS
      const triggerRowSelection = () => {
        try {
          const scroller = targetRow.closest('.x-grid3-scroller, .x-grid-scroller, .x-grid3-body');
          if (scroller) {
            const rowTop = targetRow.offsetTop;
            const scrollerTop = scroller.scrollTop;
            const scrollerHeight = scroller.clientHeight;
            if (rowTop < scrollerTop || rowTop > scrollerTop + scrollerHeight - 40) {
              scroller.scrollTop = Math.max(0, rowTop - 60);
            }
          }
          targetRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (e) {
          try { targetRow.scrollIntoView(false); } catch (err) { }
        }

        const clickTarget = targetRow.querySelector('.x-grid3-cell-inner, .x-grid3-cell, td, div') || targetRow;
        const evTypes = ['mousedown', 'mouseup', 'click'];
        for (const evName of evTypes) {
          try {
            clickTarget.dispatchEvent(new MouseEvent(evName, {
              bubbles: true,
              cancelable: true,
              view: window
            }));
          } catch (e) { }
        }

        if (typeof clickTarget.click === 'function') {
          try { clickTarget.click(); } catch (e) { }
        }

        try {
          const gridEl = targetRow.closest('.x-grid3, .x-grid, .x-panel');
          const globalWin = (targetRow.ownerDocument && targetRow.ownerDocument.defaultView) || window;
          if (gridEl && globalWin.Ext && globalWin.Ext.getCmp) {
            const grid = globalWin.Ext.getCmp(gridEl.id);
            if (grid && grid.getSelectionModel) {
              const sm = grid.getSelectionModel();
              const rIdx = targetIndex >= 0 ? targetIndex : Array.from(targetRow.parentElement?.children || []).indexOf(targetRow);
              if (rIdx >= 0) {
                if (typeof sm.selectRow === 'function') sm.selectRow(rIdx);
                if (typeof grid.fireEvent === 'function') grid.fireEvent('rowclick', grid, rIdx);
              }
            }
          }
        } catch (e) { }
      };

      // 1. Thực hiện chọn dòng lần 1
      triggerRowSelection();

      const waitForData = options.waitForData !== false;
      if (!waitForData) {
        await DOMUtils.sleep(400);
        return true;
      }

      // 2. SMART POLLING: Chờ vnEdu tải dữ liệu xếp loại (chữ màu đỏ T, Đ, C) lên các nhãn bên phải
      const maxWait = options.maxWaitMs || 3500;
      const startTime = Date.now();
      let retried = false;

      // Đợi tối thiểu 250ms để ExtJS bắt đầu xử lý sự kiện
      await DOMUtils.sleep(250);

      while (Date.now() - startTime < maxWait) {
        // Kiểm tra xem đã xuất hiện xếp loại (chữ màu đỏ) chưa
        if (this.hasAnyRating()) {
          // Thêm 150ms để DOM ổn định hoàn toàn
          await DOMUtils.sleep(150);
          return true;
        }

        // AUTO-RETRY: Nếu sau 1.2 giây vẫn chưa thấy chữ đỏ, kích hoạt lại click lần 2 phòng trường hợp bị mask/mạng chậm
        if (!retried && Date.now() - startTime >= 1200) {
          retried = true;
          triggerRowSelection();
        }

        await DOMUtils.sleep(200);
      }

      // Hết thời gian chờ (có thể học sinh thực sự chưa có xếp loại)
      return this.hasAnyRating();
    }

    /**
     * Tìm nút "Lưu" trên thanh công cụ của modal Phẩm chất - Năng lực
     */
    findSaveButton() {
      if (!this.activeWindow || !this.activeWindow.isConnected) this.canHandle();
      const win = this.activeWindow;
      if (!win) return null;

      // 1. Quét tất cả button trong cửa sổ modal
      const allButtons = Array.from(win.querySelectorAll('button, a.x-btn, .x-btn-text, [role="button"], input[type="button"]'));

      // Ưu tiên 1: button có textContent đúng là 'Lưu' hoặc bắt đầu bằng 'Lưu'
      for (const btn of allButtons) {
        const txt = (btn.textContent || '').trim();
        if (/^lưu(\s+lại)?$/i.test(txt)) {
          return btn;
        }
      }

      // Ưu tiên 2: button có title / tooltip là 'Lưu'
      for (const btn of allButtons) {
        const title = (btn.getAttribute('title') || btn.getAttribute('aria-label') || '').trim();
        if (/^lưu(\s+lại)?$/i.test(title)) {
          return btn;
        }
      }

      // Ưu tiên 3: Quét trong toolbar (.x-toolbar, .x-panel-tbar, .x-window-tbar, .x-toolbar-ct)
      const toolbarEls = Array.from(win.querySelectorAll('.x-toolbar, .x-panel-tbar, .x-window-tbar, .x-toolbar-ct'));
      for (const tb of toolbarEls) {
        const tbButtons = Array.from(tb.querySelectorAll('button, a, .x-btn, td.x-btn-mc, span, em'));
        for (const el of tbButtons) {
          const txt = (el.textContent || '').trim();
          if (/^lưu$/i.test(txt)) {
            return el.closest('button, a, .x-btn') || el;
          }
        }
      }

      // Ưu tiên 4: button có class icon-save hoặc save
      for (const btn of allButtons) {
        const cls = (btn.className || '').toLowerCase();
        if (/icon-save|btn-save|save-icon/i.test(cls)) {
          return btn;
        }
      }

      return null;
    }

    /**
     * Tự động bấm nút "Lưu" trên vnEdu và chờ đóng hộp thoại "Lưu thành công" (Smart Polling)
     */
    async clickSaveButton(maxWaitMs = 5000) {
      const btn = this.findSaveButton();
      if (!btn) {
        if (Logger) Logger.warn('Không tìm thấy nút "Lưu" trong cửa sổ Phẩm chất - Năng lực');
        return false;
      }

      try {
        btn.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      } catch (e) { }

      // Chuỗi sự kiện chuột hoàn chỉnh cho ExtJS
      const mouseEvents = ['mouseover', 'mousedown', 'mouseup', 'click'];
      for (const evName of mouseEvents) {
        try {
          btn.dispatchEvent(new MouseEvent(evName, {
            bubbles: true,
            cancelable: true,
            view: window
          }));
        } catch (e) { }
      }

      if (typeof btn.click === 'function') {
        try { btn.click(); } catch (e) { }
      }

      // Kích hoạt qua ExtJS handler nếu có
      try {
        const globalWin = (btn.ownerDocument && btn.ownerDocument.defaultView) || window;
        if (globalWin.Ext && globalWin.Ext.getCmp) {
          const btnCmp = globalWin.Ext.getCmp(btn.id) || globalWin.Ext.getCmp(btn.closest?.('.x-btn')?.id);
          if (btnCmp) {
            if (typeof btnCmp.handler === 'function') {
              btnCmp.handler.call(btnCmp.scope || btnCmp, btnCmp);
            } else if (typeof btnCmp.fireEvent === 'function') {
              btnCmp.fireEvent('click', btnCmp);
            }
          }
        }
      } catch (e) { }

      // SMART POLLING: Chờ hộp thoại MessageBox "Lưu thành công" xuất hiện và tự động đóng ngay lập tức
      const startTime = Date.now();
      let dismissed = false;

      while (Date.now() - startTime < maxWaitMs) {
        // 1. Kiểm tra qua Ext.Msg nếu có
        try {
          const globalWin = (btn.ownerDocument && btn.ownerDocument.defaultView) || window;
          if (globalWin.Ext?.Msg?.isVisible?.()) {
            globalWin.Ext.Msg.hide();
            dismissed = true;
          }
        } catch (e) { }

        // 2. Quét các hộp thoại MessageBox / Dialog trên DOM
        try {
          const msgBoxes = Array.from(document.querySelectorAll('.x-window-dlg, .x-msg-box, .x-window[class*="msg"]'));
          for (const dlg of msgBoxes) {
            const style = window.getComputedStyle(dlg);
            if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
              // Tìm nút OK hoặc nút bấm xác nhận trong hộp thoại
              const btns = Array.from(dlg.querySelectorAll('button, .x-btn, input[type="button"], a.x-btn'));
              const okBtn = btns.find(b => /^(ok|đồng\s*ý|đóng|xác\s*nhận)$/i.test((b.textContent || b.value || '').trim())) || btns[0];
              if (okBtn) {
                okBtn.click();
                dismissed = true;
              }
            }
          }
        } catch (e) { }

        if (dismissed) {
          // Chờ 250ms cho lớp phủ modal mask (.ext-el-mask) giải phóng hoàn toàn
          await DOMUtils.sleep(250);
          try {
            // Kiểm tra và dọn dẹp lớp mask còn sót lại nếu có
            const masks = Array.from(document.querySelectorAll('.ext-el-mask, .x-mask'));
            for (const m of masks) {
              const mStyle = window.getComputedStyle(m);
              if (mStyle.display !== 'none') {
                m.style.display = 'none';
              }
            }
          } catch (e) { }
          return true;
        }

        await DOMUtils.sleep(150);
      }

      // Nếu sau maxWaitMs không thấy popup (có thể server lưu âm thầm hoặc không hiện popup)
      await DOMUtils.sleep(300);
      return true;
    }

    /**
     * Kiểm tra xem một phần tử DOM có mang màu đỏ (chữ màu đỏ của GVCN) hay không
     */
    isRedElement(el) {
      if (!el || !el.getAttribute) return false;

      // 1. Kiểm tra inline style
      const inlineStyle = (el.getAttribute('style') || '').toLowerCase();
      if (/color\s*:\s*(?:red|#f(?:00|f0000)|rgb\(\s*(?:25[0-5]|2[0-4]\d|1\d\d)\s*,\s*[0-8]?\d\s*,\s*[0-8]?\d\s*\))/i.test(inlineStyle)) {
        return true;
      }

      // 2. Kiểm tra thẻ <font color="red">
      if (el.tagName === 'FONT') {
        const color = (el.getAttribute('color') || '').toLowerCase();
        if (color === 'red' || color === '#f00' || color === '#ff0000') return true;
      }

      // 3. Kiểm tra class biểu thị màu đỏ
      const cls = (el.className || '').toString().toLowerCase();
      if (/\b(?:red|text-red|color-red|danger|invalid|rating-red)\b/i.test(cls)) {
        return true;
      }

      // 4. Kiểm tra computed style
      try {
        const win = (el.ownerDocument && el.ownerDocument.defaultView) || window;
        const comp = win.getComputedStyle(el);
        const col = comp.color || '';
        const m = col.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (m) {
          const r = parseInt(m[1], 10);
          const g = parseInt(m[2], 10);
          const b = parseInt(m[3], 10);
          // Màu đỏ: r vượt trội (> 150) và g, b nhỏ (< 100)
          if (r >= 150 && g <= 100 && b <= 100) {
            return true;
          }
        }
      } catch (e) { }

      return false;
    }

    /**
     * Trích xuất chính xác xếp loại (T, Đ, C, H, CĐ) màu đỏ của GVCN trên từng mục
     */
    extractRatingFromLabel(formItem, ta, lblEl, labelText) {
      let fieldRating = null;

      // Ưu tiên 1: Quét tìm phần tử hiển thị chữ màu đỏ của GVCN (Red font/style)
      const searchScope = formItem || (lblEl ? lblEl.parentElement : ta.parentElement);
      if (searchScope) {
        const allDescendants = Array.from(searchScope.querySelectorAll('*'));
        for (const el of allDescendants) {
          // Bỏ qua bản thân ô textarea hoặc input nhập liệu
          if (el === ta || el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') continue;

          const txt = (el.textContent || '').trim();
          const candidate = txt.replace(/[:\-()\[\]\s]/g, '').toUpperCase();
          if (/^(?:T|Đ|C|H|CĐ)$/.test(candidate)) {
            if (this.isRedElement(el)) {
              fieldRating = (candidate === 'H' || candidate === 'Đ') ? 'Đ' : candidate;
              break;
            }
          }
        }
      }

      // Ưu tiên 2: Trích xuất từ nhãn có chứa xếp loại sau dấu hai chấm (Ví dụ: "Tự chủ và tự học: Đ", "Yêu nước: T")
      if (!fieldRating && labelText) {
        // Chỉ khớp khi sau dấu : hoặc - có chứa rõ ràng chữ xếp loại T, Đ, C, H
        const colonMatch = labelText.match(/[:\-]\s*([TĐCH]|CĐ)(?:\s*[:\s]*|$)/i);
        if (colonMatch) {
          const rawLvl = colonMatch[1].toUpperCase();
          fieldRating = (rawLvl === 'H' || rawLvl === 'Đ') ? 'Đ' : rawLvl;
        }
      }

      return fieldRating;
    }

    /**
     * Tính mức xếp loại tổng hợp cho một nhóm năng lực hoặc phẩm chất
     * Quy tắc:
     * - Nếu có bất kỳ mục nào mức 'C' (Cần cố gắng) -> Mức chung là 'C'
     * - Nếu đa số hoặc toàn bộ là 'T' (Tốt) và không có 'C' -> Mức chung là 'T'
     * - Nếu có xếp loại nhưng không đạt 'T' và không bị 'C' -> Mức chung là 'Đ' (hoặc 'H')
     * - Nếu hoàn toàn không có mục nào được xếp loại -> Trả về null
     */
    computeAggregateRating(fieldList) {
      const validRatings = (fieldList || []).map(f => f.rating).filter(Boolean);
      if (validRatings.length === 0) return null;

      if (validRatings.includes('C')) {
        return 'C';
      }

      const countT = validRatings.filter(r => r === 'T').length;
      if (countT >= Math.ceil(validRatings.length / 2)) {
        return 'T';
      }

      return 'Đ';
    }

    /**
     * Thuật toán lọc câu nhận xét chung chống mâu thuẫn ngữ nghĩa với các tiêu chí con
     * Đảm bảo: nếu tiêu chí con nào bị Đ hoặc C (chưa đạt T), nhận xét chung tuyệt đối không khen ngợi tiêu chí đó!
     */
    getConsistentGeneralComment(role, fieldLevel, studentIdx, edLevel, commentVars, currentFields, OfflineTemplates) {
      if (!OfflineTemplates) return '';

      // 1. Xác định danh sách từ khóa cấm dựa trên các tiêu chí con bị Đạt hoặc Cần cố gắng
      const forbiddenWords = [];

      currentFields.forEach(cf => {
        const r = cf.rating;
        // Nếu tiêu chí con KHÔNG ĐẠT mức Tốt (T), tức là ở mức 'Đ', 'H' hoặc 'C'
        if (r && r !== 'T') {
          switch (cf.role) {
            case 'CHAM_CHI':
              forbiddenWords.push('chăm chỉ', 'siêng năng', 'cần cù', 'chuyên cần');
              break;
            case 'TU_CHU':
              forbiddenWords.push('tự chủ', 'tự học', 'tự giác');
              break;
            case 'GIAO_TIEP':
              forbiddenWords.push('giao tiếp tốt', 'hợp tác tốt', 'phối hợp nhịp nhàng');
              break;
            case 'GQVD':
              forbiddenWords.push('sáng tạo', 'giải quyết vấn đề', 'tư duy linh hoạt');
              break;
            case 'TRUNG_THUC':
              forbiddenWords.push('trung thực', 'thật thà', 'ngay thẳng', 'đáng tin cậy');
              break;
            case 'NHAN_AI':
              forbiddenWords.push('nhân ái', 'yêu thương bạn bè', 'sẻ chia');
              break;
            case 'TRACH_NHIEM':
              forbiddenWords.push('trách nhiệm cao', 'gương mẫu hoàn thành');
              break;
            case 'YEU_NUOC':
              forbiddenWords.push('yêu nước', 'yêu quê hương', 'tự hào');
              break;
            case 'TINH_TOAN':
            case 'NGON_NGU':
              forbiddenWords.push('toàn diện các môn', 'nổi trội mọi môn', 'tính toán nhanh', 'giỏi ngôn ngữ');
              break;
          }
        }
      });

      // 2. Xác định chủ đề tra cứu (ưu tiên 3 bộ danh mục câu nhận xét chung độc lập theo TT27)
      let subjectKey = 'Nhận xét chung Phẩm chất';
      let fallbackKey = 'Phẩm chất';
      if (role === 'NL_CHUNG') {
        subjectKey = 'Nhận xét chung Năng lực';
        fallbackKey = 'Năng lực';
      } else if (role === 'NL_DACTHU') {
        subjectKey = 'Nhận xét năng lực đặc thù';
        fallbackKey = 'Năng lực đặc thù';
      }

      // 3. Lấy câu nhận xét và kiểm tra qua bộ lọc
      // Thử tối đa 12 offset khác nhau để tìm câu trong ngân hàng Excel không dính từ khóa cấm
      for (let offset = 0; offset < 12; offset++) {
        const candidateVars = { ...commentVars, studentIndex: studentIdx + offset, deterministicIndex: studentIdx + offset, maxLength: 155 };
        let candidate = OfflineTemplates.getCommentForStudent(subjectKey, fieldLevel, studentIdx + offset, edLevel, candidateVars);
        if (!candidate && fallbackKey) {
          candidate = OfflineTemplates.getCommentForStudent(fallbackKey, fieldLevel, studentIdx + offset, edLevel, candidateVars);
        }
        if (!candidate) continue;

        const candidateLower = candidate.toLowerCase();
        const hasConflict = forbiddenWords.some(fw => candidateLower.includes(fw.toLowerCase()));
        if (!hasConflict) {
          return candidate;
        }
      }

      // 4. Nếu mọi câu đều dính từ khóa (dự phòng an toàn 100%), trả về mẫu câu trung lập chuẩn mực sư phạm
      if (role === 'PC_CHUNG') {
        if (fieldLevel === 'T') {
          return 'Có phẩm chất đạo đức tốt, ngoan ngoãn, kính thầy yêu bạn và luôn hoàn thành tốt các nhiệm vụ tập thể.';
        } else if (fieldLevel === 'C') {
          return 'Biết nghe lời thầy cô và hòa đồng với bạn bè, cần kiên trì rèn luyện nề nếp để khắc phục các mặt còn hạn chế.';
        } else {
          return 'Thực hiện đầy đủ các quy định về phẩm chất của học sinh, ngoan ngoãn lễ phép, biết vâng lời thầy cô và hòa nhã với bạn bè.';
        }
      } else if (role === 'NL_CHUNG') {
        if (fieldLevel === 'T') {
          return 'Chủ động và tích cực trong học tập, nắm bắt kiến thức nhanh, biết vận dụng phương pháp học tập hiệu quả cùng bạn bè.';
        } else if (fieldLevel === 'C') {
          return 'Cần tập trung chú ý lắng nghe thầy cô giảng bài, chủ động hoàn thành bài tập và tích cực tham gia các hoạt động học tập.';
        } else {
          return 'Hoàn thành các nhiệm vụ học tập theo yêu cầu của giáo viên, có tinh thần học hỏi, cần mạnh dạn phát biểu xây dựng bài hơn.';
        }
      } else { // NL_DACTHU
        if (fieldLevel === 'T') {
          return 'Có năng khiếu nổi bật ở các môn học đặc thù, tiếp thu bài nhanh, kỹ năng thực hành thành thạo và hoàn thành xuất sắc các bài tập.';
        } else if (fieldLevel === 'C') {
          return 'Cần chăm chỉ rèn luyện thêm các kỹ năng cơ bản ở môn học đặc thù còn hạn chế, chú ý lắng nghe giáo viên hướng dẫn thực hành.';
        } else {
          return 'Nắm được kiến thức cơ bản các môn đặc thù, hoàn thành các bài tập thực hành theo yêu cầu, cần tích cực rèn luyện thêm các kỹ năng.';
        }
      }
    }

    /**
     * Kiểm tra nhanh xem form học sinh đang mở có ít nhất 1 xếp loại (chữ màu đỏ của GVCN) hay không
     */
    hasAnyRating() {
      const fields = this.detectCommentFields();
      return fields.some(f => Boolean(f.rating));
    }

    /**
     * Phân loại các ô textarea trong phần bên phải của modal Phẩm chất - Năng lực
     * Bóc tách chính xác mức xếp loại (: T, : Đ, : C, : H) đi kèm trên từng nhãn
     */
    detectCommentFields() {
      if (!this.activeWindow || !this.activeWindow.isConnected) this.canHandle();
      const container = this.activeWindow || document.body;

      const textareas = Array.from(container.querySelectorAll('textarea, [contenteditable="true"]'));
      if (textareas.length === 0) return [];

      const fields = [];
      let seenNLChung = false;

      textareas.forEach((ta, idx) => {
        // Tìm nhãn hoặc tiêu đề gần ô textarea này nhất
        let labelText = '';
        let section = '';
        let lblEl = null;

        // 1. Quét tìm label trong .x-form-item hoặc anh em kế cận
        const formItem = ta.closest('.x-form-item, [class*="form-item"]');
        if (formItem) {
          lblEl = formItem.querySelector('label, .x-form-item-label, .label');
          if (lblEl) labelText = (lblEl.textContent || '').trim();
        }

        if (!labelText) {
          let prev = ta.previousElementSibling;
          while (prev) {
            const txt = (prev.textContent || '').trim();
            if (txt && txt.length < 80) {
              labelText = txt;
              lblEl = prev;
              break;
            }
            prev = prev.previousElementSibling;
          }
        }

        if (!labelText && ta.parentElement) {
          let prevParent = ta.parentElement.previousElementSibling;
          while (prevParent) {
            const txt = (prevParent.textContent || '').trim();
            if (txt && txt.length < 80) {
              labelText = txt;
              lblEl = prevParent;
              break;
            }
            prevParent = prevParent.previousElementSibling;
          }
        }

        if (!labelText) {
          const td = ta.closest('td');
          if (td && td.previousElementSibling) {
            labelText = (td.previousElementSibling.textContent || '').trim();
            lblEl = td.previousElementSibling;
          }
        }

        const lowerLabel = labelText.toLowerCase();

        // 2. Trích xuất mức xếp loại trực tiếp từ nhãn và phần tử chữ màu đỏ của GVCN
        const fieldRating = this.extractRatingFromLabel(formItem, ta, lblEl, labelText);

        // 3. Xác định xem ô này thuộc cột NĂNG LỰC hay PHẨM CHẤT
        let curr = ta.parentElement;
        while (curr && curr !== container) {
          const cls = (curr.className || '').toLowerCase();
          const txt = (curr.textContent || '').slice(0, 100).toLowerCase();
          if (/col-pham-chat|pham_chat|pham-chat/i.test(cls) || (/phẩm\s*chất/i.test(txt) && !/năng\s*lực/i.test(txt))) {
            section = 'PHAM_CHAT';
            break;
          }
          if (/col-nang-luc|nang_luc|nang-luc/i.test(cls) || (/năng\s*lực/i.test(txt) && !/phẩm\s*chất/i.test(txt))) {
            section = 'NANG_LUC';
            break;
          }
          curr = curr.parentElement;
        }

        // 4. Phân loại vai trò chi tiết của từng ô textarea
        let role = 'OTHER';
        if (/nhận\s*xét\s*năng\s*lực\s*đặc\s*thù|đặc\s*thù/i.test(lowerLabel)) {
          role = 'NL_DACTHU';
        } else if (/nhận\s*xét\s*chung/i.test(lowerLabel)) {
          if (section === 'PHAM_CHAT' || seenNLChung) {
            role = 'PC_CHUNG';
            section = 'PHAM_CHAT';
          } else {
            role = 'NL_CHUNG';
            seenNLChung = true;
          }
        } else if (/tự\s*chủ|tự\s*học/i.test(lowerLabel)) {
          role = 'TU_CHU';
        } else if (/giao\s*tiếp|hợp\s*tác/i.test(lowerLabel)) {
          role = 'GIAO_TIEP';
        } else if (/sáng\s*tạo|gqvđ|giải\s*quyết\s*vấn\s*đề/i.test(lowerLabel)) {
          role = 'GQVD';
        } else if (/yêu\s*nước/i.test(lowerLabel)) {
          role = 'YEU_NUOC';
          section = 'PHAM_CHAT';
        } else if (/nhân\s*ái/i.test(lowerLabel)) {
          role = 'NHAN_AI';
          section = 'PHAM_CHAT';
        } else if (/chăm\s*chỉ/i.test(lowerLabel)) {
          role = 'CHAM_CHI';
          section = 'PHAM_CHAT';
        } else if (/trung\s*thực/i.test(lowerLabel)) {
          role = 'TRUNG_THUC';
          section = 'PHAM_CHAT';
        } else if (/trách\s*nhiệm/i.test(lowerLabel)) {
          role = 'TRACH_NHIEM';
          section = 'PHAM_CHAT';
        } else if (/ngôn\s*ngữ/i.test(lowerLabel)) {
          role = 'NGON_NGU';
        } else if (/tính\s*toán/i.test(lowerLabel)) {
          role = 'TINH_TOAN';
        } else if (/khoa\s*học|tự\s*nhiên|xã\s*hội/i.test(lowerLabel)) {
          role = 'KHOA_HOC';
        } else if (/công\s*nghệ/i.test(lowerLabel)) {
          role = 'CONG_NGHE';
        } else if (/tin\s*học/i.test(lowerLabel)) {
          role = 'TIN_HOC';
        } else if (/thẩm\s*m[ĩỹ]|m[ĩỹ]\s*thuật|âm\s*nhạc/i.test(lowerLabel)) {
          role = 'THAM_MI';
        } else if (/thể\s*chất|thể\s*dục/i.test(lowerLabel)) {
          role = 'THE_CHAT';
        } else {
          // Gán mặc định theo thứ tự nếu không bắt được nhãn
          if (idx === 0) role = 'NL_CHUNG';
          else if (idx === 1) role = 'PC_CHUNG';
        }

        fields.push({
          index: idx + 1,
          element: ta,
          rowElement: formItem || ta.parentElement,
          confidence: 95,
          tagName: ta.tagName.toLowerCase(),
          role: role,
          labelText: labelText,
          rating: fieldRating,
          section: section
        });
      });

      return fields;
    }

    mapStudentsToFields(students, fields) {
      if (students.length === 0 || fields.length === 0) return [];

      return students.map((st, idx) => {
        return {
          student: st,
          commentField: fields[0], // Tham chiếu đại diện
          fields: fields,
          index: idx + 1,
          status: 'READY'
        };
      });
    }

    validateMapping(mapping) {
      const studentName = mapping.length > 0 ? (mapping[0].student?.studentName || 'học sinh đang chọn') : '';
      return {
        confidence: mapping.length > 0 ? 100 : 0,
        safeForBatch: mapping.length > 0,
        studentCount: mapping.length,
        fieldCount: mapping.length > 0 ? mapping[0].fields?.length || 1 : 0,
        reason: mapping.length > 0
          ? `Đã nhận diện thành công ${mapping.length} học sinh trong danh sách lớp (bắt đầu từ: "${studentName}") với ${mapping[0].fields?.length || 0} mục năng lực - phẩm chất.`
          : 'Không tìm thấy dữ liệu ô nhận xét trong cửa sổ.'
      };
    }

    /**
     * Điền đầy đủ nhận xét Năng lực & Phẩm chất cho học sinh đang chọn
     * ĐIỀU KIỆN TIÊN QUYẾT: Chỉ điền nhận xét khi ĐÃ CÓ XẾP LOẠI CHỮ MÀU ĐỎ CỦA GVCN!
     * - Nếu học sinh chưa có xếp loại (như trong hình 1): Bỏ qua hoàn toàn, giữ nguyên toàn bộ ô trống.
     * - Nếu có xếp loại (như trong hình 2): Điền nhận xét chính xác tương ứng với từng mức xếp loại của GVCN.
     */
    async fillComment(mappingItem, commentText, options = {}) {
      if (!this.activeWindow || !this.activeWindow.isConnected) this.canHandle();

      // 1. Quét các ô textarea hiện có trong phần bên phải của modal
      const currentFields = this.detectCommentFields();
      if (currentFields.length === 0) {
        return { success: false, reason: 'Không tìm thấy các ô nhận xét trong modal.' };
      }

      // 2. Tính toán rating tổng hợp cho các ô nhận xét chung từ các mục thành phần
      const nlChungCriteria = currentFields.filter(f => ['TU_CHU', 'GIAO_TIEP', 'GQVD'].includes(f.role));
      const nlDacThuCriteria = currentFields.filter(f => ['NGON_NGU', 'TINH_TOAN', 'KHOA_HOC', 'CONG_NGHE', 'TIN_HOC', 'THAM_MI', 'THE_CHAT'].includes(f.role));
      const pcCriteria = currentFields.filter(f => ['YEU_NUOC', 'NHAN_AI', 'CHAM_CHI', 'TRUNG_THUC', 'TRACH_NHIEM'].includes(f.role));

      const nlChungLevel = this.computeAggregateRating(nlChungCriteria);
      const nlDacThuLevel = this.computeAggregateRating(nlDacThuCriteria);
      const pcChungLevel = this.computeAggregateRating(pcCriteria);

      // Đếm số lượng tiêu chí đã có xếp loại chữ màu đỏ của GVCN
      const criteriaFields = currentFields.filter(f => !['NL_CHUNG', 'PC_CHUNG', 'NL_DACTHU'].includes(f.role));
      const ratedCriteria = criteriaFields.filter(f => Boolean(f.rating));

      // NẾU HỌC SINH HOÀN TOÀN CHƯA CÓ XẾP LOẠI NÀO (như trong hình 1):
      // Tuyệt đối không điền bất kỳ nhận xét nào! Giữ nguyên toàn bộ ô trống!
      if (ratedCriteria.length === 0) {
        if (Logger) Logger.warn(`[${mappingItem.student?.studentName || 'Học sinh'}] Chưa có xếp loại năng lực - phẩm chất (chưa có chữ màu đỏ T/Đ/C của GVCN). Bỏ qua không điền nhận xét.`);
        mappingItem.status = 'UNRATED';
        mappingItem.unrated = true;
        return {
          success: false,
          unrated: true,
          message: 'Học sinh chưa có xếp loại năng lực - phẩm chất (chưa có chữ màu đỏ T, Đ, C của GVCN).'
        };
      }

      const OfflineTemplates = options.offlineTemplates || (typeof window !== 'undefined' ? window.VnEduOfflineTemplates : null);
      const studentIdx = (mappingItem.student?.index || mappingItem.index || 1) - 1;
      const period = options.period || this.detectedPeriod || 'GK1';
      const edLevel = options.educationLevel || 'PRIMARY';

      const classInfo = this.detectClass ? this.detectClass() : null;
      const detectedGrade = classInfo?.grade || (classInfo?.className ? classInfo.className.match(/^(1[0-2]|[1-9])/)?.[1] : '') || options.grade || '';

      const commentVars = {
        period: period,
        educationLevel: edLevel,
        grade: detectedGrade,
        className: classInfo?.className || '',
        studentIndex: studentIdx,
        maxLength: 90
      };

      // Ngân hàng nhận xét riêng biệt cho "Nhận xét năng lực đặc thù"
      const dacthuBanks = {
        T: [
          'Có năng khiếu nổi bật ở các môn đặc thù, tiếp thu bài nhanh.',
          'Thực hiện tốt các kỹ năng ngôn ngữ, tính toán và vận động thể chất.',
          'Có năng lực tiếp thu nhanh các môn năng khiếu và tự nhiên xã hội.',
          'Chủ động, tích cực và có nhiều tiến bộ trong các môn học đặc thù.'
        ],
        H: [
          'Nắm được kiến thức cơ bản các môn đặc thù, cần chăm chỉ rèn luyện thêm.',
          'Có cố gắng trong học tập các môn đặc thù, cần tích cực thực hành hơn.',
          'Hoàn thành yêu cầu môn học đặc thù, cần rèn luyện thêm kỹ năng tính toán.',
          'Có ý thức thực hành tốt các môn năng khiếu, cần tự tin phát biểu hơn.'
        ],
        C: [
          'Cần chú ý lắng nghe và tích cực hơn trong các giờ học thực hành năng khiếu.',
          'Cần rèn luyện thêm các kỹ năng cơ bản về ngôn ngữ và tính toán.'
        ]
      };

      let filledCount = 0;

      // 3. Tự động sinh nhận xét cho từng ô textarea CHỈ KHI CÓ XẾP LOẠI TƯƠNG ỨNG
      for (const f of currentFields) {
        let fieldLevel = null;

        if (f.role === 'NL_CHUNG') {
          fieldLevel = nlChungLevel;
        } else if (f.role === 'NL_DACTHU') {
          fieldLevel = nlDacThuLevel;
        } else if (f.role === 'PC_CHUNG') {
          fieldLevel = pcChungLevel;
        } else {
          fieldLevel = f.rating;
        }

        // QUY TẮC CỐT LÕI: MỤC NÀO CHƯA CÓ XẾP LOẠI -> TUYỆT ĐỐI KHÔNG ĐIỀN!
        // Giữ nguyên ô trống để phản ánh đúng thực tế đánh giá của GVCN.
        if (!fieldLevel) {
          continue;
        }

        let textToFill = '';

        if (OfflineTemplates) {
          switch (f.role) {
            case 'NL_CHUNG':
              textToFill = this.getConsistentGeneralComment('NL_CHUNG', fieldLevel, studentIdx, edLevel, commentVars, currentFields, OfflineTemplates);
              break;
            case 'PC_CHUNG':
              textToFill = this.getConsistentGeneralComment('PC_CHUNG', fieldLevel, studentIdx, edLevel, commentVars, currentFields, OfflineTemplates);
              break;
            case 'NL_DACTHU':
              textToFill = this.getConsistentGeneralComment('NL_DACTHU', fieldLevel, studentIdx, edLevel, commentVars, currentFields, OfflineTemplates);
              break;
            case 'TU_CHU':
              textToFill = OfflineTemplates.getCommentForStudent('Tự chủ và tự học', fieldLevel, studentIdx, edLevel, commentVars);
              break;
            case 'GIAO_TIEP':
              textToFill = OfflineTemplates.getCommentForStudent('Giao tiếp và hợp tác', fieldLevel, studentIdx, edLevel, commentVars);
              break;
            case 'GQVD':
              textToFill = OfflineTemplates.getCommentForStudent('GQVĐ và sáng tạo', fieldLevel, studentIdx, edLevel, commentVars);
              break;
            case 'YEU_NUOC':
              textToFill = OfflineTemplates.getCommentForStudent('Yêu nước', fieldLevel, studentIdx, edLevel, commentVars);
              break;
            case 'NHAN_AI':
              textToFill = OfflineTemplates.getCommentForStudent('Nhân ái', fieldLevel, studentIdx, edLevel, commentVars);
              break;
            case 'CHAM_CHI':
              textToFill = OfflineTemplates.getCommentForStudent('Chăm chỉ', fieldLevel, studentIdx, edLevel, commentVars);
              break;
            case 'TRUNG_THUC':
              textToFill = OfflineTemplates.getCommentForStudent('Trung thực', fieldLevel, studentIdx, edLevel, commentVars);
              break;
            case 'TRACH_NHIEM':
              textToFill = OfflineTemplates.getCommentForStudent('Trách nhiệm', fieldLevel, studentIdx, edLevel, commentVars);
              break;
            case 'NGON_NGU':
              textToFill = OfflineTemplates.getCommentForStudent('Tiếng Việt', fieldLevel, studentIdx, edLevel, commentVars);
              break;
            case 'TINH_TOAN':
              textToFill = OfflineTemplates.getCommentForStudent('Toán', fieldLevel, studentIdx, edLevel, commentVars);
              break;
            case 'KHOA_HOC':
              textToFill = OfflineTemplates.getCommentForStudent('Khoa học', fieldLevel, studentIdx, edLevel, commentVars);
              break;
            case 'CONG_NGHE':
              textToFill = OfflineTemplates.getCommentForStudent('Công nghệ', fieldLevel, studentIdx, edLevel, commentVars);
              break;
            case 'TIN_HOC':
              textToFill = OfflineTemplates.getCommentForStudent('Tin học', fieldLevel, studentIdx, edLevel, commentVars);
              break;
            case 'THAM_MI':
              textToFill = OfflineTemplates.getCommentForStudent('Mĩ thuật', fieldLevel, studentIdx, edLevel, commentVars);
              break;
            case 'THE_CHAT':
              textToFill = OfflineTemplates.getCommentForStudent('Giáo dục thể chất', fieldLevel, studentIdx, edLevel, commentVars);
              break;
            default:
              if (f.section === 'PHAM_CHAT') {
                textToFill = this.getConsistentGeneralComment('PC_CHUNG', fieldLevel, studentIdx, edLevel, commentVars, currentFields, OfflineTemplates);
              } else {
                textToFill = this.getConsistentGeneralComment('NL_CHUNG', fieldLevel, studentIdx, edLevel, commentVars, currentFields, OfflineTemplates);
              }
              break;
          }
        }

        if (!textToFill) {
          textToFill = f.section === 'PHAM_CHAT'
            ? 'Có phẩm chất đạo đức tốt, ngoan ngoãn lễ phép, luôn gương mẫu chấp hành nội quy trường lớp và hòa đồng với bạn bè.'
            : 'Chủ động và tích cực trong học tập, nắm bắt kiến thức nhanh, biết vận dụng phương pháp học tập hiệu quả cùng bạn bè.';
        }

        // GIỚI HẠN ĐỘ DÀI:
        // - 3 ô nhận xét chung xuất học bạ số (NL_CHUNG, PC_CHUNG, NL_DACTHU): cho phép dài đầy đặn từ 90 đến 145 ký tự (<= 150 ký tự)
        // - Các ô tiêu chí thành phần còn lại: giữ gọn gàng chuẩn mực <= 90 ký tự (chuẩn an toàn Thông tư 27)
        const isGeneralField = ['NL_CHUNG', 'PC_CHUNG', 'NL_DACTHU'].includes(f.role);
        const limitLength = isGeneralField ? 150 : 90;

        if (textToFill.length > limitLength) {
          if (OfflineTemplates && typeof OfflineTemplates.clampToMaxLength === 'function') {
            textToFill = OfflineTemplates.clampToMaxLength(textToFill, limitLength);
          } else {
            let sub = textToFill.trim().slice(0, limitLength);
            const lastSpace = sub.lastIndexOf(' ');
            if (lastSpace > (limitLength * 0.6)) sub = sub.slice(0, lastSpace);
            sub = sub.replace(/[,;:\-\s]+$/, '');
            if (!/[.!?]$/.test(sub)) sub += '.';
            textToFill = sub;
          }
        }

        // Gán giá trị vào textarea bằng DOMUtils an toàn
        // Gán giá trị vào textarea bằng DOMUtils an toàn kèm metadata ngữ cảnh
        DOMUtils.setFieldValue(f.element, textToFill, {
          subject: isGeneralField
            ? (f.role === 'PC_CHUNG' ? 'Nhận xét chung Phẩm chất' : (f.role === 'NL_DACTHU' ? 'Nhận xét năng lực đặc thù' : 'Nhận xét chung Năng lực'))
            : (f.roleTitle || f.role),
          grade: detectedGrade,
          period: period,
          level: fieldLevel,
          educationLevel: edLevel,
          role: f.role
        });
        filledCount++;
      }

      if (filledCount === 0) {
        mappingItem.status = 'UNRATED';
        mappingItem.unrated = true;
        return {
          success: false,
          unrated: true,
          message: 'Không có mục nào có xếp loại để điền nhận xét.'
        };
      }

      mappingItem.status = 'FILLED';
      return {
        success: true,
        filledCount: filledCount,
        ratedCount: ratedCriteria.length
      };
    }
  }

  registerAdapter(VnEduFormAdapter);

  return VnEduFormAdapter;
});
