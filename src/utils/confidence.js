/**
 * Confidence Scoring for Field Detection & Mapping Safety
 * Enforces strict thresholds before allowing batch operations.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VnEduConfidence = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const THRESHOLDS = {
    AUTO_APPROVE_FIELD: 90,
    WARNING_FIELD: 70,
    MIN_MAPPING_FOR_BATCH: 95
  };

  /**
   * Calculate confidence score (0 - 100) that an element is a genuine student comment field
   */
  function calculateFieldConfidence(element, context = {}) {
    if (!element) return 0;

    let score = 0;
    const tagName = (element.tagName || '').toUpperCase();
    const type = (element.getAttribute('type') || '').toLowerCase();
    const isContentEditable = element.getAttribute('contenteditable') === 'true';

    // Disqualifications (instant score 0)
    if (element.disabled || element.readOnly) {
      // If disabled/readonly, could be read-only preview, disqualify for filling
      return 0;
    }
    if (type === 'password' || type === 'hidden' || type === 'checkbox' || type === 'radio' || type === 'submit') {
      return 0;
    }
    if (element.classList && (element.classList.contains('search') || element.classList.contains('filter'))) {
      return 0;
    }

    // 1. Tag suitability
    if (tagName === 'TEXTAREA') {
      score += 40;
    } else if (isContentEditable) {
      score += 35;
    } else if (tagName === 'INPUT' && (type === 'text' || type === '')) {
      score += 25;
      // Score penalty if input has very small maxlength (e.g. score column maxlength="2" or "4")
      const maxLen = parseInt(element.getAttribute('maxlength'), 10);
      if (maxLen && maxLen <= 5) return 0; // Likely a numeric score input
    } else {
      return 0;
    }

    // 2. Keyword signals in attributes (placeholder, name, id, aria-label, title)
    const attrString = [
      element.placeholder || '',
      element.name || '',
      element.id || '',
      element.getAttribute('aria-label') || '',
      element.getAttribute('title') || '',
      element.className || ''
    ].join(' ').toLowerCase();

    const COMMENT_KEYWORDS = [
      'nhận xét', 'nhan xet', 'nhan_xet', 'comment', 'danh gia', 'đánh giá',
      'nx_', 'nx môn', 'nxmon', 'nhanxet', 'nx_dinhky', 'nx_thuongxuyen'
    ];
    const EXCLUDED_KEYWORDS = ['search', 'timkiem', 'tìm kiếm', 'diem', 'điểm', 'score', 'masv', 'mahs', 'otp', 'pass'];

    for (const badKw of EXCLUDED_KEYWORDS) {
      if (attrString.includes(badKw)) {
        return 0; // Hard disqualification
      }
    }

    let keywordMatched = false;
    for (const kw of COMMENT_KEYWORDS) {
      if (attrString.includes(kw)) {
        score += 35;
        keywordMatched = true;
        break;
      }
    }

    // 3. Table Column Header signals
    if (context.headerText) {
      const headerLower = context.headerText.toLowerCase();
      if (COMMENT_KEYWORDS.some(kw => headerLower.includes(kw))) {
        score += 30;
      } else if (/điểm|stt|họ tên|mã|ngày sinh/.test(headerLower)) {
        score -= 40;
      }
    }

    // 4. Nearby label text or parent row context
    if (context.rowHasStudentName) {
      score += 15;
    }

    // 5. Parent cell class or attributes
    if (element.closest('td, th, [role="gridcell"], [role="cell"]')) {
      score += 10;
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Calculate mapping confidence between detected students and detected comment fields
   */
  function calculateMappingConfidence(students = [], fields = [], options = {}) {
    const studentCount = students.length;
    const fieldCount = fields.length;

    if (studentCount === 0 || fieldCount === 0) {
      return {
        confidence: 0,
        safeForBatch: false,
        reason: 'Không tìm thấy học sinh hoặc ô nhận xét trên trang.'
      };
    }

    if (studentCount !== fieldCount) {
      return {
        confidence: Math.round((Math.min(studentCount, fieldCount) / Math.max(studentCount, fieldCount)) * 80),
        safeForBatch: false,
        reason: `Số lượng không khớp: ${studentCount} học sinh nhưng có ${fieldCount} ô nhận xét.`
      };
    }

    let validRows = 0;
    let fieldConfidenceSum = 0;

    for (let i = 0; i < studentCount; i++) {
      const student = students[i];
      const fieldObj = fields[i];

      if (!student || !fieldObj) continue;

      // Check if row matches
      if (student.rowElement && fieldObj.rowElement && student.rowElement === fieldObj.rowElement) {
        validRows++;
      } else if (student.index === fieldObj.index) {
        validRows += 0.9;
      }

      fieldConfidenceSum += (fieldObj.confidence || 90);
    }

    const rowMatchRatio = validRows / studentCount;
    const avgFieldConfidence = fieldConfidenceSum / fieldCount;

    let overallConfidence = Math.round(rowMatchRatio * 60 + (avgFieldConfidence / 100) * 40);

    // If duplicate names exist without explicit IDs, deduct confidence
    if (options.hasDuplicateNames) {
      overallConfidence = Math.min(overallConfidence, 85);
      return {
        confidence: overallConfidence,
        safeForBatch: false,
        reason: '⚠️ Phát hiện học sinh trùng họ tên. Cần giáo viên đối soát thủ công trước khi điền.'
      };
    }

    const safeForBatch = overallConfidence >= THRESHOLDS.MIN_MAPPING_FOR_BATCH && studentCount === fieldCount;

    return {
      confidence: overallConfidence,
      safeForBatch,
      studentCount,
      fieldCount,
      reason: safeForBatch
        ? `Độ chính xác mapping đạt ${overallConfidence}% (${studentCount}/${fieldCount} khớp hoàn toàn).`
        : `Độ chính xác mapping ${overallConfidence}% chưa đạt ngưỡng an toàn 95%.`
    };
  }

  return {
    THRESHOLDS,
    calculateFieldConfidence,
    calculateMappingConfidence
  };
});
