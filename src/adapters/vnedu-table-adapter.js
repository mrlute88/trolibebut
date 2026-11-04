/**
 * Table-based vnEdu Adapter (VNEDU_ADAPTER_TABLE)
 * Optimized for standard <table> structures with <tr>, <th>, <td>.
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
    root.VnEduTableAdapter = factory(
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

  let dynamicRemoteMatchers = [];

  class VnEduTableAdapter extends VnEduBaseAdapter {
    static setRemoteMatchers(aliases) {
      if (!Array.isArray(aliases)) return;
      dynamicRemoteMatchers = aliases
        .filter(a => a && a.name && a.regex)
        .map(a => ({ name: a.name, regex: new RegExp(a.regex, 'i') }));
    }
    constructor(options = {}) {
      super(options);
      this.name = 'VNEDU_ADAPTER_TABLE';
      this.cachedTable = null;
      this.nameColumnIndex = -1;
      this.hoDemColumnIndex = -1;
      this.tenColumnIndex = -1;
      this.commentColumnIndex = -1;
      this.sttColumnIndex = -1;
      this.idColumnIndex = -1;
      this.detectedPeriod = '';
    }

    _isDisallowedTable(table) {
      if (!table) return true;
      const win = table.closest('.x-window, .modal-dialog, .modal');
      if (win) {
        const titleEl = win.querySelector('.x-window-header-text, .x-panel-header-text, .x-window-header, .panel-title, .modal-title, caption, h1, h2, h3, .title');
        const titleText = (titleEl ? titleEl.textContent || '' : '').toLowerCase();
        
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
      }

      // Kiểm tra header cột của table
      const headerRow = table.querySelector('thead, tr');
      const headerText = (headerRow ? headerRow.textContent || '' : '').toLowerCase();
      if ((headerText.includes('bài dạy') && headerText.includes('tiết ppct')) || headerText.includes('kế hoạch bài dạy') || headerText.includes('ngày áp dụng tkb')) {
        return true;
      }
      return false;
    }

    canHandle() {
      // Check if page contains at least one table with multiple rows and inputs/textareas
      const tables = document.querySelectorAll('table');
      for (const t of tables) {
        if (this._isDisallowedTable(t)) {
          continue;
        }

        // Bắt buộc phải có cột học sinh hoặc tiêu đề liên quan đến nhận xét/đánh giá
        const headerRow = t.querySelector('thead, tr');
        const headerText = (headerRow ? headerRow.textContent || '' : '').toLowerCase();
        const hasStudentCol = /\b(?:họ\s*(?:và\s*)?tên|tên\s*học\s*sinh|mã\s*(?:học\s*sinh|hs)|học\s*sinh)\b/i.test(headerText) ||
                              (/\bhọ\s*đệm\b/i.test(headerText) && /\btên\b/i.test(headerText));

        if (!hasStudentCol) {
          continue;
        }

        // Must have data rows
        const rows = t.querySelectorAll('tbody tr, tr');
        if (rows.length >= 2) {
          const hasInputs = t.querySelector('textarea, input[type="text"], input:not([type]), [contenteditable="true"]');
          if (hasInputs) {
            this.cachedTable = t;
            return true;
          }
        }
      }
      return false;
    }

    detectPage() {
      const url = window.location.href.toLowerCase();
      const title = document.title.toLowerCase();
      const bodyText = document.body ? document.body.innerText.toLowerCase() : '';

      // Check for login page first
      if (
        document.querySelector('input[type="password"]') ||
        url.includes('login') ||
        url.includes('dang-nhap') ||
        title.includes('đăng nhập')
      ) {
        return { type: 'LOGIN', isAssessmentPage: false, confidence: 95 };
      }

      const isAssessment = /nhận xét|đánh giá học sinh|sổ theo dõi|sổ đánh giá|đánh giá định kỳ|đánh giá môn học|điểm tổng kết|phẩm chất|năng lực|rèn luyện/.test(bodyText) ||
        /nhan-xet|danh-gia|so-theo-doi|diem-tong-ket/.test(url);

      if (isAssessment) {
        return { type: 'COMMENT_ENTRY', isAssessmentPage: true, confidence: 90 };
      }

      if (bodyText.includes('danh sách lớp') || bodyText.includes('quản lý lớp')) {
        return { type: 'CLASS_LIST', isAssessmentPage: false, confidence: 80 };
      }

      if (bodyText.includes('danh sách học sinh')) {
        return { type: 'STUDENT_LIST', isAssessmentPage: false, confidence: 80 };
      }

      return { type: 'UNKNOWN', isAssessmentPage: false, confidence: 30 };
    }

    detectClass() {
      // 1. Quét các ô input/combobox trên thanh công cụ vnEdu
      const allInputs = Array.from(document.querySelectorAll('input.x-form-text, input.x-combo-text, input, select'));
      let detectedClass = '';
      let detectedGrade = '';
      let detectedSemester = '1';

      // 2. Tìm theo cặp Label và Input/Select kế bên
      const allLabels = Array.from(document.querySelectorAll('label, .x-form-item-label, span, td, div'));
      for (const lbl of allLabels) {
        const txt = (lbl.textContent || '').trim().toLowerCase();
        if (/^lớp\s*[:\-]?$/i.test(txt) || /^chọn\s*lớp\s*[:\-]?$/i.test(txt)) {
          const nextInp = lbl.parentElement?.querySelector('input, select') || lbl.nextElementSibling?.querySelector?.('input, select') || lbl.nextElementSibling;
          const val = (nextInp?.value || nextInp?.textContent || '').trim();
          if (val && /^(?:1[0-2]|[1-9])[A-Za-z0-9_\-\/\.\s]+$/i.test(val)) {
            detectedClass = val;
          }
        }
        if (/^khối\s*[:\-]?$/i.test(txt)) {
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
        ...Array.from(document.querySelectorAll('h1, h2, h3, .breadcrumb, .page-title, select, .ant-select-selection-item, .v-select, label, caption')).map(el => el.textContent || el.value || '')
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

      // 1. Quét tiêu đề các cột trong bảng điểm vnEdu
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

      // ƯU TIÊN 1: Tìm ô chọn/combobox có nhãn "Môn" hoặc "Môn học" (Độ chính xác cao nhất)
      const allLabels = Array.from(document.querySelectorAll('label, .x-form-item-label, span, th, td.header, .x-panel-header-text, .x-form-item, div'));
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
      const titleTexts = Array.from(document.querySelectorAll('.breadcrumb, .page-title, h1, h2, h3, .title, caption, thead th, .x-panel-header-text, div, span, b, strong, td'))
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

    _isHeaderRow(row) {
      if (!row) return true;
      if (row.closest('thead')) return true;
      if (row.querySelector('th')) return true;

      const role = (row.getAttribute('role') || '').toLowerCase();
      if (role.includes('header')) return true;

      const className = (row.className || '').toLowerCase();
      if (/header|head-row|grid-header|table-header|titlerow|filter-row|search-row/.test(className)) return true;

      const txt = (row.textContent || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (/họ và tên|họ tên|họ và tên đệm|họ đệm|tên học sinh/.test(txt) && /stt|mã|môn|nhận xét|đánh giá/.test(txt)) {
        return true;
      }

      const cells = Array.from(row.querySelectorAll('td'));
      for (const c of cells) {
        const cText = c.textContent.trim().toLowerCase();
        if (/^(họ và tên|họ tên|họ và tên đệm|họ và đệm|họ đệm|họ và chữ đệm|họ lót|tên|tên học sinh|stt|mã hs|mã học sinh|nhận xét|đánh giá)$/i.test(cText)) {
          return true;
        }
      }

      return false;
    }

    _findHeaderRow(table) {
      const rows = Array.from(table.querySelectorAll('tr'));
      let bestRow = null;
      let maxMatches = 0;

      for (const r of rows.slice(0, 5)) {
        const txt = (r.textContent || '').toLowerCase();
        let matches = 0;
        if (/stt|thứ tự/i.test(txt)) matches++;
        if (/họ|tên|học sinh/i.test(txt)) matches++;
        if (/nhận xét|đánh giá/i.test(txt)) matches++;
        if (/mã hs|mã học sinh/i.test(txt)) matches++;
        if (matches > maxMatches) {
          maxMatches = matches;
          bestRow = r;
        }
      }
      return bestRow;
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

    _analyzeHeaders(table) {
      this.nameColumnIndex = -1;
      this.hoDemColumnIndex = -1;
      this.tenColumnIndex = -1;
      this.commentColumnIndex = -1;
      this.ratingColumnIndex = -1;
      this.scoreColumnIndex = -1;
      this.sttColumnIndex = -1;
      this.idColumnIndex = -1;
      this.scoreColumns = [];

      const sampleRow = table.querySelector('tbody tr') || table.querySelectorAll('tr')[1];
      const sampleCells = sampleRow ? Array.from(sampleRow.querySelectorAll('td, [role="gridcell"]')) : [];
      const hasSttInSample = sampleCells.length >= 4 && (
        /^\s*\d{1,3}\s*$/.test(sampleCells[0]?.textContent || '') ||
        /^\s*\d{6,}\s*$/.test(sampleCells[1]?.textContent || '') ||
        sampleCells[0]?.className?.includes('numberer') ||
        sampleCells[0]?.className?.includes('stt')
      );

      // Thu thập toàn bộ các hàng tiêu đề trong thead hoặc phần đầu bảng
      const allHeaderRows = Array.from(table.querySelectorAll('thead tr, tr')).filter(r => this._isHeaderRow(r));

      if (allHeaderRows.length > 1) {
        // Phân tích ma trận 2D hỗ trợ đầy đủ multi-row headers
        const mappedColumns = this._analyzeMultiRowHeaders(allHeaderRows, sampleRow);
        mappedColumns.forEach(col => {
          const rawTxt = col.combinedText || '';
          const txt = (rawTxt.normalize ? rawTxt.normalize('NFC') : rawTxt).toLowerCase();
          const colClass = col.colClass || '';

          // 1. Phân loại cột Nhận xét
          const isCommentCol = /nhận xét|đánh giá|nx môn|lời nhận xét|ý kiến|đánh\s*giá\s*sự\s*tiến\s*bộ/i.test(txt) &&
                               !/(?:^|[^a-z0-9_à-ỹđ])(?:xl|xếp\s*loại|mức\s*(?:đạt|đánh\s*giá)|kết\s*quả)(?:$|[^a-z0-9_à-ỹđ])/i.test(txt);

          // 2. Phân loại cột Xếp loại / Mức đạt (T, H, C ở Tiểu học hoặc Đ, CĐ ở THCS/THPT)
          const isRatingCol = /(?:^|[^a-z0-9_à-ỹđ])(?:xl(?:[12]|gk[12]?|ck[12]?|hk[12]?|cn)?|xếp\s*loại|mức\s*(?:đạt|đánh\s*giá)|^mức\b|đánh\s*giá(?:\s*định\s*kỳ)?|kết\s*quả\s*đg|kết\s*quả\s*đánh\s*giá|\bđgk[12]?\b|\bđck[12]?\b)(?:$|[^a-z0-9_à-ỹđ])/i.test(txt);

          // 3. Phân loại cột ĐIỂM SỐ (chỉ khi không phải cột xếp loại hoặc nhận xét)
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

          if (col.index === 0 && hasSttInSample) {
            this.sttColumnIndex = 0;
            return;
          }
          if (/^stt$|^thứ tự$|^số tt$/i.test(txt) || (/stt|thứ tự/i.test(txt) && !/học sinh|nhận xét/.test(txt)) || /numberer/i.test(colClass)) {
            this.sttColumnIndex = col.index;
            return;
          } else if (/mã học sinh|mã hs|mahs|^id$/i.test(txt)) {
            this.idColumnIndex = col.index;
            return;
          } else if (/họ\s*(và\s*)?(tên\s*|chữ\s*)?đệm|họ\s*đệm|họ\s*lót|^họ$/i.test(txt)) {
            this.hoDemColumnIndex = col.index;
            return;
          } else if (/^tên$|^tên\s*gọi$|^tên\s*hs$/i.test(txt)) {
            this.tenColumnIndex = col.index;
            return;
          } else if (/họ\s*(và\s*)?tên|tên\s*học\s*sinh|^học\s*sinh$/i.test(txt)) {
            this.nameColumnIndex = col.index;
            return;
          } else if (isCommentCol) {
            this.commentColumnIndex = col.index;
          } else if (isRatingCol) {
            this.ratingColumnIndex = col.index;
          } else if (scoreType) {
            this.scoreColumns.push({
              index: col.index,
              type: scoreType,
              name: rawTxt
            });
          }

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
      } else {
        // Single row fallback
        const headerRow = this._findHeaderRow(table);
        const headerCells = headerRow
          ? Array.from(headerRow.querySelectorAll('th, td'))
          : Array.from(table.querySelectorAll('thead th, thead td, tr:first-child th, tr:first-child td'));

        let colIdx = 0;
        headerCells.forEach((cell) => {
          const span = Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10) || 1);
          const rawTxt = (cell.textContent || '').trim().replace(/\s+/g, ' ');
          const txt = (rawTxt.normalize ? rawTxt.normalize('NFC') : rawTxt).toLowerCase();

          const isCommentCol = /nhận xét|đánh giá|nx môn|lời nhận xét|ý kiến|đánh\s*giá\s*sự\s*tiến\s*bộ/i.test(txt) &&
                               !/(?:^|[^a-z0-9_à-ỹđ])(?:xl|xếp\s*loại|mức\s*(?:đạt|đánh\s*giá)|kết\s*quả)(?:$|[^a-z0-9_à-ỹđ])/i.test(txt);
          const isRatingCol = /(?:^|[^a-z0-9_à-ỹđ])(?:xl(?:[12]|gk[12]?|ck[12]?|hk[12]?|cn)?|xếp\s*loại|mức\s*(?:đạt|đánh\s*giá)|^mức\b|đánh\s*giá(?:\s*định\s*kỳ)?|kết\s*quả\s*đg|kết\s*quả\s*đánh\s*giá|\bđgk[12]?\b|\bđck[12]?\b)(?:$|[^a-z0-9_à-ỹđ])/i.test(txt);

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

          if (colIdx === 0 && hasSttInSample) {
            this.sttColumnIndex = 0;
            colIdx += span;
            return;
          }
          if (/^stt$|^thứ tự$|^số tt$/i.test(txt) || (/stt|thứ tự/i.test(txt) && !/học sinh|nhận xét/.test(txt)) || /numberer/i.test(cell.className)) {
            this.sttColumnIndex = colIdx;
            colIdx += span;
            return;
          } else if (/mã học sinh|mã hs|mahs|^id$/i.test(txt)) {
            this.idColumnIndex = colIdx;
            colIdx += span;
            return;
          } else if (/họ\s*(và\s*)?(tên\s*|chữ\s*)?đệm|họ\s*đệm|họ\s*lót|^họ$/i.test(txt)) {
            this.hoDemColumnIndex = colIdx;
            colIdx += span;
            return;
          } else if (/^tên$|^tên\s*gọi$|^tên\s*hs$/i.test(txt)) {
            this.tenColumnIndex = colIdx;
            colIdx += span;
            return;
          } else if (/họ\s*(và\s*)?tên|tên\s*học\s*sinh|^học\s*sinh$/i.test(txt)) {
            if (span >= 2) {
              this.hoDemColumnIndex = colIdx;
              this.tenColumnIndex = colIdx + 1;
              this.nameColumnIndex = -1;
            } else {
              this.nameColumnIndex = colIdx;
            }
            colIdx += span;
            return;
          } else if (isCommentCol) {
            this.commentColumnIndex = colIdx;
          } else if (isRatingCol) {
            this.ratingColumnIndex = colIdx;
          } else if (scoreType) {
            this.scoreColumns.push({
              index: colIdx,
              type: scoreType,
              name: rawTxt
            });
          }

          if (/giữa\s*k[ỳìyi]\s*1|\bgk1\b|nhận\s*xét\s*giữa\s*k[ỳìyi]/i.test(txt)) {
            this.detectedPeriod = 'GK1';
          } else if (/cuối\s*k[ỳìyi]\s*1|\bck1\b|nhận\s*xét\s*cuối\s*k[ỳìyi]\s*1/i.test(txt)) {
            this.detectedPeriod = 'CK1';
          } else if (/giữa\s*k[ỳìyi]\s*2|\bgk2\b|nhận\s*xét\s*giữa\s*k[ỳìyi]/i.test(txt)) {
            this.detectedPeriod = 'GK2';
          } else if (/cuối\s*k[ỳìyi]\s*2|\bck2\b|cuối\s*năm|cả\s*năm|\bcn\b|nhận\s*xét\s*cuối\s*(?:k[ỳìyi]\s*2|năm)/i.test(txt)) {
            this.detectedPeriod = 'CK2';
          }

          colIdx += span;
        });
      }

      // Lựa chọn cột điểm số đại diện chính theo độ ưu tiên: DTB > CK > GK > TX > GENERAL
      if (this.scoreColumns.length > 0) {
        const priorityOrder = { DTB: 1, CK: 2, GK: 3, TX: 4, GENERAL: 5 };
        const sortedScores = [...this.scoreColumns].sort((a, b) => {
          return (priorityOrder[a.type] || 99) - (priorityOrder[b.type] || 99);
        });
        this.scoreColumnIndex = sortedScores[0].index;
      }

      // BẢO VỆ CHỐNG NHẦM STT: Nếu bảng có thông tin học sinh, loại bỏ các cột điểm số có index < 4
      if (hasSttInSample) {
        this.scoreColumns = this.scoreColumns.filter(sc => sc.index >= 4);
        if (this.scoreColumnIndex >= 0 && this.scoreColumnIndex < 4) {
          this.scoreColumnIndex = this.scoreColumns.length > 0 ? this.scoreColumns[0].index : -1;
        }
      }
    }

    detectStudents() {
      if (!this.cachedTable) this.canHandle();
      if (!this.cachedTable) return [];

      this._analyzeHeaders(this.cachedTable);

      const rows = Array.from(this.cachedTable.querySelectorAll('tbody tr, tr')).filter(r => {
        return !this._isHeaderRow(r) && r.querySelectorAll('td').length >= 2;
      });

      const students = [];

      rows.forEach((row, rIdx) => {
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.length === 0) return;

        let studentName = '';
        let studentId = '';
        let stt = rIdx + 1;

        // 1. Check from detected split or full column indices
        if (this.hoDemColumnIndex >= 0 && this.tenColumnIndex >= 0 && cells[this.hoDemColumnIndex] && cells[this.tenColumnIndex]) {
          const hoDem = (cells[this.hoDemColumnIndex].textContent || '').trim();
          const ten = (cells[this.tenColumnIndex].textContent || '').trim();
          studentName = `${hoDem} ${ten}`.trim();
        } else if (this.nameColumnIndex >= 0 && cells[this.nameColumnIndex]) {
          studentName = (cells[this.nameColumnIndex].textContent || '').trim();
          // Check if next column is "Tên"
          if (this.tenColumnIndex >= 0 && cells[this.tenColumnIndex]) {
            studentName = `${studentName} ${(cells[this.tenColumnIndex].textContent || '').trim()}`.trim();
          } else if (cells[this.nameColumnIndex + 1]) {
            const nextTxt = (cells[this.nameColumnIndex + 1].textContent || '').trim();
            if (/^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+$/.test(nextTxt)) {
              if (!VietnameseNameDetector.isHeaderOrLabel(nextTxt)) {
                studentName = `${studentName} ${nextTxt}`.trim();
              }
            }
          }
        }

        if (this.idColumnIndex >= 0 && cells[this.idColumnIndex]) {
          studentId = cells[this.idColumnIndex].textContent.trim();
        }
        if (this.sttColumnIndex >= 0 && cells[this.sttColumnIndex]) {
          const parsedStt = parseInt(cells[this.sttColumnIndex].textContent.trim(), 10);
          if (!isNaN(parsedStt)) stt = parsedStt;
        }

        // Clean up candidate and normalize to NFC
        studentName = VietnameseNameDetector.cleanStudentName(studentName);
        if (studentName && studentName.normalize) studentName = studentName.normalize('NFC');

        // 2. Fallback search across cells if not detected or invalid
        if (!studentName || VietnameseNameDetector.isHeaderOrLabel(studentName) || !VietnameseNameDetector.isVietnameseName(studentName)) {
          studentName = '';
          for (let cIdx = 0; cIdx < cells.length; cIdx++) {
            let cellText = VietnameseNameDetector.cleanStudentName(cells[cIdx].textContent.trim());
            if (cellText && cellText.normalize) cellText = cellText.normalize('NFC');

            // Check if cell combined with next cell is a valid Vietnamese name (e.g. "Thạch" + "Bảo")
            if (cIdx + 1 < cells.length) {
              let nextTxt = VietnameseNameDetector.cleanStudentName(cells[cIdx + 1].textContent.trim());
              if (nextTxt && nextTxt.normalize) nextTxt = nextTxt.normalize('NFC');
              const combined = `${cellText} ${nextTxt}`.trim();
              if (VietnameseNameDetector.isVietnameseName(combined) && !VietnameseNameDetector.isHeaderOrLabel(combined) && !VietnameseNameDetector.isHeaderOrLabel(nextTxt)) {
                studentName = combined;
                break;
              }
            }

            if (VietnameseNameDetector.isVietnameseName(cellText) && !VietnameseNameDetector.isHeaderOrLabel(cellText)) {
              studentName = cellText;
              break;
            }
          }
        }

        // Final strict check: reject header labels or empty
        if (!studentName || VietnameseNameDetector.isHeaderOrLabel(studentName)) {
          return; // Skip this row!
        }

        const ratingAndScore = VnEduBaseAdapter.extractRowRatingAndScore(
          row,
          null,
          this.ratingColumnIndex,
          this.scoreColumnIndex,
          { scoreColumns: this.scoreColumns }
        );

        students.push({
          index: stt,
          studentName,
          studentId,
          rowElement: row,
          rating: ratingAndScore.rating,
          score: ratingAndScore.score
        });
      });

      return students;
    }

    detectCommentFields() {
      if (!this.cachedTable) this.canHandle();
      if (!this.cachedTable) return [];

      const rows = Array.from(this.cachedTable.querySelectorAll('tbody tr, tr')).filter(r => {
        return !this._isHeaderRow(r) && r.querySelectorAll('td').length >= 2;
      });

      const fields = [];

      rows.forEach((row, rIdx) => {
        const cells = Array.from(row.querySelectorAll('td'));
        let fieldEl = null;

        // Check comment column index first (prioritizing textarea)
        if (this.commentColumnIndex >= 0 && cells[this.commentColumnIndex]) {
          const targetCell = cells[this.commentColumnIndex];
          fieldEl = targetCell.querySelector('textarea') ||
                    targetCell.querySelector('input[type="text"], input:not([type]), [contenteditable="true"]') ||
                    (targetCell.getAttribute('contenteditable') === 'true' ? targetCell : null);
        }

        // Fallback: search all inputs in row, strictly prioritizing textarea for comments
        if (!fieldEl) {
          const textareas = Array.from(row.querySelectorAll('textarea'));
          if (textareas.length > 0) {
            fieldEl = textareas[0];
          } else {
            const candidates = Array.from(row.querySelectorAll('input[type="text"], input:not([type]), [contenteditable="true"]'));
            let bestScore = 0;

            for (const cand of candidates) {
              const score = ConfidenceModule.calculateFieldConfidence(cand, { rowHasStudentName: true });
              if (score > bestScore) {
                bestScore = score;
                fieldEl = cand;
              }
            }
          }
        }

        if (fieldEl) {
          const confidence = ConfidenceModule.calculateFieldConfidence(fieldEl, { rowHasStudentName: true });
          fields.push({
            index: rIdx + 1,
            element: fieldEl,
            rowElement: row,
            confidence: confidence || 90,
            tagName: fieldEl.tagName.toLowerCase()
          });
        }
      });

      return fields;
    }

    mapStudentsToFields(students, fields, options = {}) {
      const mapping = [];
      const validStudents = students.filter(st => st.studentName && !VietnameseNameDetector.isHeaderOrLabel(st.studentName));

      // 1. Direct row match: student and field share the EXACT SAME rowElement
      const fieldMapByRow = new Map();
      fields.forEach(f => {
        if (f.rowElement) fieldMapByRow.set(f.rowElement, f);
      });

      let directMatchCount = 0;
      validStudents.forEach(st => {
        if (st.rowElement && fieldMapByRow.has(st.rowElement)) {
          directMatchCount++;
        }
      });

      if (directMatchCount > 0 && directMatchCount >= validStudents.length * 0.5) {
        validStudents.forEach(st => {
          const field = fieldMapByRow.get(st.rowElement);
          if (field) {
            const rowRatingScore = VnEduBaseAdapter.extractRowRatingAndScore(
              st.rowElement,
              field.rowElement,
              this.ratingColumnIndex,
              this.scoreColumnIndex,
              {
                scoreColumns: this.scoreColumns,
                isScored: options?.isScored,
                educationLevel: options?.educationLevel
              }
            );
            const r = rowRatingScore.rating || st.rating || null;
            const s = rowRatingScore.score !== null ? rowRatingScore.score : st.score;

            mapping.push({
              student: st,
              commentField: field,
              rating: r,
              score: s,
              hasRating: !!(rowRatingScore.rating || st.rating),
              hasScore: s !== null && s !== undefined,
              status: 'READY'
            });
          }
        });
        return mapping;
      }

      // 2. Separate tables fallback: pair 1-to-1 by index
      const count = Math.min(validStudents.length, fields.length);
      for (let i = 0; i < count; i++) {
        const st = validStudents[i];
        const f = fields[i];
        if (st && f) {
          f.pairRowElement = st.rowElement;
          st.pairRowElement = f.rowElement;

          const rowRatingScore = VnEduBaseAdapter.extractRowRatingAndScore(
            f.rowElement,
            st.rowElement,
            this.ratingColumnIndex,
            this.scoreColumnIndex,
            {
              scoreColumns: this.scoreColumns,
              isScored: options?.isScored,
              educationLevel: options?.educationLevel
            }
          );
          const r = rowRatingScore.rating || st.rating || null;
          const s = rowRatingScore.score !== null ? rowRatingScore.score : st.score;

          mapping.push({
            student: st,
            commentField: f,
            rating: r,
            score: s,
            hasRating: !!(rowRatingScore.rating || st.rating),
            hasScore: s !== null && s !== undefined,
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
      if (!level || !mappingItem) return false;
      const row = mappingItem.commentField?.rowElement || mappingItem.student?.rowElement;
      if (!row) return false;

      let ratingCell = null;
      if (this.ratingColumnIndex >= 0) {
        const cells = Array.from(row.querySelectorAll('td, th'));
        ratingCell = cells[this.ratingColumnIndex];
      }
      if (!ratingCell) {
        ratingCell = row.querySelector('[class*="xl" i], [name*="xl" i]');
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

      const currentVal = (ratingCell.querySelector?.('input, select')?.value || ratingCell.textContent || '').trim();
      const currentParsed = VnEduBaseAdapter.parseCellRatingAndScore(currentVal, { allowScore: false });
      if (currentParsed.rating && options.forceOverwriteRating !== true) {
        return true;
      }

      const ratingText = String(level).toUpperCase();
      const input = ratingCell.querySelector('input, select');
      if (input) {
        DOMUtils.setFieldValue(input, ratingText);
      } else {
        ratingCell.textContent = ratingText;
        ratingCell.innerText = ratingText;
        try {
          if (typeof Event !== 'undefined') {
            ratingCell.dispatchEvent(new Event('input', { bubbles: true }));
            ratingCell.dispatchEvent(new Event('change', { bubbles: true }));
          }
        } catch (e) {}
      }
      return true;
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

  registerAdapter(VnEduTableAdapter);

  return VnEduTableAdapter;
});
