/**
 * Grid-based vnEdu Adapter (VNEDU_ADAPTER_GRID)
 * Handles ExtJS desktop grids (.x-grid3, .x-grid), AG Grid, SlickGrid, role="row", or flex rows.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./vnedu-adapter'),
      require('../utils/vietnamese-name'),
      require('../utils/confidence'),
      require('../utils/dom-utils')
    );
  } else {
    root.VnEduGridAdapter = factory(
      root.VnEduBaseAdapter,
      root.VietnameseNameDetector,
      root.VnEduConfidence,
      root.VnEduDOMUtils
    );
  }
})(typeof self !== 'undefined' ? self : this, function (
  BaseAdapterModule,
  VietnameseNameDetector,
  ConfidenceModule,
  DOMUtils
) {
  const { VnEduBaseAdapter, registerAdapter } = BaseAdapterModule;

  let dynamicRemoteMatchers = [];

  class VnEduGridAdapter extends VnEduBaseAdapter {
    static setRemoteMatchers(aliases) {
      if (!Array.isArray(aliases)) return;
      dynamicRemoteMatchers = aliases
        .filter(a => a && a.name && a.regex)
        .map(a => ({ name: a.name, regex: new RegExp(a.regex, 'i') }));
    }
    constructor(options = {}) {
      super(options);
      this.name = 'VNEDU_ADAPTER_GRID';
      this.ratingColumnIndex = -1;
      this.scoreColumnIndex = -1;
      this.commentColumnIndex = -1;
      this.ratingColClass = '';
      this.scoreColClass = '';
      this.detectedPeriod = '';
    }

    _isDisallowedScope(scope) {
      if (!scope) return false;
      const titleEl = scope.querySelector('.x-window-header-text, .x-panel-header-text, .x-window-header, .panel-title, .modal-title, caption, h1, h2, h3, .title');
      const titleText = (titleEl ? titleEl.textContent || '' : (scope === document ? (document.title || '') : '')).toLowerCase();
      
      // Nếu rõ ràng là Sổ nhận xét, Sổ điểm chi tiết, Đánh giá học sinh thì TUYỆT ĐỐI KHÔNG CHẶN
      if (/sổ\s*nhận\s*xét|sổ\s*điểm|sổ\s*theo\s*dõi|đánh\s*giá\s*môn|sổ\s*điểm\s*chi\s*tiết|phẩm\s*chất|năng\s*lực/i.test(titleText)) {
        return false;
      }

      const disallowed = [
        'kế hoạch dạy học', 'kế hoạch bài dạy', 'khdh', 'lịch báo giảng',
        'thời khóa biểu', 'tkb', 'lịch giảng dạy', 'lịch công tác', 'lịch tuần',
        'phân công chuyên môn', 'phân công giảng dạy', 'hồ sơ cán bộ', 'hồ sơ giáo viên'
      ];
      for (const kw of disallowed) {
        if (titleText.includes(kw)) return true;
      }

      // Kiểm tra header cột của bảng trong scope
      const headerRows = Array.from(scope.querySelectorAll('.x-grid3-header, thead, .x-grid-header-row'));
      const headerText = headerRows.map(h => h.textContent || '').join(' ').toLowerCase();
      if ((headerText.includes('bài dạy') && headerText.includes('tiết ppct')) || headerText.includes('kế hoạch bài dạy') || headerText.includes('ngày áp dụng tkb')) {
        return true;
      }
      return false;
    }

    _getScope() {
      const allWindows = Array.from(document.querySelectorAll('.x-window, .modal-dialog, .modal'));
      // Ưu tiên 1: Cửa sổ Sổ nhận xét / Sổ điểm / Đánh giá học sinh
      for (const win of allWindows) {
        const style = window.getComputedStyle(win);
        if (style.display !== 'none' && style.visibility !== 'hidden' && win.offsetHeight >= 80) {
          const txt = (win.textContent || '').toLowerCase();
          if (txt.includes('sổ nhận xét') || txt.includes('sổ điểm') || txt.includes('nhận xét giữa kỳ') || txt.includes('nhận xét cuối kỳ')) {
            if (win.querySelector('.x-grid3-row, tbody tr, tr.x-grid-row, table')) {
              return win;
            }
          }
        }
      }

      // Ưu tiên 2: Cửa sổ hợp lệ khác có bảng
      for (const win of allWindows) {
        const style = window.getComputedStyle(win);
        if (style.display !== 'none' && style.visibility !== 'hidden' && win.offsetHeight >= 80) {
          if (this._isDisallowedScope(win)) {
            continue;
          }
          if (win.querySelector('.x-grid3-row, tbody tr, tr.x-grid-row, table')) {
            return win;
          }
        }
      }

      // Nếu có cửa sổ mở nhưng bị cấm (ví dụ: Kế hoạch dạy học), trả về chính cửa sổ đó để canHandle từ chối
      for (const win of allWindows) {
        const style = window.getComputedStyle(win);
        if (style.display !== 'none' && style.visibility !== 'hidden' && win.offsetHeight >= 80) {
          return win;
        }
      }

      return document;
    }

    canHandle() {
      const scope = this._getScope();
      if (this._isDisallowedScope(scope)) {
        return false;
      }

      // BẮT BUỘC: Phải là giao diện đánh giá học sinh hoặc sổ nhận xét
      const titleEl = scope.querySelector('.x-window-header-text, .x-panel-header-text, .x-window-header, .panel-title, .modal-title, caption, h1, h2, h3, .title');
      const titleText = (titleEl ? titleEl.textContent || '' : (document.title || '')).toLowerCase();
      const bodySnippet = (document.body ? document.body.innerText || '' : '').slice(0, 3000).toLowerCase();

      const isAssessmentTitle = /nhận\s*xét|đánh\s*giá|sổ\s*theo\s*dõi|sổ\s*điểm|bảng\s*điểm|phẩm\s*chất|năng\s*lực|ghi\s*học\s*bạ|sổ\s*gọi\s*tên|đánh\s*giá\s*môn|sổ\s*điểm\s*chi\s*tiết/i.test(titleText) ||
                                /sổ\s*nhận\s*xét|sổ\s*điểm\s*chi\s*tiết|nhận\s*xét\s*giữa\s*kỳ|nhận\s*xét\s*cuối\s*kỳ|danh\s*mục\s*nhận\s*xét/i.test(bodySnippet);

      // Kiểm tra header cột của bảng (gộp tất cả header của split grid)
      const allHeaders = Array.from(scope.querySelectorAll('.x-grid3-header, thead, .x-grid-header-row, [role="rowheader"]'));
      const headerText = allHeaders.map(h => (h.textContent || '').trim()).join(' ').toLowerCase();

      const hasStudentCol = /\b(?:họ\s*(?:và\s*)?tên|tên\s*học\s*sinh|mã\s*(?:học\s*sinh|hs)|học\s*sinh)\b/i.test(headerText) ||
                            (/\bhọ\s*đệm\b/i.test(headerText) && /\btên\b/i.test(headerText)) ||
                            bodySnippet.includes('họ và tên') || bodySnippet.includes('stt');

      // Nếu không có tiêu đề nhận xét và cũng không có cột học sinh -> KHÔNG PHẢI BẢNG NHẬN XÉT!
      if (!isAssessmentTitle && !hasStudentCol) {
        return false;
      }

      // Check for ExtJS or modern grid rows (bao gồm cả dòng bảng tbody tr trong cửa sổ ExtJS)
      const gridRows = scope.querySelectorAll(
        '.x-grid3-row, .x-grid-row, .x-grid-item, [role="row"], .ag-row, .slick-row, .grid-row, .table-row, tbody tr'
      );
      if (gridRows.length >= 2) {
        const hasInputs = scope.querySelector(
          '.x-grid3 textarea, .x-grid3-viewport textarea, .x-grid3-viewport input, .x-grid-row textarea, .x-grid-row input, [role="row"] textarea, [role="row"] input, .grid-row textarea, .grid-row input, textarea, input[type="text"], input:not([type])'
        );
        return !!hasInputs;
      }
      return false;
    }

    detectClass() {
      // 1. Quét các ô input/combobox trên thanh công cụ vnEdu (ExtJS input.x-form-text)
      const allInputs = Array.from(document.querySelectorAll('input.x-form-text, input.x-combo-text, input, select'));
      let detectedClass = '';
      let detectedGrade = '';
      let detectedSemester = '1';

      // 2. Tìm theo cặp Label và Input/Select kế bên
      const allLabels = Array.from(document.querySelectorAll('label, .x-form-item-label, span, td, div'));
      for (const lbl of allLabels) {
        const txt = (lbl.textContent || '').trim().toLowerCase();
        // Nhãn "Lớp:"
        if (/^lớp\s*[:\-]?$/i.test(txt) || /^chọn\s*lớp\s*[:\-]?$/i.test(txt)) {
          const nextInp = lbl.parentElement?.querySelector('input, select') || lbl.nextElementSibling?.querySelector?.('input, select') || lbl.nextElementSibling;
          const val = (nextInp?.value || nextInp?.textContent || '').trim();
          if (val && /^(?:1[0-2]|[1-9])[A-Za-z0-9_\-\/\.\s]+$/i.test(val)) {
            detectedClass = val;
          }
        }
        // Nhãn "Khối:"
        if (/^khối\s*[:\-]?$/i.test(txt)) {
          const nextInp = lbl.parentElement?.querySelector('input, select') || lbl.nextElementSibling?.querySelector?.('input, select') || lbl.nextElementSibling;
          const val = (nextInp?.value || nextInp?.textContent || '').trim();
          const match = val.match(/\b(1[0-2]|[1-9])\b/) || val.match(/(1[0-2]|[1-9])/);
          if (match) detectedGrade = match[1];
        }
        // Nhãn "Học kỳ:"
        if (/^học\s*k[ỳìyi]\s*[:\-]?$/i.test(txt)) {
          const nextInp = lbl.parentElement?.querySelector('input, select') || lbl.nextElementSibling?.querySelector?.('input, select') || lbl.nextElementSibling;
          const val = (nextInp?.value || nextInp?.textContent || '').trim();
          if (/2|II/i.test(val)) detectedSemester = '2';
          else if (/1|I/i.test(val)) detectedSemester = '1';
        }
      }

      // 3. Quét trực tiếp các giá trị input nếu chưa tìm thấy
      for (const inp of allInputs) {
        const val = (inp.tagName === 'SELECT' ? (inp.options[inp.selectedIndex]?.text || inp.value) : (inp.value || '')).trim();
        if (!detectedClass && /^(?:1[0-2]|[1-9])[A-Za-z0-9_\-\/\.\s]+$/i.test(val) && !/học|khối|toán|tiếng|tin|công|khoa|lịch|văn|lý|hóa|sinh|địa|sử|dân tộc|tất cả/i.test(val)) {
          detectedClass = val;
        }
        if (!detectedGrade && /khối\s*(1[0-2]|[1-9])/i.test(val)) {
          detectedGrade = val.match(/khối\s*(1[0-2]|[1-9])/i)[1];
        }
        if (/học\s*k[ỳìyi]\s*2|hk\s*2/i.test(val)) {
          detectedSemester = '2';
        }
      }

      // 4. Quét tiêu đề trang và văn bản phụ trợ
      const textSources = [
        document.title,
        ...Array.from(document.querySelectorAll('h1, h2, h3, .breadcrumb, .page-title, .x-panel-header-text, caption')).map(el => el.textContent || '')
      ].join(' ');

      if (!detectedClass) {
        const classMatch = textSources.match(/lớp\s*[:\-]?\s*((?:1[0-2]|[1-9])[A-Za-z0-9\/\-_]+)/i) ||
          textSources.match(/\b((?:1[0-2]|[1-9])[A-Za-z0-9]{1,4})\b/);
        if (classMatch) detectedClass = classMatch[1].trim();
      }

      // Quy tắc tương đương: Lớp bắt đầu bằng chữ số (1-12) thì Khối tương đương chính là tiền tố số đó (ví dụ: 10A1 -> Khối 10, 6B -> Khối 6, 1G2 -> Khối 1)
      if (detectedClass) {
        const gradeFromClass = (detectedClass.match(/^(1[0-2]|[1-9])/) || [])[1];
        if (gradeFromClass) detectedGrade = gradeFromClass;
      }
      if (!detectedGrade) {
        const gradeMatch = textSources.match(/khối\s*(1[0-2]|[1-9])/i);
        detectedGrade = gradeMatch ? gradeMatch[1] : '1';
      }

      const yearMatch = (document.body ? document.body.innerText.slice(0, 3000) : '').match(/(20\d{2}\s*-\s*20\d{2})/);

      return {
        className: detectedClass || '',
        grade: detectedGrade || '1',
        schoolYear: yearMatch ? yearMatch[1].replace(/\s+/g, '') : '',
        semester: detectedSemester || '1'
      };
    }

    _detectPeriod() {
      // 0. Ưu tiên đợt kiểm tra phát hiện chính xác từ cột bảng điểm đang mở
      if (this.detectedPeriod) return this.detectedPeriod;

      // 1. Quét tiêu đề các cột trong bảng điểm vnEdu (.x-grid3-header, thead, th, .x-grid3-hd)
      const headerTexts = Array.from(document.querySelectorAll('.x-grid3-header, thead, .x-grid-header, th, .x-grid3-hd-inner')).map(el => (el.textContent || '').trim().toLowerCase()).join(' ');
      if (/kt\s*gk1|xl\s*gk1|nhận\s*xét\s*giữa\s*k[ỳìyi]|\bgk1\b|giữa\s*k[ỳìyi]\s*1/i.test(headerTexts)) {
        return 'GK1';
      }
      if (/kt\s*ck1|xl\s*ck1|nhận\s*xét\s*cuối\s*k[ỳìyi]\s*1|nhận\s*xét\s*cuối\s*k[ỳìyi]|\bck1\b|cuối\s*k[ỳìyi]\s*1/i.test(headerTexts)) {
        return 'CK1';
      }
      if (/kt\s*gk2|xl\s*gk2|nhận\s*xét\s*giữa\s*k[ỳìyi]\s*2|\bgk2\b|giữa\s*k[ỳìyi]\s*2/i.test(headerTexts)) {
        return 'GK2';
      }
      if (/kt\s*ck2|xl\s*ck2|nhận\s*xét\s*cuối\s*năm|nhận\s*xét\s*cuối\s*k[ỳìyi]\s*2|\bck2\b|cả\s*năm|cuối\s*năm/i.test(headerTexts)) {
        return 'CK2';
      }

      // 1b. Nếu tiêu đề cột chứa ĐTBmhk / TBMhk / ĐTBcn -> Đây là sổ điểm tổng kết học kỳ
      const hasDtbColHeader = /(?:^|[^a-z0-9_à-ỹđ])(?:đtbmhk|tbmhk|đtbhk|đtbmcn|tbmcn|đtbcn|đtbm|tbm)(?:$|[^a-z0-9_à-ỹđ])/i.test(headerTexts);
      if (hasDtbColHeader) {
        const bodySlice = (document.title + ' ' + (document.body ? document.body.innerText.slice(0, 3000) : '')).toLowerCase();
        if (/học\s*k[ỳìyi]\s*2|\bhk2\b|cả\s*năm|\bcn\b/i.test(bodySlice)) {
          return 'CK2';
        }
        return 'CK1';
      }

      // 2. Quét các ô input/combobox trên thanh công cụ vnEdu
      const inputs = Array.from(document.querySelectorAll('input.x-form-text, input.x-combo-text, input, select'));
      for (const inp of inputs) {
        const val = (inp.tagName === 'SELECT' ? (inp.options[inp.selectedIndex]?.text || inp.value) : (inp.value || '')).trim().toLowerCase();
        if (/giữa\s*k[ỳìyi]\s*1|\bgk1\b/i.test(val)) return 'GK1';
        if (/cuối\s*k[ỳìyi]\s*1|\bck1\b/i.test(val)) return 'CK1';
        if (/giữa\s*k[ỳìyi]\s*2|\bgk2\b/i.test(val)) return 'GK2';
        if (/cuối\s*k[ỳìyi]\s*2|cuối\s*năm|\bck2\b|cả\s*năm/i.test(val)) return 'CK2';
      }

      // 3. Quét tiêu đề trang và văn bản
      const pageText = (document.title + ' ' + (document.body ? document.body.innerText.slice(0, 3000) : '')).toLowerCase();
      if (/giữa\s*k[ỳìyi]\s*1|\bgk1\b/i.test(pageText)) return 'GK1';
      if (/cuối\s*k[ỳìyi]\s*1|\bck1\b/i.test(pageText)) return 'CK1';
      if (/giữa\s*k[ỳìyi]\s*2|\bgk2\b/i.test(pageText)) return 'GK2';
      if (/cuối\s*k[ỳìyi]\s*2|học\s*k[ỳìyi]\s*2\s*cuối|cuối\s*năm|\bck2\b/i.test(pageText)) return 'CK2';
      return 'GK1';
    }

    detectSubject() {
      const SUBJECT_MATCHERS = [
        // Phân môn cụ thể của Tin học và Công nghệ (ưu tiên kiểm tra tên mở ngoặc trước)
        { name: 'Công nghệ', regex: /tin học\s*(?:và|&)?\s*công nghệ\s*\(\s*công nghệ\s*\)|công nghệ\s*\(\s*công nghệ\s*\)|(?:^|\b)công nghệ\b/i },
        { name: 'Tin học', regex: /tin học\s*(?:và|&)?\s*công nghệ\s*\(\s*tin học\s*\)|tin học\s*\(\s*tin học\s*\)|(?:^|\b)tin học\b|\bcntt\b/i },

        // Môn Tăng cường Tiếng Việt (TCTV, TC Tiếng Việt, Tăng Cường Tiếng Việt) - Phải đặt trước Tiếng Việt
        { name: 'Tăng Cường Tiếng Việt', regex: /(?:^|\b)(?:tăng\s*cường\s*tiếng\s*việt|tăng\s*cường\s*tv|t\.?c\.?\s*tiếng\s*việt|tc[\s\-_.]*tv|tctv)(?:\b|$)|tang\s*cuong\s*tieng\s*viet/i },

        // Môn Tăng cường Toán (TCT, TC Toán, Tăng Cường Toán) - Phải đặt trước Toán
        { name: 'Tăng Cường Toán', regex: /(?:^|\b)(?:tăng\s*cường\s*toán|t\.?c\.?\s*toán|tc[\s\-_.]*t|tct)(?:\b|$)|tang\s*cuong\s*toan/i },

        // Môn Ngoại ngữ (Tiếng Anh, Pháp, Trung, Nhật, Hàn, Nga, Đức, Ngoại ngữ 1, Ngoại ngữ 2)
        { name: 'Tiếng Pháp', regex: /tiếng\s*pháp|tieng\s*phap|\bpháp\b|french/i },
        { name: 'Tiếng Trung Quốc', regex: /tiếng\s*trung(?:\s*quốc)?|tieng\s*trung|\bmôn\s*tiếng\s*trung\b|chinese/i },
        { name: 'Tiếng Nhật', regex: /tiếng\s*nhật|tieng\s*nhat|\bmôn\s*tiếng\s*nhật\b|japanese/i },
        { name: 'Tiếng Hàn', regex: /tiếng\s*hàn|tieng\s*han|\bmôn\s*tiếng\s*hàn\b|korean/i },
        { name: 'Tiếng Nga', regex: /tiếng\s*nga|tieng\s*nga|russian/i },
        { name: 'Tiếng Đức', regex: /tiếng\s*đức|tiếng\s*duc|tieng\s*duc|german/i },
        { name: 'Ngoại ngữ 1', regex: /ngoại\s*ngữ\s*1|\bnn1\b/i },
        { name: 'Ngoại ngữ 2', regex: /ngoại\s*ngữ\s*2|\bnn2\b/i },
        { name: 'Tiếng Anh', regex: /tiếng anh|tieng anh|english|\banh văn\b|\bta\b|ngoại ngữ|ngoai ngu/i },

        // Môn Tiếng dân tộc thiểu số (Khmer, Chăm, Ê-đê, Ba Na, Jrai, Mông, Thái, Mơ Nông, Tày, Nùng...)
        { name: 'Tiếng dân tộc', regex: /tiếng\s*(?:dân\s*tộc|dtts|dt)|tieng\s*dan\s*toc|tiếng\s*(?:khmer|chăm|cham|ê\s*đê|e\s*de|ba\s*na|bana|jrai|gia\s*rai|mông|hmong|thái|thai|mơ\s*nông|mnong|tày|tay|nùng|nung|xơ\s*đăng|churu)|\bt\.?\s*dân\s*tộc\b|\bt\.\s*dt\b/i },

        // Chuyên đề học tập (THPT)
        { name: 'Chuyên đề học tập', regex: /chuyên\s*đề(?:\s*học\s*tập)?|\bcđht\b/i },

        // Tự nhiên và Xã hội (TN-XH, TNXH, TN - XH, TN&XH - Cấp 1)
        { name: 'Tự nhiên và Xã hội', regex: /tự\s*nhiên\s*(?:và|&)?\s*xã\s*hội|tu\s*nhien\s*(?:va|&)?\s*xa\s*hoi|\btn[\s\-_.]*xh\b|\bt\.?n\.?x\.?h\b/i },

        // Khoa học tự nhiên (KHTN - Cấp 2)
        { name: 'Khoa học tự nhiên', regex: /khoa học\s*tự nhiên|\bkhtn\b|\bk\.?h\.?t\.?n\b/i },

        // Lịch sử và Địa lí (LS-ĐL, LS&ĐL, LSDL - Cấp 1 & Cấp 2)
        { name: 'Lịch sử và Địa lí', regex: /lịch\s*sử\s*(?:và|&)?\s*địa\s*l[íy]|lich\s*su\s*(?:va|&)?\s*dia\s*l[iy]|\bls[\s\-_&.]*đl\b|\blsdl\b/i },

        // Lịch sử riêng (THPT) & Địa lí riêng (THPT)
        { name: 'Lịch sử', regex: /^lịch\s*sử\b|môn\s*lịch\s*sử|\bmôn\s*sử\b/i },
        { name: 'Địa lí', regex: /^địa\s*l[íy]\b|môn\s*địa\s*l[íy]|\bmôn\s*địa\b/i },

        // Vật lí, Hóa học, Sinh học (THPT / Bộ môn chuyên sâu)
        { name: 'Vật lí', regex: /vật\s*l[íy]|\bmôn\s*lý\b|\bmôn\s*lí\b/i },
        { name: 'Hóa học', regex: /hóa\s*học|\bmôn\s*hóa\b/i },
        { name: 'Sinh học', regex: /sinh\s*học|\bmôn\s*sinh\b/i },

        // Giáo dục kinh tế và pháp luật (GDKT&PL - THPT)
        { name: 'Giáo dục kinh tế và pháp luật', regex: /kinh\s*tế\s*(?:và|&)?\s*pháp\s*luật|\bgdkt[\s\-_&]*pl\b|\bktpl\b/i },

        // Giáo dục công dân (GDCD - THCS)
        { name: 'Giáo dục công dân', regex: /giáo\s*dục\s*công\s*dân|\bgdcd\b/i },

        // Giáo dục quốc phòng và an ninh (GDQP-AN - THPT)
        { name: 'Giáo dục quốc phòng và an ninh', regex: /quốc\s*phòng\s*(?:và|&)?\s*an\s*ninh|\bgdqp[\s\-_&]*an\b|\bgdqp\b/i },

        // Hoạt động trải nghiệm, hướng nghiệp
        { name: 'Hoạt động trải nghiệm, hướng nghiệp', regex: /hoạt\s*động\s*trải\s*nghiệm|\bhđtn\b|\btrải\s*nghiệm\b|\bhướng\s*nghiệp\b/i },

        // Nội dung giáo dục địa phương (GDĐP)
        { name: 'Nội dung giáo dục địa phương', regex: /giáo\s*dục\s*địa\s*phương|\bgdđp\b|\bđịa\s*phương\b/i },

        // Nghệ thuật / Âm nhạc / Mĩ thuật
        { name: 'Âm nhạc', regex: /nghệ thuật\s*\(\s*âm nhạc\s*\)|âm nhạc|\bam nhac\b|\bân\b/i },
        { name: 'Mĩ thuật', regex: /nghệ thuật\s*\(\s*mĩ thuật\s*\)|nghệ thuật\s*\(\s*mỹ thuật\s*\)|mĩ thuật|mỹ thuật|\bmt\b/i },
        { name: 'Nghệ thuật', regex: /nghệ thuật|\bnghe thuat\b/i },

        // Giáo dục thể chất
        { name: 'Giáo dục thể chất', regex: /giáo\s*dục\s*thể(?:\s*chất)?|\bthể\s*dục\b|\bgdtc\b/i },

        // Ngữ văn & Tiếng Việt
        { name: 'Tiếng Việt', regex: /tiếng việt|tieng viet|\bt\.việt\b/i },
        { name: 'Ngữ văn', regex: /ngữ văn|ngu van|\bmôn văn\b|\bvăn học\b/i },

        // Khoa học (Tiểu học) & Đạo đức (Tiểu học)
        { name: 'Khoa học', regex: /khoa học|khoa hoc/i },
        { name: 'Đạo đức', regex: /đạo đức|dao duc/i },

        // Đánh giá rèn luyện / Hạnh kiểm
        { name: 'Đánh giá rèn luyện', regex: /rèn luyện|hạnh kiểm/i },

        // Toán (áp dụng mọi khối)
        { name: 'Toán', regex: /(?:^|\b)(?:môn\s*)?toán(?:\s*(?:1[0-2]|[1-9]))?(?:\b|$)|toan/i }
      ];

      function matchSubject(str) {
        if (!str || typeof str !== 'string') return null;
        const clean = str.trim();
        if (!clean || /^(?:khối|lớp|học\s*k[ỳìyi]|tất\s*cả|phân\s*hiệu|chọn)/i.test(clean)) return null;
        for (const m of dynamicRemoteMatchers) {
          if (m.regex.test(clean)) return m.name;
        }
        for (const m of SUBJECT_MATCHERS) {
          if (m.regex.test(clean)) return m.name;
        }
        return null;
      }

      const scope = this._getScope();

      // ƯU TIÊN 1: Tìm ô chọn/combobox có nhãn "Môn" hoặc "Môn học" (Độ chính xác cao nhất)
      const allLabels = Array.from(scope.querySelectorAll('label, .x-form-item-label, span, th, td.header, .x-panel-header-text, .x-form-item, div'));
      for (const lbl of allLabels) {
        const txt = (lbl.textContent || '').trim();
        if (/^môn\s*(?:học)?\s*[:\-]?$/i.test(txt)) {
          const nextInput = lbl.parentElement?.querySelector('input, select') ||
                            lbl.nextElementSibling?.querySelector?.('input, select') ||
                            lbl.parentElement?.nextElementSibling?.querySelector?.('input, select') ||
                            lbl.closest('td, .x-form-item, .x-toolbar-cell, div')?.nextElementSibling?.querySelector?.('input, select') ||
                            lbl.nextElementSibling;
          const val = (nextInput?.tagName === 'SELECT'
            ? (nextInput.options[nextInput.selectedIndex]?.text || nextInput.value)
            : (nextInput?.value || nextInput?.textContent || '')).trim();
          const found = matchSubject(val);
          if (found) {
            return { subject: found, period: this._detectPeriod() };
          }
        }
      }

      // ƯU TIÊN 2: Tiêu đề trang / tiêu đề bảng điểm vnEdu (ví dụ: "Môn học: TCTV - Học kỳ 1", "Môn học: TN-XH - Học kỳ 1")
      const titleTexts = Array.from(scope.querySelectorAll('.breadcrumb, .page-title, h1, h2, h3, .title, caption, thead th, .x-panel-header-text, div, span, b, strong, td'))
        .map(el => el.textContent || '')
        .filter(t => /môn\s*(?:học)?\s*[:\-]/i.test(t));

      const titleSubRegex = /môn\s*(?:học)?\s*[:\-]?\s*([A-Za-zÀ-ỹ0-9\s&()_\-]+?)(?:\s+[\-\|]\s*(?:học\s*k[ỳìyi]|hk\d?|giáo\s*viên|gv|quyền)|\s*[\-\|]\s*học\s*k[ỳìyi]|\s*[\-\|]\s*hk|\s*$)/i;

      for (const t of titleTexts) {
        const match = t.match(titleSubRegex);
        if (match && match[1]) {
          const found = matchSubject(match[1].trim());
          if (found) {
            return { subject: found, period: this._detectPeriod() };
          }
        }
        // Fallback: nếu regex không bắt được nhóm con nhưng chuỗi có chứa tên môn
        const directFound = matchSubject(t);
        if (directFound) {
          return { subject: directFound, period: this._detectPeriod() };
        }
      }

      // ƯU TIÊN 3: Các thẻ input có name/id liên quan đến môn học
      const monInputs = Array.from(document.querySelectorAll('input[name*="mon"], input[id*="mon"], select[name*="mon"], select[id*="mon"]'));
      for (const inp of monInputs) {
        const val = (inp.tagName === 'SELECT' ? (inp.options[inp.selectedIndex]?.text || inp.value) : (inp.value || '')).trim();
        const found = matchSubject(val);
        if (found) {
          return { subject: found, period: this._detectPeriod() };
        }
      }

      // ƯU TIÊN 4: Duyệt các input/combobox ExtJS còn lại (lọc chặt chẽ qua matchSubject)
      const comboInputs = Array.from(document.querySelectorAll('input.x-form-text, input.x-combo-text, select'));
      for (const inp of comboInputs) {
        const val = (inp.tagName === 'SELECT' ? (inp.options[inp.selectedIndex]?.text || inp.value) : (inp.value || '')).trim();
        const found = matchSubject(val);
        if (found) {
          return { subject: found, period: this._detectPeriod() };
        }
      }

      return {
        subject: 'Toán',
        period: this._detectPeriod()
      };
    }

    _isHeaderRow(r) {
      if (!r) return true;
      if (
        r.closest?.('.x-grid3-header, thead, .x-grid-header') ||
        r.getAttribute?.('role')?.includes('header') ||
        r.classList?.contains?.('header-row') ||
        r.classList?.contains?.('ag-header-row') ||
        r.classList?.contains?.('x-grid3-header') ||
        r.classList?.contains?.('x-grid3-hd-row')
      ) {
        return true;
      }
      const txt = (r.textContent || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (/họ và tên|họ tên|họ đệm|tên học sinh/.test(txt) && /stt|mã|môn|nhận xét|đánh giá/.test(txt)) {
        return true;
      }
      return false;
    }

    _getSplitContainers() {
      const scope = this._getScope();
      const locked = scope.querySelector('.x-grid3-locked, .x-grid-inner-locked, [class*="-locked"]');
      let normal = null;
      if (locked) {
        const allScrollers = Array.from(scope.querySelectorAll('.x-grid3-scroller, .x-grid-inner-normal, [class*="-normal"], .x-grid3-viewport'));
        normal = allScrollers.find(el => !locked.contains(el)) || null;
      }
      if (!normal) {
        normal = scope.querySelector('.x-grid3-viewport, .x-grid-inner-normal, [class*="-normal"]') || scope;
      }
      return { locked, normal };
    }

    _analyzeMultiRowHeaders(headerRows, sampleDataRow) {
      if (!headerRows || headerRows.length === 0) return [];
      const grid = [];
      headerRows.forEach((r, rIdx) => {
        if (!grid[rIdx]) grid[rIdx] = [];
        const cells = Array.from(r.querySelectorAll ? r.querySelectorAll('th, td, [role="columnheader"]') : r.children);
        let colIdx = 0;
        cells.forEach(cell => {
          while (grid[rIdx][colIdx]) {
            colIdx++;
          }
          const colspan = Math.max(1, parseInt(cell.getAttribute ? (cell.getAttribute('colspan') || '1') : (cell.attributes?.colspan || '1'), 10) || 1);
          const rowspan = Math.max(1, parseInt(cell.getAttribute ? (cell.getAttribute('rowspan') || '1') : (cell.attributes?.rowspan || '1'), 10) || 1);
          for (let rOffset = 0; rOffset < rowspan; rOffset++) {
            const targetR = rIdx + rOffset;
            if (!grid[targetR]) grid[targetR] = [];
            for (let cOffset = 0; cOffset < colspan; cOffset++) {
              grid[targetR][colIdx + cOffset] = cell;
            }
          }
          colIdx += colspan;
        });
      });

      const maxCols = Math.max(
        ...grid.map(row => row.length),
        sampleDataRow ? (sampleDataRow.querySelectorAll ? sampleDataRow.querySelectorAll('td, [role="gridcell"], .x-grid3-cell').length : (sampleDataRow.children ? sampleDataRow.children.length : 0)) : 0
      );

      const columns = [];
      for (let c = 0; c < maxCols; c++) {
        const cellsInCol = [];
        const textsInCol = [];
        let colClass = '';
        for (let r = 0; r < grid.length; r++) {
          const cell = grid[r] ? grid[r][c] : null;
          if (cell && !cellsInCol.includes(cell)) {
            cellsInCol.push(cell);
            const t = (cell.textContent || '').trim().replace(/\s+/g, ' ');
            if (t) textsInCol.push(t);
            if (!colClass && cell.className) {
              const match = cell.className.match(/(?:x-grid3-td-|x-grid3-hd-|x-grid3-col-)([a-zA-Z0-9_\-]+)/);
              if (match) colClass = 'x-grid3-td-' + match[1];
            }
          }
        }
        columns.push({
          index: c,
          combinedText: textsInCol.join(' '),
          bottomText: textsInCol.length > 0 ? textsInCol[textsInCol.length - 1] : '',
          texts: textsInCol,
          colClass,
          cells: cellsInCol
        });
      }
      return columns;
    }

    _analyzeHeaderColumns() {
      this.ratingColumnIndex = -1;
      this.scoreColumnIndex = -1;
      this.commentColumnIndex = -1;
      this.ratingColClass = '';
      this.scoreColClass = '';
      this.commentColClass = '';
      this.scoreColumns = [];

      const { locked, normal } = this._getSplitContainers();
      const scope = normal || this._getScope();

      // Find header row in viewport / scroller table (excluding locked header)
      let allHeaderRows = Array.from(scope.querySelectorAll(
        '.x-grid3-header .x-grid3-hd-row, thead tr, .x-grid-header-row, [role="rowheader"]'
      )).filter(r => !locked || !locked.contains(r));

      if (allHeaderRows.length === 0) {
        allHeaderRows = Array.from(document.querySelectorAll(
          '.x-grid3-header .x-grid3-hd-row, thead tr, .x-grid-header-row, [role="rowheader"]'
        )).filter(r => !locked || !locked.contains(r));
      }

      const sampleRow = scope.querySelector('.x-grid3-row, tbody tr, .x-grid-row');
      const sampleCells = sampleRow ? Array.from(sampleRow.querySelectorAll('td, [role="gridcell"], .x-grid3-cell')) : [];
      const hasSttInSample = sampleCells.length >= 4 && (
        /^\s*\d{1,3}\s*$/.test(sampleCells[0]?.textContent || '') ||
        /^\s*\d{6,}\s*$/.test(sampleCells[1]?.textContent || '') ||
        sampleCells[0]?.className?.includes('numberer') ||
        sampleCells[0]?.className?.includes('stt')
      );

      // Phân tích ma trận tiêu đề 2D hỗ trợ đầy đủ multi-row header (ví dụ ĐĐGtx colspan 5 với subheader TX1..TX5)
      const mappedColumns = this._analyzeMultiRowHeaders(allHeaderRows, sampleRow);

      if (mappedColumns.length > 0) {
        mappedColumns.forEach(col => {
          const rawTxt = col.combinedText || '';
          const txt = (rawTxt.normalize ? rawTxt.normalize('NFC') : rawTxt).toLowerCase();
          const colClass = col.colClass || '';

          // TUYỆT ĐỐI BỎ QUA các cột định danh học sinh: STT, Mã HS, Họ tên, Ngày sinh, SMS/Liên lạc
          if (col.index === 0 && hasSttInSample) {
            return; // Cột 0 trong bảng có học sinh là STT, không bao giờ là cột điểm!
          }
          if (/^stt$|^số\s*tt$|^thứ\s*tự$/i.test(txt) || /numberer/i.test(colClass)) {
            return;
          }
          if (/\b(?:mã\s*(?:học\s*sinh|hs)|họ\s*(?:và\s*)?tên|ngày\s*sinh|liên\s*lạc)\b/i.test(txt) && !/(?:^|[^a-z0-9_à-ỹđ])(?:đđgtx|đgtx|tx|gk|ck|đtb)(?:$|[^a-z0-9_à-ỹđ])/i.test(txt)) {
            return;
          }

          // 1. Phân loại cột Nhận xét
          const isCommentCol = /nhận\s*xét|đánh\s*giá\s*sự\s*tiến\s*bộ|nx\s*môn|lời\s*nhận\s*xét|ý\s*kiến\s*gv/i.test(txt) &&
                               !/(?:^|[^a-z0-9_à-ỹđ])(?:xl|xếp\s*loại|mức\s*(?:đạt|đánh\s*giá)|kết\s*quả)(?:$|[^a-z0-9_à-ỹđ])/i.test(txt);

          // 2. Phân loại cột Xếp loại / Mức đạt (T, H, C ở Tiểu học hoặc Đ, CĐ ở THCS/THPT)
          // ĐẶC BIỆT: Cột XL GK1, XL CK1, XL GK2, XL CK2, XL HK1, XL HK2, XL, Xếp loại, Mức đạt
          // BẮT BUỘC phải nhận diện là cột Rating, tuyệt đối không để rơi vào scoreType GK/CK!
          const isRatingCol = /(?:^|[^a-z0-9_à-ỹđ])(?:xl(?:[12]|gk[12]?|ck[12]?|hk[12]?|cn)?|xếp\s*loại|mức\s*(?:đạt|đánh\s*giá)|^mức\b|đánh\s*giá(?:\s*định\s*kỳ)?|kết\s*quả\s*đánh\s*giá|kết\s*quả\s*đg|đgk[12]?|đck[12]?)(?:$|[^a-z0-9_à-ỹđ])/i.test(txt);

          // 3. Phân loại cột Điểm số (Chỉ khi KHÔNG PHẢI là cột xếp loại hoặc nhận xét)
          // Lưu ý quan trọng: Dùng pattern boundary Unicode để nhận diện chính xác các ký tự tiếng Việt ĐTBmhk, ĐĐGck, ĐĐGgk, ĐĐGtx
          let scoreType = null;
          if (!isCommentCol && !isRatingCol) {
            if (/(?:^|[^a-z0-9_à-ỹđ])(?:đtbmhk|tbmhk|đtbhk|đtbmcn|tbmcn|đtbcn|đtbm|tbm|đtb\s*môn|đtb)(?:$|[^a-z0-9_à-ỹđ])/i.test(txt)) {
              scoreType = 'DTB';
            } else if (/(?:^|[^a-z0-9_à-ỹđ])(?:đđgck|đgck|ktck|ck[12]?|cuối\s*k[ỳìyi]|thi\s*(?:hk|học\s*k[ỳìyi])?|điểm\s*thi)(?:$|[^a-z0-9_à-ỹđ])/i.test(txt)) {
              scoreType = 'CK';
            } else if (/(?:^|[^a-z0-9_à-ỹđ])(?:đđggk|đggk|ktgk|gk[12]?|giữa\s*k[ỳìyi])(?:$|[^a-z0-9_à-ỹđ])/i.test(txt)) {
              scoreType = 'GK';
            } else if (/(?:^|[^a-z0-9_à-ỹđ])(?:đđgtx|đgtx|tx[1-9]|tx|thường\s*xuyên|miệng|15p|15\s*phút|1\s*tiết)(?:$|[^a-z0-9_à-ỹđ])/i.test(txt)) {
              scoreType = 'TX';
            } else if (/^điểm\b|\bđiểm\s*số\b|\bđiểm\s*kt\b|\bktđk\b|^đkt$/i.test(txt)) {
              scoreType = 'GENERAL';
            }
          }

          if (isCommentCol) {
            this.commentColumnIndex = col.index;
            if (colClass) this.commentColClass = colClass;
          } else if (isRatingCol) {
            this.ratingColumnIndex = col.index;
            if (colClass) this.ratingColClass = colClass;
          } else if (scoreType) {
            this.scoreColumns.push({
              index: col.index,
              type: scoreType,
              name: rawTxt,
              colClass: colClass
            });
          }

          // Nhận diện đợt kiểm tra chuẩn trực tiếp từ tiêu đề cột
          if (/giữa\s*k[ỳìyi]\s*1|\bgk1\b|nhận\s*xét\s*giữa\s*k[ỳìyi]/i.test(txt)) {
            this.detectedPeriod = 'GK1';
          } else if (/cuối\s*k[ỳìyi]\s*1|\bck1\b|nhận\s*xét\s*cuối\s*k[ỳìyi]\s*1/i.test(txt)) {
            this.detectedPeriod = 'CK1';
          } else if (/giữa\s*k[ỳìyi]\s*2|\bgk2\b|nhận\s*xét\s*giữa\s*k[ỳìyi]/i.test(txt)) {
            this.detectedPeriod = 'GK2';
          } else if (/cuối\s*k[ỳìyi]\s*2|\bck2\b|cuối\s*năm|cả\s*năm|\bcn\b|nhận\s*xét\s*cuối\s*(?:k[ỳìyi]\s*2|năm)/i.test(txt)) {
            this.detectedPeriod = 'CK2';
          } else if (/(?:^|[^a-z0-9_à-ỹđ])(?:đtbmhk|tbmhk|đtbhk)(?:$|[^a-z0-9_à-ỹđ])/i.test(txt)) {
            if (!this.detectedPeriod) this.detectedPeriod = 'CK1';
          } else if (/(?:^|[^a-z0-9_à-ỹđ])(?:đtbmcn|tbmcn|đtbcn)(?:$|[^a-z0-9_à-ỹđ])/i.test(txt)) {
            if (!this.detectedPeriod) this.detectedPeriod = 'CK2';
          }
        });
      }

      // Lựa chọn cột điểm số đại diện chính theo độ ưu tiên: DTB > CK > GK > TX > GENERAL
      if (this.scoreColumns.length > 0) {
        const priorityOrder = { DTB: 1, CK: 2, GK: 3, TX: 4, GENERAL: 5 };
        const sortedScores = [...this.scoreColumns].sort((a, b) => {
          return (priorityOrder[a.type] || 99) - (priorityOrder[b.type] || 99);
        });
        const bestScore = sortedScores[0];
        this.scoreColumnIndex = bestScore.index;
        if (bestScore.colClass) this.scoreColClass = bestScore.colClass;
      }

      // BẢO VỆ CHỐNG NHẦM STT: Nếu bảng có thông tin học sinh, không bao giờ để scoreColumnIndex < 4 hoặc scoreColumns chứa cột 0
      if (hasSttInSample) {
        this.scoreColumns = this.scoreColumns.filter(sc => sc.index >= 4 || (sc.colClass && !/numberer|stt|col-stt/.test(sc.colClass)));
        if (this.scoreColumnIndex >= 0 && this.scoreColumnIndex < 4) {
          this.scoreColumnIndex = this.scoreColumns.length > 0 ? this.scoreColumns[0].index : -1;
        }
      }
    }

    detectStudents() {
      const { locked } = this._getSplitContainers();
      const scope = locked || this._getScope();

      // Nếu phạm vi này thuộc blacklist (như Kế hoạch dạy học, TKB...):
      if (this._isDisallowedScope(scope)) {
        return [];
      }

      // Nếu bảng không có locked container, kiểm tra tất cả header
      if (!locked) {
        const allHeaders = Array.from(scope.querySelectorAll('.x-grid3-header, thead, .x-grid-header-row, [role="rowheader"]'));
        const headerText = allHeaders.map(h => (h.textContent || '').trim()).join(' ').toLowerCase();
        const hasStudentHeader = /\b(?:họ\s*(?:và\s*)?tên|tên\s*học\s*sinh|mã\s*(?:học\s*sinh|hs)|học\s*sinh)\b/i.test(headerText) ||
                                 (/\bhọ\s*đệm\b/i.test(headerText) && /\btên\b/i.test(headerText));
        if (!hasStudentHeader && /bài\s*dạy|tiết\s*ppct/i.test(headerText)) {
          return [];
        }
      }

      const rowElements = Array.from(
        scope.querySelectorAll('.x-grid3-row, .x-grid-row, .x-grid-item, [role="row"], .ag-row, .slick-row, .grid-row, .table-row, tbody tr')
      ).filter(r => !this._isHeaderRow(r));

      const students = [];

      rowElements.forEach((row, idx) => {
        const cells = Array.from(
          row.querySelectorAll('td, [role="gridcell"], [role="cell"], .ag-cell, .slick-cell, .x-grid3-cell, .cell, div')
        );

        let studentName = '';
        let studentId = '';
        let hoDem = '';
        let ten = '';

        // Search for potential split name cells or full name cells
        for (let i = 0; i < cells.length; i++) {
          let txt = VietnameseNameDetector.cleanStudentName((cells[i].textContent || '').trim());
          if (!txt) continue;
          if (txt.normalize) txt = txt.normalize('NFC');

          if (!studentId && /^(HS| học sinh|SV)?\d{4,}$/i.test(txt)) {
            studentId = txt;
          } else if (!VietnameseNameDetector.isHeaderOrLabel(txt)) {
            // 1. Check if current cell combined with next cell forms a valid Vietnamese name (e.g. "Thạch" + "Bảo")
            if (i + 1 < cells.length) {
              let nextTxt = VietnameseNameDetector.cleanStudentName((cells[i + 1].textContent || '').trim());
              if (nextTxt && nextTxt.normalize) nextTxt = nextTxt.normalize('NFC');
              const combined = `${txt} ${nextTxt}`.trim();
              if (VietnameseNameDetector.isVietnameseName(combined) && !VietnameseNameDetector.isHeaderOrLabel(nextTxt)) {
                studentName = combined;
                break;
              }
            }

            // 2. Or if current cell is already a full Vietnamese name (2+ words)
            if (VietnameseNameDetector.isVietnameseName(txt)) {
              studentName = txt;
              break;
            }
          }
        }

        if (studentName && studentName.normalize) studentName = studentName.normalize('NFC');

        if (studentName && !VietnameseNameDetector.isHeaderOrLabel(studentName)) {
          // Bảng locked chỉ chứa STT và Tên, tuyệt đối không quét xếp loại/điểm số từ bảng này để tránh nhầm STT thành điểm!
          students.push({
            index: idx + 1,
            studentName,
            studentId,
            rowElement: row,
            rating: null,
            score: null
          });
        }
      });

      return students;
    }

    detectCommentFields() {
      const { normal } = this._getSplitContainers();
      const scope = normal || this._getScope();

      // Nếu phạm vi này thuộc blacklist (như Kế hoạch dạy học):
      if (this._isDisallowedScope(scope)) {
        return [];
      }

      const rowElements = Array.from(
        scope.querySelectorAll('.x-grid3-row, .x-grid-row, .x-grid-item, [role="row"], .ag-row, .slick-row, .grid-row, .table-row, tbody tr')
      ).filter(r => !this._isHeaderRow(r));

      const fields = [];

      rowElements.forEach((row, idx) => {
        // 1. Ưu tiên cao nhất: Thẻ textarea trong hàng (chuẩn tuyệt đối cho ô nhận xét vnEdu)
        const textareas = Array.from(row.querySelectorAll('textarea'));
        let targetEl = textareas[0] || null;

        // 2. Nếu đã xác định được class cột nhận xét của ExtJS
        if (!targetEl && this.commentColClass) {
          const cell = row.querySelector('.' + this.commentColClass);
          if (cell) {
            targetEl = cell.querySelector('textarea, input[type="text"], input:not([type]), [contenteditable="true"]') || cell;
          }
        }

        // 3. Nếu đã xác định được chỉ số cột nhận xét
        if (!targetEl && this.commentColumnIndex >= 0) {
          const cells = Array.from(row.querySelectorAll('td, [role="gridcell"], .x-grid3-cell'));
          if (cells[this.commentColumnIndex]) {
            targetEl = cells[this.commentColumnIndex].querySelector('textarea, input[type="text"], input:not([type]), [contenteditable="true"]') || cells[this.commentColumnIndex];
          }
        }

        // 4. Fallback: chấm điểm confidence trên các input
        if (!targetEl) {
          const inputs = Array.from(
            row.querySelectorAll('textarea, input[type="text"], input:not([type]), [contenteditable="true"]')
          );
          let bestScore = 0;
          for (const inp of inputs) {
            const score = ConfidenceModule.calculateFieldConfidence(inp, { rowHasStudentName: true });
            if (score > bestScore) {
              bestScore = score;
              targetEl = inp;
            }
          }
        }

        if (targetEl) {
          fields.push({
            index: idx + 1,
            element: targetEl,
            rowElement: row,
            confidence: 95,
            tagName: targetEl.tagName.toLowerCase()
          });
        }
      });

      return fields;
    }

    mapStudentsToFields(students, fields, options = {}) {
      this._analyzeHeaderColumns();
      const mapping = [];
      const validStudents = students.filter(
        st => st.studentName && !VietnameseNameDetector.isHeaderOrLabel(st.studentName)
      );

      // Check if students and fields are in the same rows
      const fieldMapByRow = new Map();
      fields.forEach(f => {
        if (f.rowElement) fieldMapByRow.set(f.rowElement, f);
      });

      let sameRowMatches = 0;
      validStudents.forEach(st => {
        if (st.rowElement && fieldMapByRow.has(st.rowElement)) {
          sameRowMatches++;
        }
      });

      if (sameRowMatches > 0 && sameRowMatches >= validStudents.length * 0.5) {
        // Single row layout
        validStudents.forEach(st => {
          const f = fieldMapByRow.get(st.rowElement);
          if (f) {
            const ratingScore = VnEduBaseAdapter.extractRowRatingAndScore(
              f.rowElement,
              null,
              this.ratingColumnIndex,
              this.scoreColumnIndex,
              {
                isScored: options.isScored,
                educationLevel: options.educationLevel,
                ratingColClass: this.ratingColClass,
                scoreColClass: this.scoreColClass,
                scoreColumns: this.scoreColumns
              }
            );
            const r = ratingScore.rating || null;
            const s = (options.isScored !== false && ratingScore.score !== null) ? ratingScore.score : null;

            mapping.push({
              student: st,
              commentField: f,
              rating: r,
              score: s,
              hasRating: !!ratingScore.rating,
              hasScore: s !== null,
              status: 'READY'
            });
          }
        });
        return mapping;
      }

      // Split layout (ExtJS locked table vs normal viewport table)
      // Pair 1-to-1 by index
      const count = Math.min(validStudents.length, fields.length);
      for (let i = 0; i < count; i++) {
        const st = validStudents[i];
        const f = fields[i];
        if (st && f) {
          // Cross-link row elements for verifyRowIntegrity
          f.pairRowElement = st.rowElement;
          st.pairRowElement = f.rowElement;

          // In split ExtJS grid, rating cell (XL GK1) is strictly in f.rowElement (viewport table)
          const ratingScore = VnEduBaseAdapter.extractRowRatingAndScore(
            f.rowElement,
            null,
            this.ratingColumnIndex,
            this.scoreColumnIndex,
            {
              isScored: options.isScored,
              educationLevel: options.educationLevel,
              ratingColClass: this.ratingColClass,
              scoreColClass: this.scoreColClass,
              scoreColumns: this.scoreColumns
            }
          );
          const r = ratingScore.rating || null;
          const s = (options.isScored !== false && ratingScore.score !== null) ? ratingScore.score : null;

          mapping.push({
            student: st,
            commentField: f,
            rating: r,
            score: s,
            hasRating: !!ratingScore.rating,
            hasScore: s !== null,
            status: 'READY'
          });
        }
      }

      return mapping;
    }

    validateMapping(mapping, options = {}) {
      const students = mapping.map(m => m.student);
      const fields = mapping.map(m => m.commentField);
      return ConfidenceModule.calculateMappingConfidence(students, fields, options);
    }

    fillRatingCell(mappingItem, level, options = {}) {
      if (!level || !mappingItem || !mappingItem.commentField) return false;
      const row = mappingItem.commentField.rowElement;
      if (!row) return false;

      // 1. Tìm ô xếp loại (XL GK1 / XL CK1)
      let ratingCell = null;
      if (this.ratingColClass) {
        ratingCell = row.querySelector('.' + this.ratingColClass);
      }
      if (!ratingCell && this.ratingColumnIndex >= 0) {
        const cells = Array.from(row.querySelectorAll('td, [role="gridcell"], .x-grid3-cell'));
        ratingCell = cells[this.ratingColumnIndex];
      }
      if (!ratingCell) {
        ratingCell = row.querySelector('[class*="xl" i], [data-index*="xl" i]');
      }
      if (!ratingCell) return false;

      // BẢO VỆ TUYỆT ĐỐI: Không bao giờ được ghi xếp loại vào ô nhận xét (textarea hoặc ô chứa commentField)
      if (ratingCell.querySelector?.('textarea') || ratingCell.tagName === 'TEXTAREA') {
        return false;
      }
      if (mappingItem.commentField && mappingItem.commentField.element) {
        const cEl = mappingItem.commentField.element;
        if (ratingCell === cEl || ratingCell.contains(cEl)) {
          return false;
        }
      }

      // Kiểm tra giá trị hiện tại của ô xếp loại
      const currentVal = (ratingCell.querySelector?.('input, select')?.value || ratingCell.textContent || '').trim();
      const currentParsed = VnEduBaseAdapter.parseCellRatingAndScore(currentVal, { allowScore: false });

      // Nếu ô đã có xếp loại và không có cờ ép buộc ghi đè thì giữ nguyên
      if (currentParsed.rating && options.forceOverwriteRating !== true) {
        return true;
      }

      const ratingText = String(level).toUpperCase(); // 'T', 'H', 'C'

      // 2. Nếu trong ô đã có input/select
      const input = ratingCell.querySelector('input, select');
      if (input) {
        DOMUtils.setFieldValue(input, ratingText);
      } else {
        // 3. Trong ExtJS grid, cell là <td> chứa <div class="x-grid3-cell-inner">
        const innerDiv = ratingCell.querySelector('.x-grid3-cell-inner') || ratingCell;
        innerDiv.textContent = ratingText;
        innerDiv.innerText = ratingText;
        ratingCell.setAttribute('data-rating', ratingText);

        try {
          if (typeof MouseEvent !== 'undefined') {
            const clickEvt = new MouseEvent('click', { bubbles: true, cancelable: true });
            innerDiv.dispatchEvent(clickEvt);
            const dblEvt = new MouseEvent('dblclick', { bubbles: true, cancelable: true });
            innerDiv.dispatchEvent(dblEvt);
          }

          const activeInput = ratingCell.querySelector('input') || (typeof document !== 'undefined' ? document.querySelector('.x-grid-editor input, .x-editor input') : null);
          if (activeInput) {
            DOMUtils.setFieldValue(activeInput, ratingText);
            if (typeof KeyboardEvent !== 'undefined') {
              activeInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', keyCode: 13 }));
            }
          }
        } catch (e) {}

        try {
          if (typeof Event !== 'undefined') {
            innerDiv.dispatchEvent(new Event('input', { bubbles: true }));
            innerDiv.dispatchEvent(new Event('change', { bubbles: true }));
          }
        } catch (e) {}
      }

      // 4. Nếu ExtJS Store có sẵn, cập nhật vào record của Grid
      try {
        const win = (row.ownerDocument && row.ownerDocument.defaultView) || (typeof window !== 'undefined' ? window : global);
        if (win.Ext && win.Ext.getCmp) {
          const gridEl = row.closest('.x-grid3, .x-grid, .x-panel');
          if (gridEl) {
            const grid = win.Ext.getCmp(gridEl.id);
            if (grid && typeof grid.getStore === 'function') {
              const rowIndex = Array.from(row.parentElement ? row.parentElement.children : []).indexOf(row);
              if (rowIndex >= 0) {
                const record = grid.getStore().getAt(rowIndex);
                if (record && record.set) {
                  for (const fName in record.data) {
                    if (/^xl\b|\bxl\b|xep_?loai|rating|muc_?dat/i.test(fName)) {
                      record.set(fName, ratingText);
                    }
                  }
                }
              }
            }
          }
        }
      } catch (e) {}

      return true;
    }

    writeRatingToGridCell(cell, ratingValue) {
      if (!cell || ratingValue === undefined || ratingValue === null) return false;
      const innerDiv = cell.querySelector('.x-grid3-cell-inner') || cell;

      // Chuẩn hóa sang số theo quy tắc vnEdu: "Đ" -> 1, "C" -> 2, "T" -> 3
      let numericVal = ratingValue;
      const s = String(ratingValue).trim().toUpperCase();
      if (s === 'Đ' || s === 'D' || s === '1') numericVal = 1;
      else if (s === 'C' || s === '2') numericVal = 2;
      else if (s === 'T' || s === '3') numericVal = 3;

      const textVal = String(numericVal);

      // 1. Cập nhật DOM trực quan với mã số 1, 2, 3
      innerDiv.textContent = textVal;
      innerDiv.innerText = textVal;
      cell.setAttribute('data-value', textVal);
      cell.setAttribute('data-rating', textVal);

      // Thêm cờ đỏ dirty cell của ExtJS
      cell.classList.add('x-grid3-dirty-cell');

      // 2. Kích hoạt sự kiện ExtJS (chuột và phím số 1, 2, 3)
      try {
        cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        cell.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        cell.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        const keyCode = 48 + Number(numericVal);
        cell.dispatchEvent(new KeyboardEvent('keydown', { key: textVal, keyCode: keyCode, bubbles: true }));
        cell.dispatchEvent(new KeyboardEvent('keypress', { key: textVal, keyCode: keyCode, bubbles: true }));
        cell.dispatchEvent(new KeyboardEvent('keyup', { key: textVal, keyCode: keyCode, bubbles: true }));
      } catch (e) {}

      // 3. Hiệu ứng nhấp nháy xanh lá báo hiệu đã điền
      try {
        cell.style.transition = 'background-color 0.3s ease';
        cell.style.backgroundColor = '#DCFCE7';
        setTimeout(() => {
          cell.style.backgroundColor = '';
        }, 700);
      } catch (e) {}

      return true;
    }

    isCompetencySummaryGrid() {
      const scope = this._getScope();
      const allHeaders = Array.from(scope.querySelectorAll('.x-grid3-header, thead, .x-grid-header-row, [role="rowheader"]'));
      const headerText = allHeaders.map(h => (h.textContent || '').trim()).join(' ').toLowerCase();

      const hasCompetency = /năng\s*lực(?:\s*cốt\s*lõi|\s*chung|\s*đặc\s*thù)?/i.test(headerText) ||
                            (headerText.includes('tự chủ') && headerText.includes('giao tiếp'));
      const hasQuality = /phẩm\s*chất(?:\s*chủ\s*yếu)?/i.test(headerText) ||
                         (headerText.includes('yêu nước') && headerText.includes('nhân ái'));
      const hasSubject = /môn\s*học/i.test(headerText) ||
                         (headerText.includes('tiếng việt') && headerText.includes('toán'));

      return hasCompetency && hasQuality && hasSubject;
    }

    getSummaryGridStructure() {
      const { locked, normal } = this._getSplitContainers();
      const scope = normal || this._getScope();

      let allHeaderRows = Array.from(scope.querySelectorAll(
        '.x-grid3-header .x-grid3-hd-row, thead tr, .x-grid-header-row, [role="rowheader"]'
      )).filter(r => !locked || !locked.contains(r));

      if (allHeaderRows.length === 0) {
        allHeaderRows = Array.from(document.querySelectorAll(
          '.x-grid3-header .x-grid3-hd-row, thead tr, .x-grid-header-row, [role="rowheader"]'
        )).filter(r => !locked || !locked.contains(r));
      }

      const sampleRow = scope.querySelector('.x-grid3-row, tbody tr, .x-grid-row');
      const mappedColumns = this._analyzeMultiRowHeaders(allHeaderRows, sampleRow);

      const subjectColumns = {};
      const targetColumns = [];

      mappedColumns.forEach(col => {
        const rawTxt = col.combinedText || '';
        const txt = (rawTxt.normalize ? rawTxt.normalize('NFC') : rawTxt).toLowerCase();
        const isTargetSection = /năng\s*lực|phẩm\s*chất/i.test(txt);

        if (isTargetSection) {
          // 1. Target columns trong khung đỏ:
          if (/tự\s*chủ/i.test(txt)) {
            targetColumns.push({ key: 'tự chủ và tự học', name: 'Tự chủ và tự học', index: col.index, colClass: col.colClass });
          } else if (/giao\s*tiếp/i.test(txt)) {
            targetColumns.push({ key: 'giao tiếp và hợp tác', name: 'Giao tiếp và hợp tác', index: col.index, colClass: col.colClass });
          } else if (/gqvđ|giải\s*quyết\s*vấn\s*đề|sáng\s*tạo/i.test(txt)) {
            targetColumns.push({ key: 'gqvd và sáng tạo', name: 'GQVĐ và sáng tạo', index: col.index, colClass: col.colClass });
          } else if (/ngôn\s*ngữ/i.test(txt)) {
            targetColumns.push({ key: 'ngôn ngữ', name: 'Ngôn ngữ', index: col.index, colClass: col.colClass });
          } else if (/tính\s*toán/i.test(txt)) {
            targetColumns.push({ key: 'tính toán', name: 'Tính toán', index: col.index, colClass: col.colClass });
          } else if (/khoa\s*học/i.test(txt)) {
            targetColumns.push({ key: 'khoa học', name: 'Khoa học', index: col.index, colClass: col.colClass });
          } else if (/công\s*nghệ/i.test(txt)) {
            targetColumns.push({ key: 'công nghệ', name: 'Công nghệ', index: col.index, colClass: col.colClass });
          } else if (/tin\s*học/i.test(txt)) {
            targetColumns.push({ key: 'tin học', name: 'Tin học', index: col.index, colClass: col.colClass });
          } else if (/thẩm\s*m[ĩỹ]/i.test(txt)) {
            targetColumns.push({ key: 'thẩm mĩ', name: 'Thẩm mĩ', index: col.index, colClass: col.colClass });
          } else if (/thể\s*chất/i.test(txt)) {
            targetColumns.push({ key: 'thể chất', name: 'Thể chất', index: col.index, colClass: col.colClass });
          } else if (/yêu\s*nước/i.test(txt)) {
            targetColumns.push({ key: 'yêu nước', name: 'Yêu nước', index: col.index, colClass: col.colClass });
          } else if (/nhân\s*ái/i.test(txt)) {
            targetColumns.push({ key: 'nhân ái', name: 'Nhân ái', index: col.index, colClass: col.colClass });
          } else if (/chăm\s*chỉ/i.test(txt)) {
            targetColumns.push({ key: 'chăm chỉ', name: 'Chăm chỉ', index: col.index, colClass: col.colClass });
          } else if (/trung\s*thực/i.test(txt)) {
            targetColumns.push({ key: 'trung thực', name: 'Trung thực', index: col.index, colClass: col.colClass });
          } else if (/trách\s*nhiệm/i.test(txt)) {
            targetColumns.push({ key: 'trách nhiệm', name: 'Trách nhiệm', index: col.index, colClass: col.colClass });
          }
        } else {
          // 2. Subject columns ở bên trái:
          const isScore = /điểm|ktđk|đkt/i.test(txt);
          const isRating = /mức|đạt|xl/i.test(txt) || !isScore;

          if (/tiếng\s*việt/i.test(txt)) {
            if (isScore) subjectColumns['Tiếng Việt__score'] = col;
            else if (isRating) subjectColumns['Tiếng Việt__rating'] = col;
          } else if (/toán/i.test(txt)) {
            if (isScore) subjectColumns['Toán__score'] = col;
            else if (isRating) subjectColumns['Toán__rating'] = col;
          } else if (/khoa\s*học/i.test(txt)) {
            if (isScore) subjectColumns['Khoa học__score'] = col;
            else if (isRating) subjectColumns['Khoa học__rating'] = col;
          } else if (/lịch\s*sử|địa\s*l[íy]|ls[\s\-_]*đl/i.test(txt)) {
            if (isScore) subjectColumns['Lịch sử và Địa lí__score'] = col;
            else if (isRating) subjectColumns['Lịch sử và Địa lí__rating'] = col;
          } else if (/tự\s*nhiên|tn[\s\-_]*xh/i.test(txt)) {
            if (isScore) subjectColumns['TN-XH__score'] = col;
            else if (isRating) subjectColumns['TN-XH__rating'] = col;
          } else if (/tiếng\s*anh|ngoại\s*ngữ/i.test(txt)) {
            if (isScore) subjectColumns['Tiếng Anh__score'] = col;
            else if (isRating) subjectColumns['Tiếng Anh__rating'] = col;
          } else if (/đạo\s*đức/i.test(txt)) {
            subjectColumns['Đạo đức__rating'] = col;
          } else if (/âm\s*nhạc/i.test(txt)) {
            subjectColumns['Âm nhạc__rating'] = col;
          } else if (/mĩ\s*thuật|mỹ\s*thuật/i.test(txt)) {
            subjectColumns['Mĩ thuật__rating'] = col;
          } else if (/tin\s*học/i.test(txt) && /công\s*nghệ/i.test(txt)) {
            // Header chứa cả 2 cụm từ (ví dụ: "Tin học và Công nghệ (Công nghệ)") -> kiểm tra phân môn con
            const isSubCN = /\(\s*công\s*nghệ\s*\)/i.test(txt) || /công\s*nghệ/i.test(col.bottomText || '');
            if (isSubCN) {
              if (isScore) subjectColumns['Công nghệ__score'] = col;
              else if (isRating) subjectColumns['Công nghệ__rating'] = col;
            } else {
              if (isScore) subjectColumns['Tin học__score'] = col;
              else if (isRating) subjectColumns['Tin học__rating'] = col;
            }
          } else if (/tin\s*học/i.test(txt)) {
            if (isScore) subjectColumns['Tin học__score'] = col;
            else if (isRating) subjectColumns['Tin học__rating'] = col;
          } else if (/công\s*nghệ/i.test(txt)) {
            if (isScore) subjectColumns['Công nghệ__score'] = col;
            else if (isRating) subjectColumns['Công nghệ__rating'] = col;
          } else if (/thể\s*chất|gdtc/i.test(txt)) {
            subjectColumns['Giáo dục thể chất__rating'] = col;
          } else if (/trải\s*nghiệm|hđtn/i.test(txt)) {
            subjectColumns['Hoạt động trải nghiệm__rating'] = col;
          }
        }
      });

      return { subjectColumns, targetColumns };
    }

    async fillSummaryGridCompetencies(options = {}) {
      const { onProgress, shouldCancel } = options;
      const { locked, normal } = this._getSplitContainers();
      const scope = normal || this._getScope();
      const structure = this.getSummaryGridStructure();
      if (!structure || structure.targetColumns.length === 0) {
        return { success: false, reason: 'Không xác định được các cột Năng lực và Phẩm chất trên bảng vnEdu.' };
      }

      // Lấy danh sách học sinh từ locked grid hoặc scope
      const students = this.detectStudents();
      if (students.length === 0) {
        return { success: false, reason: 'Không tìm thấy danh sách học sinh trên bảng.' };
      }

      // Lấy các dòng tương ứng ở normal grid (phần scroller chứa các ô điểm và năng lực)
      const dataRows = Array.from(
        scope.querySelectorAll('.x-grid3-row, .x-grid-row, tbody tr')
      ).filter(r => !this._isHeaderRow(r));

      const detectedGrade = this.detectClass()?.grade || '1';
      let filledCount = 0;
      const allUpdates = [];

      for (let i = 0; i < dataRows.length; i++) {
        if (typeof shouldCancel === 'function' && shouldCancel()) {
          break;
        }

        const row = dataRows[i];
        const student = students[i] || { studentName: `Học sinh ${i + 1}` };
        const cells = Array.from(row.querySelectorAll('td, .x-grid3-cell'));

        // 1. Đọc dữ liệu các môn học của học sinh từ row
        const studentSubjects = {};
        for (const [subKey, colInfo] of Object.entries(structure.subjectColumns)) {
          const cell = colInfo.colClass ? row.querySelector('.' + colInfo.colClass) : cells[colInfo.index];
          if (!cell) continue;
          const txt = (cell.textContent || '').trim();
          const [subName, subProp] = subKey.split('__');
          if (!studentSubjects[subName]) studentSubjects[subName] = { rating: null, score: null };
          if (subProp === 'rating') {
            studentSubjects[subName].rating = txt;
          } else if (subProp === 'score') {
            studentSubjects[subName].score = txt;
          }
        }

        // 2. Chạy bộ suy luận
        const inferenceModule = (typeof VnEduCompetencyInference !== 'undefined' ? VnEduCompetencyInference : null) ||
                                (typeof require === 'function' ? require('../utils/competency-inference') : null);
        if (!inferenceModule || typeof inferenceModule.inferStudentCompetencies !== 'function') {
          return { success: false, reason: 'Không tìm thấy bộ suy luận VnEduCompetencyInference.' };
        }

        const inferenceResult = inferenceModule.inferStudentCompetencies({
          name: student.studentName,
          subjects: studentSubjects
        }, detectedGrade);

        // 3. Gom và điền giá trị suy luận vào từng cột mục tiêu (Quy tắc: Đ -> 1, C -> 2, T -> 3)
        const rowFieldUpdates = {};
        for (const targetCol of structure.targetColumns) {
          const rawVal = inferenceResult.rawMap[targetCol.key];
          if (rawVal === undefined || rawVal === null || rawVal === '') continue;

          let targetVal = rawVal;
          const s = String(rawVal).trim().toUpperCase();
          if (s === 'Đ' || s === 'D' || s === '1') targetVal = 1;
          else if (s === 'C' || s === '2') targetVal = 2;
          else if (s === 'T' || s === '3') targetVal = 3;

          rowFieldUpdates[targetCol.key] = targetVal;

          const cell = targetCol.colClass ? row.querySelector('.' + targetCol.colClass) : cells[targetCol.index];
          if (cell) {
            this.writeRatingToGridCell(cell, targetVal);
          }
        }

        if (Object.keys(rowFieldUpdates).length > 0) {
          allUpdates.push({
            rowIndex: i,
            fields: rowFieldUpdates
          });
        }

        filledCount++;

        if (typeof onProgress === 'function') {
          onProgress({
            currentIndex: i + 1,
            totalStudents: dataRows.length,
            studentName: student.studentName
          });
        }

        await new Promise(r => setTimeout(r, 60));
      }

      // 4. CẬP NHẬT EXTJS STORE TRỰC TIẾP TRONG MAIN WORLD
      // Đảm bảo toàn bộ records trong ExtJS Store được đánh dấu modified (record.dirty = true)
      // Khi giáo viên bấm nút "Lưu" trên vnEdu, vnEdu sẽ nhận diện đầy đủ và lưu lên hệ thống!
      let storeBridgeResult = null;
      if (allUpdates.length > 0) {
        try {
          const gridEl = scope.closest('.x-grid3, .x-panel, .x-grid-panel') || document.querySelector('.x-grid3');
          const gridId = gridEl ? gridEl.id : null;

          const bridge = (typeof window !== 'undefined' && window.PageBridge) || null;
          if (bridge && typeof bridge.applyStoreUpdates === 'function') {
            storeBridgeResult = await bridge.applyStoreUpdates({
              gridId: gridId,
              updates: allUpdates,
              targetColumns: structure.targetColumns
            });
            console.log('[vnEdu Adapter] ExtJS Store bridge update result:', storeBridgeResult);
          }
        } catch (e) {
          console.warn('[vnEdu Adapter] Lỗi khi gọi ExtJS Store bridge:', e);
        }
      }

      return {
        success: true,
        count: filledCount,
        total: dataRows.length,
        storeBridge: storeBridgeResult
      };
    }

    async fillComment(mappingItem, text, options = {}) {
      if (!mappingItem || !mappingItem.commentField || !mappingItem.commentField.element) {
        return false;
      }
      const commentOk = DOMUtils.setFieldValue(mappingItem.commentField.element, text);

      // Tuyệt đối không tự động điền ô xếp loại trừ khi có cờ tường minh options.fillRating === true
      if (options && options.fillRating === true && options.level) {
        try {
          this.fillRatingCell(mappingItem, options.level, options);
        } catch (e) {}
      }

      return commentOk;
    }
  }

  registerAdapter(VnEduGridAdapter);

  return VnEduGridAdapter;
});
