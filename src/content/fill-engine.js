/**
 * Fill Engine
 * Executes safe, controlled batch and single-row comment injection into vnEdu.
 * STRICT SAFETY: NEVER CLICKS SAVE / GHI / SUBMIT.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../utils/dom-utils'),
      require('../utils/confidence'),
      require('../utils/quality-checker'),
      require('../storage/chrome-storage'),
      require('../utils/logger'),
      require('../utils/vietnamese-name')
    );
  } else {
    root.VnEduFillEngine = factory(
      root.VnEduDOMUtils,
      root.VnEduConfidence,
      root.VnEduQualityChecker,
      root.VnEduStorage,
      root.VnEduLogger,
      root.VietnameseNameDetector
    );
  }
})(typeof self !== 'undefined' ? self : this, function (
  DOMUtils,
  ConfidenceModule,
  QualityChecker,
  Storage,
  Logger,
  VietnameseNameDetector
) {
  let isFilling = false;
  let cancelRequested = false;

  function cancelFill() {
    if (isFilling) {
      cancelRequested = true;
      if (Logger) Logger.warn('Giáo viên đã bấm dừng quá trình điền dữ liệu.');
    }
  }

  /**
   * Pre-check anti-mismatch: ensures the target DOM row still holds the expected student name
   */
  function verifyRowIntegrity(mappingItem, options = {}) {
    if (!mappingItem || !mappingItem.student || !mappingItem.commentField) {
      return { ok: false, reason: 'Thông tin ánh xạ bị thiếu.' };
    }

    const { student, commentField } = mappingItem;
    const studentRowEl = student.rowElement;
    const commentRowEl = commentField.rowElement;
    const pairRowEl = commentField.pairRowElement || student.pairRowElement;

    // 1. Target comment field must still be in the DOM
    if (!commentField.element || !document.contains(commentField.element)) {
      return { ok: false, reason: 'Ô nhận xét không còn tồn tại trong DOM.' };
    }

    // 2. Student row must still be in the DOM (if captured)
    if (studentRowEl && !document.contains(studentRowEl)) {
      return { ok: false, reason: 'Dòng học sinh không còn tồn tại trong tài liệu DOM (bảng đã bị làm mới).' };
    }

    // 3. Comment row must still be in the DOM (if captured)
    if (commentRowEl && !document.contains(commentRowEl)) {
      return { ok: false, reason: 'Hàng chứa ô nhận xét không còn tồn tại trong DOM.' };
    }

    // 4. Student name verification
    if (student.studentName) {
      if (VietnameseNameDetector && VietnameseNameDetector.isHeaderOrLabel(student.studentName)) {
        return {
          ok: false,
          reason: `Lỗi dữ liệu: Tên học sinh là tiêu đề "${student.studentName}". Vui lòng quét lại trang.`
        };
      }

      // Helper to extract clean spaced text from an element and its child cells
      const extractRowText = (el) => {
        if (!el) return '';
        // 1. If element contains table cells or grid cells, join them with spaces
        const cells = el.querySelectorAll
          ? el.querySelectorAll('td, th, [role="gridcell"], [role="cell"], .x-grid3-cell, .x-grid3-cell-inner, .cell')
          : [];
        if (cells && cells.length > 0) {
          const cellTexts = Array.from(cells)
            .map(c => (c.textContent || '').trim())
            .filter(Boolean);
          if (cellTexts.length > 0) {
            return cellTexts.join(' ');
          }
        }
        // 2. If element has child elements, join their text with spaces
        if (el.children && el.children.length > 0) {
          const childTexts = Array.from(el.children)
            .map(c => (c.textContent || '').trim())
            .filter(Boolean);
          if (childTexts.length > 0) {
            return childTexts.join(' ');
          }
        }
        return el.textContent || '';
      };

      // Collect text from all candidate containers where the name might live
      // (Student row in locked table, comment row in scrollable table, or paired row)
      const textSources = [];
      if (studentRowEl) textSources.push(extractRowText(studentRowEl));
      if (commentRowEl) textSources.push(extractRowText(commentRowEl));
      if (pairRowEl && pairRowEl !== studentRowEl && pairRowEl !== commentRowEl) {
        textSources.push(extractRowText(pairRowEl));
      }

      const rawText = textSources.join(' ').replace(/\s+/g, ' ');
      const combinedText = (rawText.normalize ? rawText.normalize('NFC') : rawText).toLowerCase();
      const rawName = (student.studentName || '').trim().replace(/\s+/g, ' ');
      const studentNameLower = (rawName.normalize ? rawName.normalize('NFC') : rawName).toLowerCase();
      const words = studentNameLower.split(/\s+/).filter(Boolean);
      const lastName = words[words.length - 1] || '';
      const firstName = words[0] || '';

      // Split combined text into distinct words for exact word matching
      const rowWords = combinedText.split(/[\s,;:.|()\[\]\-_/]+/).filter(Boolean);

      // Check full name (substring match is safe for 2+ words)
      const hasFullName = words.length >= 2 && combinedText.includes(studentNameLower);
      // Check last name or first name by EXACT word match (prevents "an" matching inside "hoang")
      const hasLastName = lastName && rowWords.includes(lastName);
      const hasFirstName = firstName && rowWords.includes(firstName);

      // Compact match (removes all whitespace, digits, punctuation)
      // Handles cases where table cells are glued together in textContent (e.g. "8ThạchBảo01/01/2020")
      const cleanCombined = combinedText.replace(/[\s\d_.:;,|()\[\]\-_/\\]+/g, '');
      const cleanName = studentNameLower.replace(/[\s\d_.:;,|()\[\]\-_/\\]+/g, '');
      const hasCompactMatch = cleanName.length >= 2 && cleanCombined.includes(cleanName);

      // Check if all individual words of student name are present in row text
      const hasAllWordsMatch = words.length >= 2 && words.every(w => {
        return rowWords.includes(w) || combinedText.includes(w);
      });

      // Check without diacritics
      let hasNoAccentMatch = false;
      if (VietnameseNameDetector && VietnameseNameDetector.removeDiacritics) {
        const textNoAccent = VietnameseNameDetector.removeDiacritics(combinedText).toLowerCase();
        const nameNoAccent = VietnameseNameDetector.removeDiacritics(studentNameLower).toLowerCase();
        const lastNoAccent = VietnameseNameDetector.removeDiacritics(lastName).toLowerCase();
        const firstNoAccent = VietnameseNameDetector.removeDiacritics(firstName).toLowerCase();
        const rowWordsNoAccent = textNoAccent.split(/[\s,;:.|()\[\]\-_/]+/).filter(Boolean);

        const hasFullNoAccent = words.length >= 2 && textNoAccent.includes(nameNoAccent);
        const hasLastNoAccent = lastNoAccent && rowWordsNoAccent.includes(lastNoAccent);
        const hasFirstNoAccent = firstNoAccent && rowWordsNoAccent.includes(firstNoAccent);

        const cleanNoAccentText = textNoAccent.replace(/[\s\d_.:;,|()\[\]\-_/\\]+/g, '');
        const cleanNoAccentName = nameNoAccent.replace(/[\s\d_.:;,|()\[\]\-_/\\]+/g, '');
        const hasCompactNoAccent = cleanNoAccentName.length >= 2 && cleanNoAccentText.includes(cleanNoAccentName);

        const hasAllWordsNoAccent = words.length >= 2 && words.every(w => {
          const wNo = VietnameseNameDetector.removeDiacritics(w).toLowerCase();
          return rowWordsNoAccent.includes(wNo) || textNoAccent.includes(wNo);
        });

        hasNoAccentMatch = hasFullNoAccent || hasLastNoAccent || hasFirstNoAccent || hasCompactNoAccent || hasAllWordsNoAccent;
      }

      // Check student ID if available
      let hasIdMatch = false;
      if (student.studentId) {
        const cleanId = String(student.studentId).trim().toLowerCase();
        if (cleanId && rowWords.includes(cleanId)) {
          hasIdMatch = true;
        }
      }

      // Check index alignment in parent container (ExtJS split tables)
      let hasIndexAlignment = false;
      if (studentRowEl && commentRowEl) {
        const sGridRow = studentRowEl.closest ? (studentRowEl.closest('.x-grid3-row, .x-grid-row, [role="row"], tr') || studentRowEl) : studentRowEl;
        const cGridRow = commentRowEl.closest ? (commentRowEl.closest('.x-grid3-row, .x-grid-row, [role="row"], tr') || commentRowEl) : commentRowEl;

        const studentParent = sGridRow.parentElement;
        const commentParent = cGridRow.parentElement;
        if (studentParent && commentParent && studentParent.children?.length > 0 && commentParent.children?.length > 0) {
          const sIdx = Array.from(studentParent.children).indexOf(sGridRow);
          const cIdx = Array.from(commentParent.children).indexOf(cGridRow);
          if (sIdx >= 0 && sIdx === cIdx) {
            hasIndexAlignment = true;
          }
        }
      }

      const matched = hasFullName || hasLastName || hasFirstName || hasCompactMatch || hasAllWordsMatch || hasNoAccentMatch || hasIdMatch || hasIndexAlignment;

      if (!matched) {
        // If teacher disabled strict name check via options:
        if (options && options.strictRowNameCheck === false) {
          if (Logger) {
            Logger.warn(`[${student.studentName}] Bỏ qua kiểm tra tên hàng DOM do chế độ kiểm tra nghiêm ngặt đã tắt.`);
          }
          return { ok: true, warning: 'Bỏ qua kiểm tra tên dòng theo cấu hình.' };
        }

        return {
          ok: false,
          reason: `Phát hiện sai lệch: Hàng DOM không còn chứa học sinh "${student.studentName}".`
        };
      }
    }

    return { ok: true };
  }

  /**
   * Fill comment for a single student row
   */
  async function fillSingleRow(mappingItem, commentText, options = {}) {
    // Normalize arguments if called as (mappingItem, commentField, commentText, options)
    if (typeof commentText === 'object' && commentText !== null && (commentText.element || commentText.rowElement)) {
      const actualText = typeof options === 'string' ? options : (mappingItem.comment || '');
      options = arguments[3] || {};
      commentText = actualText;
    }

    if (!mappingItem || !mappingItem.commentField || !mappingItem.commentField.element) {
      return { success: false, reason: 'Không tìm thấy phần tử ô nhận xét.' };
    }

    // Validate quality of comment text
    let quality = QualityChecker.validateComment(commentText);
    if (!quality.valid) {
      if (Logger) {
        Logger.warn(`Chất lượng nhận xét chưa đạt cho [${mappingItem.student?.studentName || ''}]: ${quality.errors.join(', ')}. Sử dụng nhận xét chuẩn dự phòng.`);
      }
      const lvl = String(mappingItem.level || options.level || 'H').toUpperCase();
      if (lvl === 'C' || lvl === 'CĐ') {
        commentText = 'Cần chú ý lắng nghe và tích cực thực hành thêm trong giờ học.';
      } else if (lvl === 'T') {
        commentText = 'Tiếp thu bài rất tốt, chăm chỉ và tự giác trong giờ học.';
      } else {
        commentText = 'Hoàn thành các nhiệm vụ học tập theo hướng dẫn của giáo viên.';
      }
      quality = QualityChecker.validateComment(commentText);
      if (!quality.valid) {
        return { success: false, reason: `Chất lượng nhận xét chưa đạt: ${quality.errors.join(', ')}` };
      }
    }

    // Anti-mismatch row integrity check
    const integrity = verifyRowIntegrity(mappingItem, options);
    if (!integrity.ok) {
      return { success: false, reason: integrity.reason };
    }

    try {
      const adapter = options.adapter || mappingItem.adapter || null;
      let success = false;
      if (adapter && typeof adapter.fillComment === 'function') {
        const fillRes = await adapter.fillComment(mappingItem, commentText, options);
        success = (typeof fillRes === 'object' && fillRes !== null) ? Boolean(fillRes.success) : Boolean(fillRes);
        if (!success && typeof fillRes === 'object' && fillRes !== null && fillRes.message) {
          return { success: false, reason: fillRes.message, unrated: Boolean(fillRes.unrated) };
        }
      } else {
        success = DOMUtils.setFieldValue(mappingItem.commentField.element, commentText);
        if (options && options.fillRating !== false && (options.level || mappingItem.level)) {
          const lvl = options.level || mappingItem.level;
          if (adapter && typeof adapter.fillRatingCell === 'function') {
            try { adapter.fillRatingCell(mappingItem, lvl, options); } catch (e) {}
          }
        }
      }

      if (success) {
        mappingItem.status = 'FILLED';
        return { success: true };
      }
      return { success: false, reason: 'Không thể gán giá trị vào phần tử DOM.' };
    } catch (err) {
      return { success: false, reason: err.message || 'Lỗi không xác định khi gán giá trị.' };
    }
  }

  /**
   * Batch Fill Execution
   * Strictly stops when finished, NEVER clicks submit/save.
   */
  async function executeBatchFill(itemsToFill = [], options = {}, onProgress = null) {
    if (isFilling) {
      throw new Error('Một tiến trình điền khác đang diễn ra.');
    }

    isFilling = true;
    cancelRequested = false;

    const delayMs = Math.max(200, Math.min(1500, options.delayMs || 450));
    const total = itemsToFill.length;
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    const logs = [];

    if (Logger) Logger.info(`Bắt đầu điền hàng loạt cho ${total} học sinh (delay: ${delayMs}ms)...`);

    try {
      for (let i = 0; i < total; i++) {
        if (cancelRequested) {
          logs.push({
            index: i + 1,
            studentName: itemsToFill[i].student?.studentName || '',
            status: 'SKIPPED',
            message: 'Đã hủy theo yêu cầu của người dùng.'
          });
          skipCount++;
          continue;
        }

        const item = itemsToFill[i];
        const studentName = item.student?.studentName || `Học sinh ${i + 1}`;
        const commentText = item.comment || '';

        // Pre-row delay
        if (i > 0) {
          await DOMUtils.sleep(delayMs);
        }

        // Fill single row with options
        const rowOpts = {
          ...options,
          level: item.level || options.level,
          fillRating: options.fillRating !== false
        };
        const result = await fillSingleRow(item, commentText, rowOpts);

        if (result.success) {
          successCount++;
          logs.push({
            index: i + 1,
            studentName,
            status: 'SUCCESS',
            message: '✓ Đã điền thành công'
          });
        } else {
          errorCount++;
          logs.push({
            index: i + 1,
            studentName,
            status: 'ERROR',
            message: result.reason
          });
          if (Logger) Logger.warn(`Lỗi tại hàng [${studentName}]: ${result.reason}`);
        }

        // Report progress
        if (typeof onProgress === 'function') {
          onProgress({
            current: i + 1,
            total,
            percent: Math.round(((i + 1) / total) * 100),
            successCount,
            skipCount,
            errorCount,
            currentStudent: studentName,
            latestLog: logs[logs.length - 1]
          });
        }
      }
    } finally {
      isFilling = false;
      cancelRequested = false;
    }

    // Save session to history
    Storage.addHistorySession({
      total,
      successCount,
      errorCount,
      skipCount,
      completedAt: new Date().toISOString()
    });

    if (Logger) {
      Logger.success(`Hoàn tất điền dữ liệu: ${successCount}/${total} thành công. DỪNG LẠI (Không bấm nút Lưu).`);
    }

    return {
      total,
      successCount,
      skipCount,
      errorCount,
      logs,
      message: `✅ Đã điền ${successCount}/${total} nhận xét.\n⚠️ Giáo viên vui lòng kiểm tra lại nội dung trước khi bấm Lưu/Ghi trên vnEdu.`
    };
  }

  return {
    isFilling: () => isFilling,
    cancelFill,
    verifyRowIntegrity,
    fillSingleRow,
    executeBatchFill
  };
});
