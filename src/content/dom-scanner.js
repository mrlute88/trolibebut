/**
 * DOM Scanner
 * High-level scanner coordinating Adapters, Detectors, and Confidence scoring.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../adapters/vnedu-adapter'),
      require('./page-detector'),
      require('./selector-memory'),
      require('../utils/vietnamese-name'),
      require('../utils/confidence'),
      require('../utils/logger')
    );
  } else {
    root.VnEduDOMScanner = factory(
      root.VnEduBaseAdapter,
      root.VnEduPageDetector,
      root.VnEduSelectorMemory,
      root.VietnameseNameDetector,
      root.VnEduConfidence,
      root.VnEduLogger
    );
  }
})(typeof self !== 'undefined' ? self : this, function (
  BaseAdapterModule,
  PageDetector,
  SelectorMemory,
  VietnameseNameDetector,
  ConfidenceModule,
  Logger
) {
  const { getBestAdapter } = BaseAdapterModule;

  async function scanPage() {
    if (Logger) Logger.info('Bắt đầu quét cấu trúc trang vnEdu...');

    // 1. Page Detection & Strict Scope Whitelist Verification
    const pageInfo = PageDetector.detectCurrentPage();

    if (!pageInfo.canOperate || !pageInfo.isAssessmentPage) {
      if (Logger) Logger.warn(`Trang không hợp lệ để điền nhận xét (${pageInfo.type}): ${pageInfo.message}`);
      return {
        canOperate: false,
        isAssessmentPage: false,
        pageType: pageInfo.type,
        pageMessage: pageInfo.message,
        disallowedReason: pageInfo.disallowedReason || '',
        adapter: null,
        adapterName: 'None',
        students: [],
        studentCount: 0,
        commentFields: [],
        fieldCount: 0,
        mapping: [],
        ratingStats: { T: 0, H: 0, C: 0, scoredCount: 0, ratedCount: 0, total: 0 },
        validation: { valid: false, confidence: 0, errors: [pageInfo.message] }
      };
    }

    // 2. Select best adapter
    const adapter = getBestAdapter();
    const adapterName = adapter ? adapter.name : 'UnknownAdapter';

    if (!adapter || (typeof adapter.canHandle === 'function' && !adapter.canHandle())) {
      return {
        canOperate: false,
        isAssessmentPage: false,
        pageType: pageInfo.type,
        pageMessage: '⚠️ Không tìm thấy bảng sổ nhận xét hoặc đánh giá học sinh hợp lệ trên màn hình.',
        adapter: null,
        adapterName: 'None',
        students: [],
        studentCount: 0,
        commentFields: [],
        fieldCount: 0,
        mapping: [],
        ratingStats: { T: 0, H: 0, C: 0, scoredCount: 0, ratedCount: 0, total: 0 },
        validation: { valid: false, confidence: 0, errors: ['Không tìm thấy bảng điểm hoặc sổ nhận xét phù hợp'] }
      };
    }

    // 3. Detect Class & Subject
    const classInfo = adapter.detectClass();
    const subjectInfo = adapter.detectSubject();

    // 4. Check for saved custom selectors
    const savedSelectors = await SelectorMemory.loadSelectorsForCurrentPage();

    // 5. Detect Students and Comment Fields
    let students = adapter.detectStudents();
    let fields = adapter.detectCommentFields();

    // If custom selector saved and fields not found or low confidence, try saved selector
    if (savedSelectors && savedSelectors.commentFieldSelector && fields.length === 0) {
      const customElements = Array.from(document.querySelectorAll(savedSelectors.commentFieldSelector));
      if (customElements.length > 0) {
        fields = customElements.map((el, idx) => ({
          index: idx + 1,
          element: el,
          rowElement: el.closest('tr, [role="row"], .grid-row'),
          confidence: 92,
          tagName: el.tagName.toLowerCase()
        }));
      }
    }

    // 6. Detect duplicate names among students
    const duplicateCheck = VietnameseNameDetector.detectDuplicates(students);

    // 7. Check education level and if current subject is scored under Circular 27 / Circular 22
    const numGrade = parseInt(classInfo.grade, 10) || 1;
    let detectedLevel = 'PRIMARY';
    if (numGrade >= 10) {
      detectedLevel = 'HIGH_SCHOOL';
    } else if (numGrade >= 6) {
      detectedLevel = 'SECONDARY';
    } else {
      detectedLevel = 'PRIMARY';
    }

    let isScored = false;
    const c27 = typeof VnEduCircular27Rules !== 'undefined' ? VnEduCircular27Rules : null;
    if (c27 && typeof c27.isSubjectScored === 'function') {
      isScored = c27.isSubjectScored(classInfo.grade, subjectInfo.period, subjectInfo.subject, detectedLevel);
    }

    // 8. Map students to fields with isScored and educationLevel rules
    const mapping = adapter.mapStudentsToFields(students, fields, {
      isScored,
      educationLevel: detectedLevel
    });

    // 9. Validate mapping
    const validation = adapter.validateMapping(mapping, {
      hasDuplicateNames: duplicateCheck.hasDuplicates
    });

    const ratingStats = {
      T: mapping.filter(m => m.hasRating && m.rating === 'T').length,
      H: mapping.filter(m => m.hasRating && m.rating === 'H').length,
      C: mapping.filter(m => m.hasRating && m.rating === 'C').length,
      scoredCount: mapping.filter(m => m.hasScore).length,
      ratedCount: mapping.filter(m => m.hasRating || m.hasScore).length,
      total: mapping.length
    };

    const report = {
      canOperate: true,
      pageType: pageInfo.type,
      isAssessmentPage: pageInfo.isAssessmentPage,
      pageMessage: pageInfo.message,
      adapter,
      adapterName,
      className: classInfo.className,
      grade: classInfo.grade,
      educationLevel: detectedLevel,
      schoolYear: classInfo.schoolYear,
      semester: classInfo.semester,
      subject: subjectInfo.subject,
      period: subjectInfo.period,
      isScored,
      students,
      studentCount: students.length,
      commentFields: fields,
      fieldCount: fields.length,
      mapping,
      ratingStats,
      validation,
      duplicateCheck
    };

    if (Logger) {
      Logger.info(`Kết quả quét: ${students.length} học sinh, ${fields.length} ô nhận xét. Mapping confidence: ${validation.confidence}%`);
    }

    return report;
  }

  let cachedAdapter = null;
  function getAdapter() {
    return cachedAdapter || getBestAdapter();
  }

  return {
    scanPage,
    getAdapter
  };
});
