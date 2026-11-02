/**
 * vnEdu Page Detector
 * Determines page type without interfering with auth/login/passwords.
 * Strictly enforces that comments can ONLY be filled in allowed assessment pages:
 * 1. Sổ nhận xét, Sổ theo dõi và đánh giá học sinh / Sổ đánh giá môn học (đánh giá thường xuyên, định kỳ)
 * 2. Đánh giá Phẩm chất - Năng lực của học sinh (đánh giá định kỳ, ghi học bạ)
 * Absolutely forbids filling in other pages such as "Kế hoạch dạy học", "Thời khóa biểu", "Phân công chuyên môn", etc.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VnEduPageDetector = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const PAGE_TYPES = {
    LOGIN: 'LOGIN',
    DISALLOWED: 'DISALLOWED',
    DASHBOARD: 'DASHBOARD',
    CLASS_LIST: 'CLASS_LIST',
    STUDENT_LIST: 'STUDENT_LIST',
    SUBJECT_ASSESSMENT: 'SUBJECT_ASSESSMENT',
    COMPETENCY_ASSESSMENT: 'COMPETENCY_ASSESSMENT',
    COMMENT_ENTRY: 'COMMENT_ENTRY',
    UNKNOWN: 'UNKNOWN'
  };

  // Từ khóa các trang/mục BỊ CẤM TUYỆT ĐỐI (không được phép điền nhận xét học sinh)
  const DISALLOWED_KEYWORDS = [
    'kế hoạch dạy học', 'kế hoạch bài dạy', 'khdh', 'lịch báo giảng',
    'thời khóa biểu', 'tkb', 'lịch giảng dạy', 'lịch công tác', 'lịch tuần',
    'phân công chuyên môn', 'phân công giảng dạy', 'hồ sơ cán bộ', 'danh sách cán bộ',
    'hồ sơ giáo viên', 'tổ chuyên môn', 'quản lý giáo viên',
    'quản lý lớp học', 'danh mục trường', 'cấu hình hệ thống',
    'tiếp nhận học sinh', 'chuyển trường',
    'kỳ thi trực tuyến', 'ngân hàng đề thi', 'ngân hàng câu hỏi'
  ];

  // Từ khóa các trang ĐƯỢC PHÉP THIẾT LẬP SẴN (Whitelist)
  const ALLOWED_ASSESSMENT_KEYWORDS = [
    'nhận xét', 'sổ nhận xét', 'nhập nhận xét', 'nhận xét môn học',
    'nhận xét giữa kỳ', 'nhận xét cuối kỳ', 'nhận xét thường xuyên',
    'sổ theo dõi', 'sổ đánh giá', 'sổ theo dõi và đánh giá', 'sổ đánh giá học sinh',
    'đánh giá môn học', 'đánh giá học sinh', 'đánh giá định kỳ', 'đánh giá thường xuyên',
    'sổ điểm', 'bảng điểm', 'nhập điểm', 'sổ điểm chi tiết', 'sổ gọi tên và ghi điểm',
    'phẩm chất', 'năng lực', 'phẩm chất - năng lực', 'năng lực, phẩm chất',
    'ghi học bạ', 'học bạ', 'nhập nl-pc', 'tổng hợp đánh giá phẩm chất',
    'mức đạt được', 'xếp loại', 'xl gk', 'xl ck'
  ];

  /**
   * Lấy cửa sổ hoặc panel đang active/nổi trên màn hình vnEdu ExtJS
   */
  function getActiveScope() {
    const allWindows = Array.from(document.querySelectorAll('.x-window, .modal-dialog, .modal'))
      .filter(w => {
        try {
          const s = window.getComputedStyle(w);
          return s.display !== 'none' && s.visibility !== 'hidden' && w.offsetHeight >= 80;
        } catch (e) {
          return false;
        }
      });

    if (allWindows.length > 0) {
      // Ưu tiên cửa sổ có chứa tiêu đề hoặc nội dung Sổ nhận xét / Sổ điểm / Phẩm chất - Năng lực
      const assessmentWin = allWindows.find(w => {
        const txt = (w.textContent || '').toLowerCase();
        return txt.includes('sổ nhận xét') || txt.includes('sổ điểm') || txt.includes('phẩm chất') || txt.includes('nhận xét giữa kỳ');
      });
      if (assessmentWin) return assessmentWin;

      // Sắp xếp theo z-index giảm dần để lấy cửa sổ trên cùng
      allWindows.sort((a, b) => {
        const za = parseInt(window.getComputedStyle(a).zIndex, 10) || 0;
        const zb = parseInt(window.getComputedStyle(b).zIndex, 10) || 0;
        return zb - za;
      });
      return allWindows[0];
    }

    // Nếu không có cửa sổ nổi, tìm active tab panel
    const activeTab = document.querySelector('.x-tab-panel-body > .x-panel:not(.x-hide-offsets):not(.x-panel-collapsed)');
    if (activeTab) return activeTab;

    return document;
  }

  /**
   * Thu thập tất cả các tiêu đề cửa sổ, tab, taskbar trên vnEdu
   */
  function getAllWindowTitles() {
    const titles = [];

    // 1. Tiêu đề các cửa sổ nổi ExtJS (.x-window)
    const windowEls = document.querySelectorAll('.x-window-header-text, .x-panel-header-text, .x-window-header, .x-window-tl');
    windowEls.forEach(el => {
      const t = (el.textContent || '').trim();
      if (t && !titles.includes(t)) titles.push(t);
    });

    // 2. Tiêu đề các nút taskbar ở góc dưới vnEdu
    const taskbarEls = document.querySelectorAll('.ux-taskbar-item, .ux-taskbar button, button.x-btn-text, .taskbar');
    taskbarEls.forEach(el => {
      const t = (el.textContent || '').trim();
      if (t && !titles.includes(t)) titles.push(t);
    });

    // 3. Tiêu đề tài liệu và breadcrumbs
    if (document.title) titles.push(document.title.trim());
    const breadcrumbs = document.querySelectorAll('.breadcrumb, .page-title, h1, h2, h3, caption');
    breadcrumbs.forEach(el => {
      const t = (el.textContent || '').trim();
      if (t && !titles.includes(t)) titles.push(t);
    });

    return titles;
  }

  /**
   * Lấy text gộp của tất cả header trong bảng (cả phần locked và phần scroller)
   */
  function getAllHeadersText(scope) {
    const root = scope || document;
    const headerEls = Array.from(root.querySelectorAll('.x-grid3-header, thead, .x-grid-header-row, [role="rowheader"]'));
    return headerEls.map(h => (h.textContent || '').trim()).join(' ').toLowerCase();
  }

  function detectCurrentPage() {
    const url = window.location.href.toLowerCase();
    const title = (document.title || '').toLowerCase();
    const bodyText = document.body ? (document.body.innerText || document.body.textContent || '').toLowerCase() : '';

    // 1. Strict Login / Auth check
    const hasPasswordField = !!document.querySelector('input[type="password"]');
    const isLoginUrl = url.includes('login') || url.includes('dang-nhap') || url.includes('id.vnedu.vn/login') || url.includes('sso');
    const isLoginText = title.includes('đăng nhập') || bodyText.includes('đăng nhập hệ thống vnedu');

    if (hasPasswordField || isLoginUrl || (isLoginText && !document.querySelector('table, [role="grid"], .x-grid3'))) {
      return {
        type: PAGE_TYPES.LOGIN,
        isAssessmentPage: false,
        canOperate: false,
        message: '🔒 Trang đăng nhập vnEdu. Extension không can thiệp vào trang xác thực.'
      };
    }

    // 2. Thu thập tiêu đề và phạm vi làm việc
    const windowTitles = getAllWindowTitles();
    const combinedTitlesText = windowTitles.join(' ').toLowerCase();
    const activeScope = getActiveScope();
    const allHeadersText = getAllHeadersText(document);

    // 3. KIỂM TRA BLACKLIST: Kế hoạch dạy học, Thời khóa biểu, Phân công giảng dạy...
    // CHỈ CHẶN khi tiêu đề cửa sổ hoặc header bảng thực sự là Kế hoạch dạy học, và KHÔNG PHẢI là Sổ nhận xét!
    const isDisallowedPage = (
      combinedTitlesText.includes('kế hoạch dạy học') ||
      combinedTitlesText.includes('kế hoạch bài dạy') ||
      combinedTitlesText.includes('thời khóa biểu') ||
      combinedTitlesText.includes('lịch báo giảng') ||
      combinedTitlesText.includes('phân công chuyên môn') ||
      combinedTitlesText.includes('phân công giảng dạy') ||
      (allHeadersText.includes('bài dạy') && allHeadersText.includes('tiết ppct'))
    ) && !combinedTitlesText.includes('sổ nhận xét') && !bodyText.includes('sổ điểm chi tiết') && !bodyText.includes('nhận xét giữa kỳ');

    if (isDisallowedPage) {
      const matchName = windowTitles.find(t => /kế hoạch|thời khóa biểu|lịch báo giảng|phân công/i.test(t)) || 'Kế hoạch dạy học / chức năng khác';
      return {
        type: PAGE_TYPES.DISALLOWED,
        isAssessmentPage: false,
        canOperate: false,
        disallowedReason: 'DISALLOWED_PAGE',
        message: `⚠️ Giao diện hiện tại là "${matchName}"!\n\nTiện ích chỉ được phép điền vào những mục đã được thiết lập sẵn:\n1. Sổ theo dõi và đánh giá học sinh / Sổ đánh giá môn học (đánh giá thường xuyên, định kỳ)\n2. Đánh giá Phẩm chất - Năng lực của học sinh (đánh giá định kỳ, ghi học bạ)\n\nTuyệt đối không nhập vào Kế hoạch dạy học hay các nội dung khác.`
      };
    }

    // 4. KIỂM TRA WHITELIST CỬA SỔ "PHẨM CHẤT - NĂNG LỰC GHI HỌC BẠ"
    const isCompetencyScope = (
      (combinedTitlesText.includes('phẩm chất') && combinedTitlesText.includes('năng lực')) ||
      combinedTitlesText.includes('ghi học bạ') ||
      combinedTitlesText.includes('nhập nl-pc') ||
      bodyText.includes('phẩm chất - năng lực ghi học bạ') ||
      (bodyText.includes('năng lực chung') && bodyText.includes('phẩm chất'))
    );
    if (isCompetencyScope) {
      return {
        type: PAGE_TYPES.COMPETENCY_ASSESSMENT,
        isAssessmentPage: true,
        canOperate: true,
        message: '✓ Đã phát hiện giao diện Đánh giá Phẩm chất - Năng lực học sinh vnEdu.'
      };
    }

    // 5. KIỂM TRA WHITELIST: SỔ NHẬN XÉT / SỔ ĐIỂM CHI TIẾT / SỔ THEO DÕI VÀ ĐÁNH GIÁ MÔN HỌC
    // Dấu hiệu nhận biết sổ nhận xét / sổ điểm vnEdu:
    const hasAssessmentTitle = (
      combinedTitlesText.includes('sổ nhận xét') ||
      combinedTitlesText.includes('sổ điểm') ||
      combinedTitlesText.includes('sổ theo dõi') ||
      combinedTitlesText.includes('đánh giá môn học') ||
      combinedTitlesText.includes('sổ đánh giá') ||
      combinedTitlesText.includes('sổ gọi tên và ghi điểm') ||
      bodyText.includes('sổ điểm chi tiết') ||
      bodyText.includes('nhận xét giữa kỳ') ||
      bodyText.includes('nhận xét cuối kỳ') ||
      bodyText.includes('danh mục nhận xét') ||
      bodyText.includes('xóa dấu , ở cuối nội dung nhận xét') ||
      bodyText.includes('cách nhập xl:') ||
      allHeadersText.includes('nhận xét giữa kỳ') ||
      allHeadersText.includes('nhận xét cuối kỳ') ||
      allHeadersText.includes('lời nhận xét') ||
      allHeadersText.includes('đánh giá sự tiến bộ')
    );

    const hasGridOrTable = !!(document.querySelector('.x-grid3-row, tbody tr, tr.x-grid-row, table, [role="grid"], .x-grid3'));
    const hasCommentInput = !!(document.querySelector('textarea, [contenteditable="true"], input[name*="nhanxet"], input[name*="comment"]'));

    if (hasAssessmentTitle && (hasCommentInput || hasGridOrTable)) {
      return {
        type: PAGE_TYPES.COMMENT_ENTRY,
        isAssessmentPage: true,
        canOperate: true,
        message: '✓ Đã phát hiện trang nhập nhận xét môn học vnEdu.'
      };
    }

    // 6. Student list page
    if (combinedTitlesText.includes('danh sách học sinh') || bodyText.includes('danh sách học sinh') || url.includes('hoc-sinh') || url.includes('student')) {
      return {
        type: PAGE_TYPES.STUDENT_LIST,
        isAssessmentPage: false,
        canOperate: false,
        message: 'ℹ️ Trang danh sách học sinh. Vui lòng chuyển sang trang Sổ nhận xét hoặc Đánh giá học sinh để sử dụng trợ lý.'
      };
    }

    // 7. Class list
    if (combinedTitlesText.includes('danh sách lớp') || bodyText.includes('danh sách lớp') || url.includes('lop-hoc')) {
      return {
        type: PAGE_TYPES.CLASS_LIST,
        isAssessmentPage: false,
        canOperate: false,
        message: 'ℹ️ Trang danh sách lớp học.'
      };
    }

    // 8. Dashboard
    if (url.includes('home') || url.includes('dashboard') || (bodyText.includes('bàn làm việc') && !hasGridOrTable)) {
      return {
        type: PAGE_TYPES.DASHBOARD,
        isAssessmentPage: false,
        canOperate: false,
        message: 'ℹ️ Bàn làm việc vnEdu. Vui lòng mở Sổ đánh giá môn học hoặc Đánh giá Phẩm chất - Năng lực của học sinh.'
      };
    }

    // 9. Unknown
    return {
      type: PAGE_TYPES.UNKNOWN,
      isAssessmentPage: false,
      canOperate: false,
      message: '🔎 Chưa xác định được Sổ nhận xét vnEdu.\nTiện ích chỉ điền vào những mục đã được thiết lập sẵn:\n1. Sổ theo dõi và đánh giá học sinh / Sổ đánh giá môn học\n2. Đánh giá Phẩm chất - Năng lực của học sinh\nNgoài ra tuyệt đối không nhập vào các nội dung khác.'
    };
  }

  return {
    PAGE_TYPES,
    DISALLOWED_KEYWORDS,
    ALLOWED_ASSESSMENT_KEYWORDS,
    getActiveScope,
    getAllWindowTitles,
    getAllHeadersText,
    detectCurrentPage
  };
});
