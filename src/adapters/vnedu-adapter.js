/**
 * Base vnEdu DOM Adapter Interface & Factory
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VnEduBaseAdapter = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  class VnEduBaseAdapter {
    constructor(options = {}) {
      this.options = options;
      this.name = 'BaseAdapter';
    }

    /**
     * Test if this adapter can handle the current page DOM
     */
    canHandle() {
      return false;
    }

    /**
     * Detect general page classification
     */
    detectPage() {
      return {
        type: 'UNKNOWN',
        isAssessmentPage: false,
        confidence: 0
      };
    }

    /**
     * Detect class name, grade, school year, semester
     */
    detectClass() {
      return {
        className: '',
        grade: '',
        schoolYear: '',
        semester: ''
      };
    }

    /**
     * Detect subject and evaluation period
     */
    detectSubject() {
      return {
        subject: '',
        period: ''
      };
    }

    /**
     * Detect student rows and student names
     * Returns: StudentRow[] { index, studentName, studentId, rowElement }
     */
    detectStudents() {
      return [];
    }

    /**
     * Detect comment input elements
     * Returns: CommentField[] { index, element, rowElement, confidence, tagName }
     */
    detectCommentFields() {
      return [];
    }

    /**
     * Map student rows to comment fields
     */
    mapStudentsToFields(students, fields) {
      return [];
    }

    /**
     * Validate mapping safety
     */
    validateMapping(mapping) {
      return {
        valid: false,
        confidence: 0,
        errors: []
      };
    }

    /**
     * Fill comment into a specific student's field
     */
    async fillComment(mappingItem, text) {
      return false;
    }

    /**
     * Phân tích giá trị ô xếp loại hoặc điểm số (T, H, C hoặc 1-10)
     */
    /**
     * Phân tích giá trị ô xếp loại hoặc điểm số (T, H, C hoặc 1-10)
     * Hỗ trợ toàn diện:
     * - Cấp Tiểu học (Thông tư 27): Mức đạt T, H, C (hoặc số 2 = T, 1 = H, 0 = C theo chuẩn vnEdu)
     * - Cấp THCS & THPT (Thông tư 22): Điểm số 0 - 10 hoặc Mức Đạt (Đ) / Chưa đạt (CĐ)
     */
    static parseCellRatingAndScore(rawVal, options = {}) {
      if (rawVal === undefined || rawVal === null) return { rating: null, score: null, hasRating: false, hasScore: false };
      const str = String(rawVal).replace(/\u00a0/g, ' ').replace(/&nbsp;/g, ' ').trim();
      if (!str) return { rating: null, score: null, hasRating: false, hasScore: false };

      // 0. Bỏ qua nếu là chuỗi ngày tháng (ví dụ 14/10/2020)
      if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(str)) {
        return { rating: null, score: null, hasRating: false, hasScore: false };
      }

      const upper = str.toUpperCase().replace(/\s+/g, ' ');

      const isPrimary = options.educationLevel === 'PRIMARY';
      const isCommentSubjectInSecondary = !isPrimary && options.isScored === false;

      // 1a. Phím tắt cấp THCS & THPT cho môn nhận xét Đạt / Chưa đạt (Thông tư 22):
      // Theo hướng dẫn chính thức dưới chân trang vnEdu:
      // "Cách nhập bằng phím tắt: [Đạt] = d, Đ, đ, 1  [Chưa đạt] = c, CĐ, cđ, 2"
      if (isCommentSubjectInSecondary) {
        if (/^(?:1|Đ|D|DAT|ĐẠT)$/i.test(upper)) {
          return { rating: 'Đ', score: null, hasRating: true, hasScore: false };
        }
        if (/^(?:2|C|CD|CĐ|CHƯA ĐẠT|CHUA DAT|CHƯA Đ|CHUA D)$/i.test(upper)) {
          return { rating: 'CĐ', score: null, hasRating: true, hasScore: false };
        }
      }

      // 1b. HỖ TRỢ ĐẶC THÙ VNEDU TIỂU HỌC: Giáo viên nhập số 2 (= T), 1 (= H), 0 (= C)
      // Theo hướng dẫn chính thức trên màn hình vnEdu Tiểu học:
      // "Cách nhập XL: Nhập số 2, chữ t,T... (Hoàn Thành Tốt). Nhập số 1, chữ h,H... (Hoàn Thành). Nhập số 0, chữ c,C... (Chưa Hoàn Thành)."
      const isRatingContext = options.isRatingColumn === true || options.allowScore === false || isPrimary;
      if (isPrimary && isRatingContext) {
        if (upper === '2') {
          return { rating: 'T', score: null, hasRating: true, hasScore: false };
        }
        if (upper === '1') {
          return { rating: 'H', score: null, hasRating: true, hasScore: false };
        }
        if (upper === '0') {
          return { rating: 'C', score: null, hasRating: true, hasScore: false };
        }
      }

      // 1c. Mức Đạt / Chưa đạt (Thông tư 22 - THCS & THPT)
      if (/^(?:Đ|D|DAT|ĐẠT)$/i.test(upper)) {
        return { rating: 'Đ', score: null, hasRating: true, hasScore: false };
      }
      if (/^(?:CĐ|CD|CHƯA ĐẠT|CHUA DAT|CHƯA Đ|CHUA D)$/i.test(upper)) {
        return { rating: 'CĐ', score: null, hasRating: true, hasScore: false };
      }

      // Mức Tốt / Khá / Hoàn thành / Chưa hoàn thành
      if (/^(?:T|TỐT|TOT|HOÀN THÀNH TỐT|HOAN THANH TOT|HTT|HT TỐT|HT TOT|G|GIỎI|GIOI|XS|XUẤT SẮC)$/i.test(upper)) {
        return { rating: 'T', score: null, hasRating: true, hasScore: false };
      }
      if (/^(?:K|KHÁ|KHA)$/i.test(upper)) {
        return { rating: 'K', score: null, hasRating: true, hasScore: false };
      }
      if (/^(?:H|HOÀN THÀNH|HOAN THANH|HT|H\.THÀNH|H\.THANH|TB|TRUNG BÌNH|TRUNG BINH)$/i.test(upper)) {
        return { rating: 'H', score: null, hasRating: true, hasScore: false };
      }
      if (/^(?:C|CHƯA HOÀN THÀNH|CHUA HOAN THANH|CHT|CHƯA HT|CHUA HT|CẦN CỐ GẮNG|CAN CO GANG|C\.HOÀN THÀNH|Y|YẾU|YEU|KÉM|KEM)$/i.test(upper)) {
        return { rating: 'C', score: null, hasRating: true, hasScore: false };
      }

      // 2. Kiểm tra điểm số (từ 0 đến 10) - Chỉ phân tích khi cho phép điểm số
      if (options.allowScore !== false) {
        const cleanNum = str.replace(',', '.');
        const num = parseFloat(cleanNum);
        if (!isNaN(num) && num >= 0 && num <= 10 && /^(?:10|[0-9](?:\.[0-9]+)?)$/.test(cleanNum)) {
          // Tiêu chuẩn xếp loại điểm số theo Thông tư 22/2021/TT-BGDĐT:
          // >= 8.0: Tốt (T), 6.5 - 7.9: Khá (K), 5.0 - 6.4: Đạt/Hoàn thành (H), < 5.0: Chưa đạt (C)
          const level = num >= 8.0 ? 'T' : (num >= 6.5 ? 'K' : (num >= 5.0 ? 'H' : 'C'));
          return { rating: level, score: num, hasRating: true, hasScore: true };
        }
      }

      return { rating: null, score: null, hasRating: false, hasScore: false };
    }

    /**
     * Trích xuất xếp loại hoặc điểm số từ hàng dữ liệu học sinh
     * Hỗ trợ toàn diện cả cấp Tiểu học (TT27) và THCS / THPT (TT22):
     * - Cấp Tiểu học: Ưu tiên bóc tách xếp loại T, H, C (hoặc số 2, 1, 0) từ cột XL / Mức đạt.
     * - Cấp THCS & THPT: Ưu tiên điểm số từ các cột ĐTBmhk > ĐĐGck > ĐĐGgk > ĐĐGtx (TX1-TX5) cho môn tính điểm,
     *   hoặc Đ / CĐ cho môn nhận xét.
     */
    static extractRowRatingAndScore(rowElement, pairRowElement, ratingColIdx = -1, scoreColIdx = -1, options = {}) {
      if (!rowElement && !pairRowElement) return { rating: null, score: null, hasRating: false, hasScore: false };

      const isPrimary = options.educationLevel === 'PRIMARY';
      const allowScore = options.allowScore !== false && options.isScored !== false;

      // 1. Phân biệt chính xác Score Row (chứa textarea / cột điểm ở viewport) và Info Row (chứa STT, Mã HS ở locked panel)
      function isInfoRowCheck(el) {
        if (!el) return false;
        if (el.closest?.('.x-grid3-locked, .x-grid-inner-locked, [class*="-locked"]')) return true;
        if (el.querySelector?.('.x-grid3-td-numberer, .x-grid3-col-numberer, .col-stt, .col-mahs, .col-hoten')) return true;
        return false;
      }
      function isScoreRowCheck(el) {
        if (!el) return false;
        if (el.closest?.('.x-grid3-scroller, .x-grid3-viewport, .x-grid-inner-normal, [class*="-normal"]')) return true;
        if (el.querySelector?.('textarea, input[type="text"], input:not([type])')) return true;
        return false;
      }

      let scoreRow = rowElement;
      if (isInfoRowCheck(rowElement) && isScoreRowCheck(pairRowElement)) {
        scoreRow = pairRowElement;
      } else if (!isScoreRowCheck(rowElement) && isScoreRowCheck(pairRowElement)) {
        scoreRow = pairRowElement;
      }

      const cells = Array.from(scoreRow.querySelectorAll ? scoreRow.querySelectorAll('td, [role="gridcell"], .x-grid3-cell') : []);

      // Xác định dòng có chứa thông tin học sinh (STT, Mã HS, Họ tên) hay không:
      const hasStudentIdentity = Boolean(
        cells.length >= 4 && (
          /^\s*\d{1,3}\s*$/.test(cells[0]?.textContent || '') ||
          /^\s*\d{6,}\s*$/.test(cells[1]?.textContent || '') ||
          cells[0]?.className?.toLowerCase().includes('numberer') ||
          cells[0]?.className?.toLowerCase().includes('stt') ||
          cells[1]?.className?.toLowerCase().includes('ma_hs') ||
          cells[1]?.className?.toLowerCase().includes('mahs')
        )
      );
      const studentSttText = hasStudentIdentity ? (cells[0]?.textContent || '').trim() : '';

      // 2. Hàm kiểm tra ô có phải là ô cấm đọc (STT, Mã HS, Họ tên, Ngày sinh, SMS, Textarea)
      function isInvalidScoreCell(c) {
        if (!c) return true;
        if (c.querySelector?.('textarea') || c.tagName === 'TEXTAREA') return true;

        if (hasStudentIdentity) {
          // Ô đầu tiên là STT -> CẤM ĐỌC
          if (c === cells[0] || c.cellIndex === 0) return true;
          // Ô thứ hai là Mã HS -> CẤM ĐỌC
          if (c === cells[1] || c.cellIndex === 1) return true;
        }

        const rawTxt = (c.textContent || '').trim();
        // Kiểm tra nếu ô chứa ngày sinh dd/mm/yyyy
        if (/\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(rawTxt)) return true;

        const cls = ((c.className || '') + ' ' + (c.parentElement?.className || '')).toLowerCase();
        if (/\b(?:numberer|stt|so_tt|ma_hs|mahs|ho_ten|hoten|ten|ngay_sinh|ngaysinh|sms|lien_lac|lienlac)\b/.test(cls)) {
          return true;
        }
        if (c.closest?.('.x-grid3-locked, .x-grid-inner-locked, [class*="-locked"]')) {
          return true;
        }
        return false;
      }

      function getCellText(c) {
        if (!c || isInvalidScoreCell(c)) return '';
        const inp = c.querySelector?.('input, select');
        const txt = (inp ? (inp.value || '') : (c.textContent || '')).trim();
        return txt;
      }

      function getScoreFromElement(sc) {
        if (!sc) return null;
        if (hasStudentIdentity && sc.index >= 0 && sc.index < 3) {
          return null; // Bỏ qua STT, Mã HS
        }
        let val = '';
        if (sc.colClass) {
          const el = scoreRow.querySelector('.' + sc.colClass) ||
                     scoreRow.querySelector('.' + sc.colClass.replace('x-grid3-td-', 'x-grid3-col-'));
          if (el && !isInvalidScoreCell(el)) val = getCellText(el);
        }
        if (!val && sc.index >= 0 && sc.index < cells.length) {
          if (sc.index === 0 && hasStudentIdentity) return null;
          const cell = cells[sc.index];
          if (cell && !isInvalidScoreCell(cell)) val = getCellText(cell);
        }
        if (!val) return null;
        if (hasStudentIdentity && studentSttText && val === studentSttText && sc.index <= 0) {
          return null;
        }
        const res = VnEduBaseAdapter.parseCellRatingAndScore(val, {
          allowScore: true,
          isScored: true,
          isRatingColumn: false,
          educationLevel: options.educationLevel
        });
        return res.score;
      }

      let finalScore = null;
      let explicitRating = null;

      // =========================================================================
      // BƯỚC 1: TRÍCH XUẤT ĐIỂM SỐ (Nếu cho phép điểm số)
      // =========================================================================
      if (allowScore) {
        // 1.1. Quét qua danh sách scoreColumns đã phân loại
        if (options.scoreColumns && options.scoreColumns.length > 0) {
          const typeGroups = { DTB: [], CK: [], GK: [], TX: [], GENERAL: [] };
          options.scoreColumns.forEach(sc => {
            const t = sc.type || sc.group || 'GENERAL';
            if (typeGroups[t]) typeGroups[t].push(sc);
            else typeGroups.GENERAL.push(sc);
          });

          let dtbScore = null;
          let ckScore = null;
          let gkScore = null;
          const txScores = [];
          let generalScore = null;

          // 1. Cột ĐTB (ĐTBmhk, TBMhk, ĐTBcn, TBM)
          for (const sc of typeGroups.DTB) {
            const s = getScoreFromElement(sc);
            if (s !== null) { dtbScore = s; break; }
          }

          // 2. Cột Cuối kỳ (ĐĐGck, CK, Thi)
          for (const sc of typeGroups.CK) {
            const s = getScoreFromElement(sc);
            if (s !== null) { ckScore = s; break; }
          }

          // 3. Cột Giữa kỳ (ĐĐGgk, GK)
          for (const sc of typeGroups.GK) {
            const s = getScoreFromElement(sc);
            if (s !== null) { gkScore = s; break; }
          }

          // 4. Các cột Thường xuyên (TX1, TX2, TX3, TX4, TX5, Miệng, 15p, 1 tiết)
          for (const sc of typeGroups.TX) {
            const s = getScoreFromElement(sc);
            if (s !== null) txScores.push(s);
          }

          // 5. Cột chung GENERAL
          for (const sc of typeGroups.GENERAL) {
            const s = getScoreFromElement(sc);
            if (s !== null) { generalScore = s; break; }
          }

          // =========================================================================
          // Áp dụng thứ tự ưu tiên chuẩn sư phạm:
          // =========================================================================
          // NGUYÊN TẮC BẮT BUỘC (Quy chế đánh giá Thông tư 22/2021/TT-BGDĐT):
          // 1. Nếu bảng điểm có cột ĐTB (ĐTBmhk, TBMhk, ĐTBcn, TBM) -> Sổ điểm học kỳ môn học:
          //    Việc nhận xét học sinh BẮT BUỘC PHẢI DỰA VÀO CỘT "ĐTBmhk" (điểm trung bình môn học kì)!
          //    - Nếu học sinh đã có điểm ĐTB: lấy finalScore = dtbScore.
          //    - Nếu học sinh CHƯA CÓ ĐIỂM ĐTB (ô ĐTBmhk đang trống): finalScore = null!
          //      TUYỆT ĐỐI KHÔNG tự tiện lấy điểm 1 bài kiểm tra thường xuyên (TX1..TX5) hay GK/CK để nhận xét thay thế!
          // 2. Nếu bảng không có cột ĐTB nhưng có cột Cuối kỳ (CK): Bắt buộc dựa vào CK.
          // 3. Nếu bảng giữa kỳ (chỉ có cột GK và TX, không có ĐTB/CK): Bắt buộc dựa vào GK.
          // 4. Chỉ khi bảng điểm CHỈ CÓ CÁC CỘT TX (không có bất kỳ cột tổng kết ĐTB/CK/GK nào):
          //    Mới tính trung bình các bài kiểm tra thường xuyên (txScores).
          if (typeGroups.DTB.length > 0) {
            finalScore = dtbScore; // Bảng có cột ĐTBmhk: BẮT BUỘC lấy ĐTBmhk; nếu ô trống thì giữ null
          } else if (typeGroups.CK.length > 0) {
            finalScore = ckScore;  // Bảng có cột CK: BẮT BUỘC lấy CK; nếu ô trống thì giữ null
          } else if (typeGroups.GK.length > 0) {
            finalScore = gkScore;  // Bảng có cột GK: BẮT BUỘC lấy GK; nếu ô trống thì giữ null
          } else if (txScores.length > 0) {
            const avg = txScores.reduce((acc, v) => acc + v, 0) / txScores.length;
            finalScore = Math.round(avg * 10) / 10;
          } else if (generalScore !== null) {
            finalScore = generalScore;
          }
        }

        // 1.2. Fallback qua scoreColClass hoặc scoreColIdx
        // CHỈ fallback khi BẢNG KHÔNG CÓ bất kỳ cột tổng kết ĐTB/CK/GK nào!
        // Nếu bảng ĐÃ CÓ cột ĐTBmhk mà ô ĐTBmhk trống, TUYỆT ĐỐI KHÔNG fallback sang ô khác!
        const hasSpecificSummaryCol = options.scoreColumns && options.scoreColumns.some(sc => {
          const t = sc.type || sc.group;
          return t === 'DTB' || t === 'CK' || t === 'GK';
        });

        if (finalScore === null && !hasSpecificSummaryCol && options.scoreColClass) {
          const el = scoreRow.querySelector('.' + options.scoreColClass) ||
                     scoreRow.querySelector('.' + options.scoreColClass.replace('x-grid3-td-', 'x-grid3-col-'));
          if (el && !isInvalidScoreCell(el)) {
            const res = VnEduBaseAdapter.parseCellRatingAndScore(getCellText(el), {
              allowScore: true,
              isScored: true,
              isRatingColumn: false,
              educationLevel: options.educationLevel
            });
            if (res.score !== null) finalScore = res.score;
          }
        }

        if (finalScore === null && !hasSpecificSummaryCol && scoreColIdx >= 0 && scoreColIdx < cells.length) {
          if (!hasStudentIdentity || scoreColIdx >= 2) {
            const cell = cells[scoreColIdx];
            if (cell && !isInvalidScoreCell(cell)) {
              const res = VnEduBaseAdapter.parseCellRatingAndScore(getCellText(cell), {
                allowScore: true,
                isScored: true,
                isRatingColumn: false,
                educationLevel: options.educationLevel
              });
              if (res.score !== null) finalScore = res.score;
            }
          }
        }
      }

      // =========================================================================
      // BƯỚC 2: TRÍCH XUẤT XẾP LOẠI CHỮ (T, H, C, Đ, CĐ, K, hoặc số 2, 1, 0)
      // =========================================================================
      // LUÔN LUÔN trích xuất xếp loại nếu có cột xếp loại hoặc giá trị xếp loại trong hàng!
      // Bắt buộc cho cấp Tiểu học (TT27) và môn nhận xét THCS/THPT (TT22).

      // 2.0. ĐỐI VỚI MÔN NHẬN XÉT THCS/THPT (Đ/CĐ trên khung bảng điểm vnEdu có TX, GK, CK, ĐTB):
      // Giáo viên nhập Đ hoặc CĐ (hoặc phím tắt d, đ, 1 hoặc c, cd, 2) vào các cột điểm (TX1-TX5, GK, CK, ĐTB)
      if (!explicitRating && !options.isScored && options.scoreColumns && options.scoreColumns.length > 0) {
        const hasDtbCol = options.scoreColumns.some(sc => (sc.type || sc.group) === 'DTB');
        const hasCkCol = !hasDtbCol && options.scoreColumns.some(sc => (sc.type || sc.group) === 'CK');
        const hasGkCol = !hasDtbCol && !hasCkCol && options.scoreColumns.some(sc => (sc.type || sc.group) === 'GK');

        const priorityTypes = hasDtbCol ? ['DTB'] : (hasCkCol ? ['CK'] : (hasGkCol ? ['GK'] : ['TX', 'GENERAL']));
        for (const pType of priorityTypes) {
          const matchingCols = options.scoreColumns.filter(sc => (sc.type || sc.group || 'GENERAL') === pType);
          for (const sc of matchingCols) {
            let val = '';
            if (sc.colClass) {
              const el = scoreRow.querySelector('.' + sc.colClass) ||
                         scoreRow.querySelector('.' + sc.colClass.replace('x-grid3-td-', 'x-grid3-col-'));
              if (el && !isInvalidScoreCell(el)) val = getCellText(el);
            }
            if (!val && sc.index >= 0 && sc.index < cells.length) {
              const cell = cells[sc.index];
              if (cell && !isInvalidScoreCell(cell)) val = getCellText(cell);
            }
            if (val) {
              const res = VnEduBaseAdapter.parseCellRatingAndScore(val, {
                allowScore: false,
                isScored: false,
                isRatingColumn: true,
                educationLevel: options.educationLevel
              });
              if (res.rating) {
                explicitRating = res.rating;
                break;
              }
            }
          }
          if (explicitRating) break;
        }
      }

      // 2.1. Kiểm tra qua class cột xếp loại
      if (options.ratingColClass) {
        const c = scoreRow.querySelector('.' + options.ratingColClass) ||
                 scoreRow.querySelector('.' + options.ratingColClass.replace('x-grid3-td-', 'x-grid3-col-'));
        if (c && !isInvalidScoreCell(c)) {
          const res = VnEduBaseAdapter.parseCellRatingAndScore(getCellText(c), {
            allowScore: false,
            isScored: false,
            isRatingColumn: true,
            educationLevel: options.educationLevel
          });
          if (res.rating) explicitRating = res.rating;
        }
      }

      // 2.2. Kiểm tra qua chỉ số cột xếp loại
      if (!explicitRating && ratingColIdx >= 0 && ratingColIdx < cells.length) {
        if (!hasStudentIdentity || ratingColIdx > 0) {
          const c = cells[ratingColIdx];
          if (c && !isInvalidScoreCell(c)) {
            const res = VnEduBaseAdapter.parseCellRatingAndScore(getCellText(c), {
              allowScore: false,
              isScored: false,
              isRatingColumn: true,
              educationLevel: options.educationLevel
            });
            if (res.rating) explicitRating = res.rating;
          }
        }
      }

      // 2.3. Fallback tìm theo thuộc tính class hoặc data-index chứa 'xl'
      if (!explicitRating) {
        const xlCell = scoreRow.querySelector('[class*="xl" i], [data-index*="xl" i], [class*="xeploai" i], [class*="mucdat" i]');
        if (xlCell && !isInvalidScoreCell(xlCell)) {
          const res = VnEduBaseAdapter.parseCellRatingAndScore(getCellText(xlCell), {
            allowScore: false,
            isScored: false,
            isRatingColumn: true,
            educationLevel: options.educationLevel
          });
          if (res.rating) explicitRating = res.rating;
        }
      }

      // 2.4. Smart Scan: Quét các ô trong hàng để nhận diện xếp loại nếu vẫn chưa tìm thấy
      if (!explicitRating) {
        for (let ci = 0; ci < cells.length; ci++) {
          if (hasStudentIdentity && ci < 2) continue; // Bỏ qua STT, Mã HS
          const cell = cells[ci];
          if (!cell || isInvalidScoreCell(cell)) continue;
          const text = getCellText(cell);
          if (!text || text.length > 15) continue; // Xếp loại là chuỗi ngắn (T, H, C, Đ, CĐ, 2, 1, 0...)
          const res = VnEduBaseAdapter.parseCellRatingAndScore(text, {
            allowScore: false,
            isScored: false,
            isRatingColumn: true,
            educationLevel: options.educationLevel
          });
          if (res.rating) {
            explicitRating = res.rating;
            break;
          }
        }
      }

      // =========================================================================
      // BƯỚC 3: TỔNG HỢP VÀ KẾT LUẬN ĐÁNH GIÁ CỦA HỌC SINH
      // =========================================================================
      // 1. CẤP TIỂU HỌC (Thông tư 27):
      // Trên Sổ nhận xét vnEdu giáo viên đánh giá học sinh bằng MỨC ĐẠT (T, H, C).
      // Dù là môn nào (kể cả Toán, Tiếng Việt, Tin học...), nếu đã có xếp loại T/H/C thì BẮT BUỘC dùng xếp loại đó!
      if (isPrimary) {
        if (explicitRating) {
          return {
            rating: explicitRating,
            score: finalScore,
            hasRating: true,
            hasScore: finalScore !== null
          };
        }
        if (finalScore !== null) {
          const derivedLevel = finalScore >= 8.0 ? 'T' : (finalScore >= 5.0 ? 'H' : 'C');
          return {
            rating: derivedLevel,
            score: finalScore,
            hasRating: true,
            hasScore: true
          };
        }
        return { rating: null, score: null, hasRating: false, hasScore: false };
      }

      // 2. CẤP THCS & THPT (Thông tư 22):
      // 2a. Môn tính điểm (options.isScored === true):
      if (options.isScored) {
        if (finalScore !== null) {
          const derivedLevel = finalScore >= 8.0 ? 'T' : (finalScore >= 6.5 ? 'K' : (finalScore >= 5.0 ? 'H' : 'C'));
          return {
            rating: explicitRating || derivedLevel,
            score: finalScore,
            hasRating: true,
            hasScore: true
          };
        }
        // Nếu không có điểm số nhưng có explicitRating (giáo viên nhập trực tiếp xếp loại):
        if (explicitRating) {
          return {
            rating: explicitRating,
            score: null,
            hasRating: true,
            hasScore: false
          };
        }
        // Chưa nhập điểm số con -> BỎ QUA!
        return { rating: null, score: null, hasRating: false, hasScore: false };
      }

      // 2b. Môn đánh giá bằng nhận xét thuần túy (Đ / CĐ):
      if (explicitRating) {
        return {
          rating: explicitRating,
          score: null,
          hasRating: true,
          hasScore: false
        };
      }

      // Hoàn toàn chưa có đánh giá nào (ô điểm và xếp loại đều trống)
      return { rating: null, score: null, hasRating: false, hasScore: false };
    }
  }

  // Registry for Adapters
  const adapterRegistry = [];

  function registerAdapter(adapterClass) {
    adapterRegistry.push(adapterClass);
  }

  function getBestAdapter(context = {}) {
    // 1. Cửa sổ modal đặc thù "Phẩm chất - Năng lực ghi học bạ"
    for (const AdapterCls of adapterRegistry) {
      if (AdapterCls.name === 'VnEduFormAdapter') {
        const instance = new AdapterCls(context);
        if (instance.canHandle()) {
          return instance;
        }
      }
    }
    // 2. Bảng ExtJS Grid (đặc thù vnEdu với cột khóa locked và viewport cuộn)
    for (const AdapterCls of adapterRegistry) {
      if (AdapterCls.name === 'VnEduGridAdapter') {
        const instance = new AdapterCls(context);
        if (instance.canHandle()) {
          return instance;
        }
      }
    }
    // 3. Các Adapter bảng thông thường còn lại (VnEduTableAdapter, ...)
    for (const AdapterCls of adapterRegistry) {
      const instance = new AdapterCls(context);
      if (instance.canHandle()) {
        return instance;
      }
    }
    // Return default instance if none specifically matched
    const DefaultCls = adapterRegistry[0] || VnEduBaseAdapter;
    return new DefaultCls(context);
  }

  return {
    VnEduBaseAdapter,
    registerAdapter,
    getBestAdapter,
    adapterRegistry
  };
});
