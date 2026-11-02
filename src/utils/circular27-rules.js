/**
 * Assessment Rules Engine for Vietnam K-12 Education (Lớp 1 - 12)
 * - Cấp Tiểu học (Lớp 1 - 5): Tuân thủ Thông tư 27/2020/TT-BGDĐT
 * - Cấp THCS (Lớp 6 - 9) & THPT (Lớp 10 - 12): Tuân thủ Thông tư 22/2021/TT-BGDĐT (GDPT 2018)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const rules = factory();
    root.VnEduCircular27Rules = rules; // Giữ tương thích ngược với code hiện tại
    root.VnEduAssessmentRules = rules; // Tên mới phản ánh đầy đủ Lớp 1 - 12
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 4 Đợt đánh giá chuẩn (Hỗ trợ cả Tiểu học, THCS và THPT)
  const PERIODS = {
    GK1: {
      code: 'GK1',
      name: 'Giữa học kì 1',
      shortName: 'Giữa HK1',
      term: 'MID_TERM',
      semester: '1'
    },
    CK1: {
      code: 'CK1',
      name: 'Cuối học kì 1',
      shortName: 'Cuối HK1',
      term: 'END_TERM',
      semester: '1'
    },
    GK2: {
      code: 'GK2',
      name: 'Giữa học kì 2',
      shortName: 'Giữa HK2',
      term: 'MID_TERM',
      semester: '2'
    },
    CK2: {
      code: 'CK2',
      name: 'Cuối học kì 2 / Cả năm',
      shortName: 'Cuối HK2 / CN',
      term: 'END_TERM',
      semester: '2'
    }
  };

  const PERIOD_LIST = ['GK1', 'CK1', 'GK2', 'CK2'];
  const GRADE_LIST = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
  const PRIMARY_GRADES = ['1', '2', '3', '4', '5'];
  const SECONDARY_GRADES = ['6', '7', '8', '9'];
  const HIGH_SCHOOL_GRADES = ['10', '11', '12'];

  /**
   * Xác định cấp học dựa vào khối lớp
   */
  function getEducationLevel(grade) {
    const g = normalizeGrade(grade);
    const num = parseInt(g, 10);
    if (num <= 5) return 'PRIMARY'; // Tiểu học
    if (num <= 9) return 'SECONDARY'; // THCS (Cấp 2)
    return 'HIGH_SCHOOL'; // THPT (Cấp 3)
  }

  /**
   * Lấy văn bản thông tư quy định tương ứng
   */
  function getAssessmentStandard(grade) {
    const level = getEducationLevel(grade);
    return level === 'PRIMARY' ? 'Thông tư 27/2020/TT-BGDĐT' : 'Thông tư 22/2021/TT-BGDĐT';
  }

  /**
   * Chuẩn hóa chuỗi đợt đánh giá
   */
  function normalizePeriod(rawPeriod) {
    if (!rawPeriod) return 'GK1';
    const text = String(rawPeriod).toLowerCase().trim();

    if (/cuối\s*(?:học\s*)?k[ỳìyi]\s*2|cuối\s*năm|\bck2\b|\bcn\b|cả\s*năm/i.test(text)) return 'CK2';
    if (/giữa\s*(?:học\s*)?k[ỳìyi]\s*2|\bgk2\b/i.test(text)) return 'GK2';
    if (/cuối\s*(?:học\s*)?k[ỳìyi]\s*1|\bck1\b/i.test(text)) return 'CK1';
    if (/giữa\s*(?:học\s*)?k[ỳìyi]\s*1|\bgk1\b/i.test(text)) return 'GK1';

    return 'GK1';
  }

  /**
   * Chuẩn hóa khối lớp (1 - 12)
   */
  function normalizeGrade(rawGrade) {
    if (!rawGrade) return '1';
    const str = String(rawGrade).trim();
    // Ưu tiên khối 2 chữ số 10, 11, 12 trước
    const match10to12 = str.match(/\b(1[0-2])\b/) || str.match(/(1[0-2])/);
    if (match10to12) return match10to12[1];

    // Khối 1 đến 9
    const match1to9 = str.match(/\b([1-9])\b/) || str.match(/([1-9])/);
    if (match1to9) return match1to9[1];

    return '1';
  }

  /**
   * Chuẩn hóa tên môn học về tên chuẩn cho tất cả khối lớp 1 - 12
   */
  function normalizeSubjectName(rawSubject, educationLevel = null) {
    if (!rawSubject) return 'Toán';
    const s = String(rawSubject).trim().toLowerCase();

    let edLevel = null;
    if (educationLevel) {
      const elStr = String(educationLevel).toUpperCase();
      if (elStr === 'PRIMARY' || elStr === 'TH' || elStr === '1') edLevel = 'PRIMARY';
      else if (elStr === 'SECONDARY' || elStr === 'THCS' || elStr === '2') edLevel = 'SECONDARY';
      else if (elStr === 'HIGH_SCHOOL' || elStr === 'THPT' || elStr === '3') edLevel = 'HIGH_SCHOOL';
    }

    // 1. Phân môn Tin học và Công nghệ
    if (/tin học\s*(?:và|&)?\s*công nghệ\s*\(\s*công nghệ\s*\)|công nghệ\s*\(\s*công nghệ\s*\)/i.test(s)) return 'Công nghệ';
    if (/tin học\s*(?:và|&)?\s*công nghệ\s*\(\s*tin học\s*\)|tin học\s*\(\s*tin học\s*\)/i.test(s)) return 'Tin học';

    // 1b. Tăng cường Tiếng Việt (TCTV, TC Tiếng Việt, Tăng Cường Tiếng Việt) - Phải kiểm tra trước Tiếng Việt
    if (/(?:^|\b)(?:tăng\s*cường\s*tiếng\s*việt|tăng\s*cường\s*tv|t\.?c\.?\s*tiếng\s*việt|tc[\s\-_.]*tv|tctv)(?:\b|$)|tang\s*cuong\s*tieng\s*viet/i.test(s)) {
      return 'Tăng Cường Tiếng Việt';
    }

    // 1c. Tăng cường Toán (TCT, TC Toán, Tăng Cường Toán) - Phải kiểm tra trước Toán
    if (/(?:^|\b)(?:tăng\s*cường\s*toán|t\.?c\.?\s*toán|tc[\s\-_.]*t|tct)(?:\b|$)|tang\s*cuong\s*toan/i.test(s)) {
      return 'Tăng Cường Toán';
    }

    // 2. Môn Tiếng dân tộc thiểu số (Khmer, Chăm, Ê-đê, Ba Na, Jrai, Mông, Thái, Mơ Nông, Tày, Nùng...)
    if (/dân\s*tộc|dtts|\bdt\b|khmer|chăm|cham|ê[\s\-]*đê|e[\s\-]*de|ba[\s\-]*na|bana|jrai|gia[\s\-]*rai|mông|hmong|hmông|\bthái\b|\bthai\b|mơ[\s\-]*nông|mnong|tày|tay|nùng|nung|xơ[\s\-]*đăng|ca[\s\-]*dong|churu/i.test(s)) {
      return 'Tiếng dân tộc';
    }

    // 3. Tự nhiên và Xã hội (TN-XH, TNXH, TN - XH - Tiểu học)
    if (/tự\s*nhiên\s*(?:và|&)?\s*xã\s*hội|tu\s*nhien\s*(?:va|&)?\s*xa\s*hoi|\btn[\s\-_&.]*xh\b|\bt\.?n\.?x\.?h\b/i.test(s)) return 'Tự nhiên và Xã hội';

    // 4. Khoa học tự nhiên (KHTN - THCS)
    if (/khoa học\s*tự nhiên|\bkhtn\b|\bk\.?h\.?t\.?n\b/i.test(s)) return 'Khoa học tự nhiên';

    // 5. Lịch sử và Địa lí (Tiểu học & THCS)
    if (/lịch sử\s*(?:và|&)?\s*địa l[íy]|\bls[\s\-_&]*đl\b|\blsdl\b/i.test(s)) return 'Lịch sử và Địa lí';

    // 6. Lịch sử riêng (THPT) & Địa lí riêng (THPT)
    if (/^lịch sử\b|^sử$|môn lịch sử|\bmôn sử\b/i.test(s)) return 'Lịch sử';
    if (/^địa l[íy]\b|^địa$|môn địa l[íy]|\bmôn địa\b/i.test(s)) return 'Địa lí';

    // 7. Vật lí, Hóa học, Sinh học (THPT / Bộ môn chuyên sâu)
    if (/vật l[íy]|^l[íy]$|\bmôn lý\b|\bmôn lí\b/i.test(s)) return 'Vật lí';
    if (/hóa học|^hóa$|\bmôn hóa\b/i.test(s)) return 'Hóa học';
    if (/sinh học|^sinh$|\bmôn sinh\b/i.test(s)) return 'Sinh học';

    // 8. Giáo dục kinh tế và pháp luật (GDKT&PL - THPT)
    if (/kinh tế\s*(?:và|&)?\s*pháp luật|\bgdkt[\s\-_&]*pl\b|\bktpl\b/i.test(s)) return 'Giáo dục kinh tế và pháp luật';

    // 9. Giáo dục công dân (GDCD - THCS)
    if (/giáo dục công dân|\bgdcd\b/i.test(s)) return 'Giáo dục công dân';

    // 10. Giáo dục quốc phòng và an ninh (GDQP-AN - THPT - Môn đánh giá bằng điểm số theo TT22)
    if (/quốc\s*phòng\s*(?:và|&)?\s*an\s*ninh|\bgdqp[\s\-_&]*an\b|\bgdqp\b/i.test(s)) return 'Giáo dục quốc phòng và an ninh';

    // 11. Chuyên đề học tập (THPT)
    if (/chuyên\s*đề(?:\s*học\s*tập)?|\bcđht\b/i.test(s)) return 'Chuyên đề học tập';

    // 12. Hoạt động trải nghiệm / HĐTN, hướng nghiệp
    if (/hoạt động trải nghiệm|\bhđtn\b|\btrải nghiệm\b|\bhướng nghiệp\b/i.test(s)) {
      if (edLevel === 'PRIMARY') return 'Hoạt động trải nghiệm';
      return 'Hoạt động trải nghiệm, hướng nghiệp';
    }

    // 13. Nội dung giáo dục địa phương (GDĐP)
    if (/giáo dục địa phương|\bgdđp\b|\bđịa phương\b/i.test(s)) return 'Nội dung giáo dục địa phương';

    // 14. Giáo dục thể chất
    if (/giáo\s*dục\s*thể(?:\s*chất)?|\bthể\s*dục\b|\bgdtc\b/i.test(s)) return 'Giáo dục thể chất';

    // 15. Nghệ thuật (Âm nhạc, Mĩ thuật)
    if (/nghệ thuật\s*\(\s*âm nhạc\s*\)|âm nhạc|\bam nhac\b|\bân\b/i.test(s)) return 'Âm nhạc';
    if (/nghệ thuật\s*\(\s*mĩ thuật\s*\)|nghệ thuật\s*\(\s*mỹ thuật\s*\)|mĩ thuật|mỹ thuật|\bmt\b/i.test(s)) return 'Mĩ thuật';
    if (/nghệ thuật|\bnghe thuat\b/i.test(s)) return 'Nghệ thuật';

    // 16. Tin học & Công nghệ
    if (/công nghệ|\bcong nghe\b/i.test(s)) return 'Công nghệ';
    if (/tin học|\btin hoc\b|\bcntt\b|\bmôn tin\b/i.test(s)) return 'Tin học';

    // 17. Ngữ văn & Tiếng Việt: Phân định theo Cấp học
    if (/tiếng việt|tieng viet|\bt\.việt\b|\btv\b/i.test(s)) return 'Tiếng Việt';
    if (/ngữ văn|ngu van|\bmôn văn\b|\bvăn học\b|\bvăn\b/i.test(s)) {
      if (edLevel === 'PRIMARY') return 'Tiếng Việt';
      return 'Ngữ văn';
    }

    // 18. Ngoại ngữ (Tiếng Anh, Pháp, Trung, Nhật, Hàn, Nga, Đức, Ngoại ngữ 1, Ngoại ngữ 2)
    if (/tiếng\s*pháp|tieng\s*phap|\bpháp\b|french/i.test(s)) return 'Tiếng Pháp';
    if (/tiếng\s*trung(?:\s*quốc)?|tieng\s*trung|\bmôn\s*tiếng\s*trung\b|chinese/i.test(s)) return 'Tiếng Trung Quốc';
    if (/tiếng\s*nhật|tieng\s*nhat|\bmôn\s*tiếng\s*nhật\b|japanese/i.test(s)) return 'Tiếng Nhật';
    if (/tiếng\s*hàn|tieng\s*han|\bmôn\s*tiếng\s*hàn\b|korean/i.test(s)) return 'Tiếng Hàn';
    if (/tiếng\s*nga|tieng\s*nga|russian/i.test(s)) return 'Tiếng Nga';
    if (/tiếng\s*đức|tiếng\s*duc|tieng\s*duc|german/i.test(s)) return 'Tiếng Đức';
    if (/tiếng anh|tieng anh|english|\banh văn\b|\bta\b/i.test(s)) return 'Tiếng Anh';
    if (/ngoại\s*ngữ\s*1|\bnn1\b/i.test(s)) return 'Ngoại ngữ 1';
    if (/ngoại\s*ngữ\s*2|\bnn2\b/i.test(s)) return 'Ngoại ngữ 2';
    if (/ngoại\s*ngữ|ngoai\s*ngu|\bnn\b/i.test(s)) return 'Ngoại ngữ';

    // 19. Khoa học (Tiểu học) vs Khoa học tự nhiên (THCS)
    if (/khoa học|khoa hoc|\bkh\b/i.test(s)) {
      if (edLevel === 'SECONDARY') return 'Khoa học tự nhiên';
      return 'Khoa học';
    }
    if (/đạo đức|dao duc|\bđđ\b/i.test(s)) return 'Đạo đức';

    // 20. Đánh giá rèn luyện / Hạnh kiểm
    if (/rèn luyện|hạnh kiểm|\bhk\b/i.test(s)) return 'Đánh giá rèn luyện';

    // 21. Toán
    if (/toán|toan|\bmôn toán\b/i.test(s)) return 'Toán';

    return rawSubject.trim();
  }

  /**
   * Lấy danh sách các môn đánh giá bằng ĐIỂM SỐ cho từng khối lớp và đợt đánh giá
   */
  function getScoredSubjects(grade, periodCode) {
    const g = normalizeGrade(grade);
    const level = getEducationLevel(g);
    const pCode = normalizePeriod(periodCode);
    const periodObj = PERIODS[pCode] || PERIODS.GK1;

    // 1. CẤP TIỂU HỌC (LỚP 1 - 5) - Theo Thông tư 27
    if (level === 'PRIMARY') {
      if (periodObj.term === 'MID_TERM') {
        if (g === '4' || g === '5') {
          return ['Toán', 'Tiếng Việt'];
        }
        return [];
      }
      if (periodObj.term === 'END_TERM') {
        if (g === '1' || g === '2') {
          return ['Tiếng Việt', 'Toán'];
        }
        if (g === '3') {
          return ['Tiếng Việt', 'Toán', 'Tin học', 'Công nghệ', 'Tiếng Anh'];
        }
        if (g === '4' || g === '5') {
          return [
            'Tiếng Việt',
            'Toán',
            'Tin học',
            'Công nghệ',
            'Tiếng Anh',
            'Khoa học',
            'Lịch sử và Địa lí'
          ];
        }
      }
      return [];
    }

    // 2. CẤP THCS (LỚP 6 - 9) - Theo Thông tư 22/2021/TT-BGDĐT
    // Tất cả các môn đánh giá bằng nhận xét kết hợp đánh giá bằng ĐIỂM SỐ:
    if (level === 'SECONDARY') {
      return [
        'Ngữ văn',
        'Toán',
        'Tiếng Anh',
        'Tiếng Pháp',
        'Tiếng Trung Quốc',
        'Tiếng Nhật',
        'Tiếng Hàn',
        'Tiếng Nga',
        'Tiếng Đức',
        'Ngoại ngữ',
        'Ngoại ngữ 1',
        'Ngoại ngữ 2',
        'Khoa học tự nhiên',
        'Lịch sử và Địa lí',
        'Lịch sử',
        'Địa lí',
        'Giáo dục công dân',
        'Tin học',
        'Công nghệ',
        'Tiếng dân tộc'
      ];
    }

    // 3. CẤP THPT (LỚP 10 - 12) - Theo Thông tư 22/2021/TT-BGDĐT
    // Tất cả các môn đánh giá bằng nhận xét kết hợp đánh giá bằng ĐIỂM SỐ:
    if (level === 'HIGH_SCHOOL') {
      return [
        'Ngữ văn',
        'Toán',
        'Tiếng Anh',
        'Tiếng Pháp',
        'Tiếng Trung Quốc',
        'Tiếng Nhật',
        'Tiếng Hàn',
        'Tiếng Nga',
        'Tiếng Đức',
        'Ngoại ngữ',
        'Ngoại ngữ 1',
        'Ngoại ngữ 2',
        'Lịch sử',
        'Địa lí',
        'Vật lí',
        'Hóa học',
        'Sinh học',
        'Giáo dục kinh tế và pháp luật',
        'Tin học',
        'Công nghệ',
        'Giáo dục quốc phòng và an ninh',
        'Chuyên đề học tập',
        'Tiếng dân tộc'
      ];
    }

    return [];
  }

  /**
   * Kiểm tra một môn học cụ thể có được đánh giá bằng điểm số hay không
   */
  function isSubjectScored(grade, periodCode, subject, educationLevel = null) {
    const scoredList = getScoredSubjects(grade, periodCode);
    const normalizedSubject = normalizeSubjectName(subject, educationLevel);
    return scoredList.some(s => s.toLowerCase() === normalizedSubject.toLowerCase());
  }

  /**
   * Lấy thông tin chi tiết quy tắc đánh giá theo Thông tư tương ứng (TT27 cho TH, TT22 cho THCS/THPT)
   */
  function getAssessmentRule(grade, periodCode, subject, educationLevel = null) {
    let edLevel = null;
    if (educationLevel) {
      const s = String(educationLevel).toUpperCase();
      if (s === 'PRIMARY' || s === 'TH' || s === '1') edLevel = 'PRIMARY';
      else if (s === 'SECONDARY' || s === 'THCS' || s === '2') edLevel = 'SECONDARY';
      else if (s === 'HIGH_SCHOOL' || s === 'THPT' || s === '3') edLevel = 'HIGH_SCHOOL';
    }

    let g = normalizeGrade(grade);
    if (edLevel === 'PRIMARY' && parseInt(g, 10) > 5) g = '4';
    if (edLevel === 'SECONDARY' && (parseInt(g, 10) < 6 || parseInt(g, 10) > 9)) g = '7';
    if (edLevel === 'HIGH_SCHOOL' && parseInt(g, 10) < 10) g = '10';

    const level = edLevel || getEducationLevel(g);
    const standard = level === 'PRIMARY' ? 'Thông tư 27/2020/TT-BGDĐT' : 'Thông tư 22/2021/TT-BGDĐT';
    const pCode = normalizePeriod(periodCode);
    const periodObj = PERIODS[pCode] || PERIODS.GK1;
    const stdSubject = normalizeSubjectName(subject, level);
    const scoredList = getScoredSubjects(g, pCode);
    const scored = isSubjectScored(g, pCode, stdSubject, level);

    let explanation = '';
    let badgeText = '';

    if (level === 'PRIMARY') {
      // Thông tư 27 (Tiểu học)
      if (stdSubject === 'Tiếng dân tộc') {
        explanation = `Môn Tiếng dân tộc ở Khối ${g}: Đánh giá bằng MỨC ĐẠT (T, H, C) kết hợp LỜI NHẬN XÉT (Không cho điểm số).`;
      } else if (periodObj.term === 'MID_TERM') {
        if (g === '4' || g === '5') {
          if (scored) {
            explanation = `${periodObj.name} ở Khối ${g}: Môn ${stdSubject} đánh giá bằng ĐIỂM SỐ (1-10) kết hợp LỜI NHẬN XÉT (TT27).`;
          } else {
            explanation = `${periodObj.name} ở Khối ${g}: Chỉ Toán & Tiếng Việt cho điểm số. Môn ${stdSubject} đánh giá bằng MỨC ĐẠT (T, H, C) & NHẬN XÉT.`;
          }
        } else {
          explanation = `${periodObj.name} ở Khối ${g}: Tất cả các môn đánh giá bằng MỨC ĐẠT (T, H, C) kết hợp LỜI NHẬN XÉT (Không cho điểm số).`;
        }
      } else {
        if (scored) {
          explanation = `${periodObj.name} ở Khối ${g}: Môn ${stdSubject} thuộc nhóm các môn đánh giá bằng ĐIỂM SỐ & NHẬN XÉT (TT27).`;
        } else {
          explanation = `${periodObj.name} ở Khối ${g}: Môn ${stdSubject} đánh giá bằng MỨC ĐẠT (T, H, C) & NHẬN XÉT (Không cho điểm số).`;
        }
      }
      badgeText = scored ? '🎯 ĐIỂM SỐ & NHẬN XÉT (TT27)' : '🏷️ MỨC T/H/C & NHẬN XÉT (TT27)';
    } else {
      // Thông tư 22 (THCS & THPT)
      const stageName = level === 'SECONDARY' ? 'THCS' : 'THPT';
      if (scored) {
        explanation = `Khối ${g} (${stageName}) - ${periodObj.name}: Môn ${stdSubject} đánh giá bằng ĐIỂM SỐ (1-10) kết hợp NHẬN XÉT sự tiến bộ (TT22).`;
        badgeText = '🎯 ĐIỂM SỐ & NHẬN XÉT (TT22)';
      } else {
        explanation = `Khối ${g} (${stageName}) - ${periodObj.name}: Môn ${stdSubject} đánh giá bằng NHẬN XÉT theo 2 mức ĐẠT (Đ) / CHƯA ĐẠT (CĐ) (TT22).`;
        badgeText = '🏷️ MỨC Đ/CĐ & NHẬN XÉT (TT22)';
      }
    }

    return {
      grade: g,
      gradeName: `Khối ${g}`,
      educationLevel: level,
      standard: standard,
      periodCode: pCode,
      periodName: periodObj.name,
      periodShortName: periodObj.shortName,
      isMidTerm: periodObj.term === 'MID_TERM',
      isEndTerm: periodObj.term === 'END_TERM',
      subject: stdSubject,
      isScored: scored,
      mode: scored ? 'SCORE' : 'COMMENT_ONLY',
      badgeText: badgeText,
      badgeClass: scored ? 'badge-mode-score' : 'badge-mode-comment',
      explanation: explanation,
      scoredSubjects: scoredList
    };
  }

  /**
   * Cung cấp toàn bộ ma trận quy tắc đánh giá phục vụ Sổ tay tra cứu
   */
  function getFullMatrix() {
    return [
      {
        periodCode: 'GK1',
        periodName: 'Giữa học kì 1',
        type: 'Giữa kì',
        rules: {
          '1-2': { scored: [], commentOnly: 'Tất cả các môn (Mức T/H/C - TT27)' },
          '3': { scored: [], commentOnly: 'Tất cả các môn (Mức T/H/C - TT27)' },
          '4-5': { scored: ['Toán', 'Tiếng Việt'], commentOnly: 'Các môn còn lại (Mức T/H/C - TT27)' },
          '6-9': {
            scored: ['Ngữ văn', 'Toán', 'Tiếng Anh', 'Ngoại ngữ', 'Khoa học tự nhiên', 'Lịch sử và Địa lí', 'Giáo dục công dân', 'Tin học', 'Công nghệ', 'Tiếng dân tộc'],
            commentOnly: ['Giáo dục thể chất', 'Nghệ thuật (Âm nhạc, Mĩ thuật)', 'Hoạt động trải nghiệm, hướng nghiệp', 'Nội dung giáo dục địa phương']
          },
          '10-12': {
            scored: ['Ngữ văn', 'Toán', 'Tiếng Anh', 'Ngoại ngữ', 'Lịch sử', 'Địa lí', 'Vật lí', 'Hóa học', 'Sinh học', 'GDKT&PL', 'Tin học', 'Công nghệ', 'GDQP-AN', 'Chuyên đề học tập', 'Tiếng dân tộc'],
            commentOnly: ['Giáo dục thể chất', 'Âm nhạc', 'Mĩ thuật', 'Hoạt động trải nghiệm, hướng nghiệp', 'Nội dung giáo dục địa phương']
          }
        }
      },
      {
        periodCode: 'CK1',
        periodName: 'Cuối học kì 1',
        type: 'Cuối kì',
        rules: {
          '1-2': { scored: ['Tiếng Việt', 'Toán'], commentOnly: 'Các môn còn lại (Mức T/H/C - TT27)' },
          '3': { scored: ['Tiếng Việt', 'Toán', 'Tin học', 'Công nghệ', 'Tiếng Anh'], commentOnly: 'Các môn còn lại (Mức T/H/C - TT27)' },
          '4-5': { scored: ['Tiếng Việt', 'Toán', 'Tin học', 'Công nghệ', 'Tiếng Anh', 'Khoa học', 'Lịch sử và Địa lí'], commentOnly: 'Các môn còn lại (Mức T/H/C - TT27)' },
          '6-9': {
            scored: ['Ngữ văn', 'Toán', 'Tiếng Anh', 'Ngoại ngữ', 'Khoa học tự nhiên', 'Lịch sử và Địa lí', 'Giáo dục công dân', 'Tin học', 'Công nghệ', 'Tiếng dân tộc'],
            commentOnly: ['Giáo dục thể chất', 'Nghệ thuật (Âm nhạc, Mĩ thuật)', 'Hoạt động trải nghiệm, hướng nghiệp', 'Nội dung giáo dục địa phương']
          },
          '10-12': {
            scored: ['Ngữ văn', 'Toán', 'Tiếng Anh', 'Ngoại ngữ', 'Lịch sử', 'Địa lí', 'Vật lí', 'Hóa học', 'Sinh học', 'GDKT&PL', 'Tin học', 'Công nghệ', 'GDQP-AN', 'Chuyên đề học tập', 'Tiếng dân tộc'],
            commentOnly: ['Giáo dục thể chất', 'Âm nhạc', 'Mĩ thuật', 'Hoạt động trải nghiệm, hướng nghiệp', 'Nội dung giáo dục địa phương']
          }
        }
      },
      {
        periodCode: 'GK2',
        periodName: 'Giữa học kì 2',
        type: 'Giữa kì',
        rules: {
          '1-2': { scored: [], commentOnly: 'Tất cả các môn (Mức T/H/C - TT27)' },
          '3': { scored: [], commentOnly: 'Tất cả các môn (Mức T/H/C - TT27)' },
          '4-5': { scored: ['Toán', 'Tiếng Việt'], commentOnly: 'Các môn còn lại (Mức T/H/C - TT27)' },
          '6-9': {
            scored: ['Ngữ văn', 'Toán', 'Tiếng Anh', 'Ngoại ngữ', 'Khoa học tự nhiên', 'Lịch sử và Địa lí', 'Giáo dục công dân', 'Tin học', 'Công nghệ', 'Tiếng dân tộc'],
            commentOnly: ['Giáo dục thể chất', 'Nghệ thuật (Âm nhạc, Mĩ thuật)', 'Hoạt động trải nghiệm, hướng nghiệp', 'Nội dung giáo dục địa phương']
          },
          '10-12': {
            scored: ['Ngữ văn', 'Toán', 'Tiếng Anh', 'Ngoại ngữ', 'Lịch sử', 'Địa lí', 'Vật lí', 'Hóa học', 'Sinh học', 'GDKT&PL', 'Tin học', 'Công nghệ', 'GDQP-AN', 'Chuyên đề học tập', 'Tiếng dân tộc'],
            commentOnly: ['Giáo dục thể chất', 'Âm nhạc', 'Mĩ thuật', 'Hoạt động trải nghiệm, hướng nghiệp', 'Nội dung giáo dục địa phương']
          }
        }
      },
      {
        periodCode: 'CK2',
        periodName: 'Cuối học kì 2 / Cả năm',
        type: 'Cuối kì / Cả năm',
        rules: {
          '1-2': { scored: ['Tiếng Việt', 'Toán'], commentOnly: 'Các môn còn lại (Mức T/H/C - TT27)' },
          '3': { scored: ['Tiếng Việt', 'Toán', 'Tin học', 'Công nghệ', 'Tiếng Anh'], commentOnly: 'Các môn còn lại (Mức T/H/C - TT27)' },
          '4-5': { scored: ['Tiếng Việt', 'Toán', 'Tin học', 'Công nghệ', 'Tiếng Anh', 'Khoa học', 'Lịch sử và Địa lí'], commentOnly: 'Các môn còn lại (Mức T/H/C - TT27)' },
          '6-9': {
            scored: ['Ngữ văn', 'Toán', 'Tiếng Anh', 'Ngoại ngữ', 'Khoa học tự nhiên', 'Lịch sử và Địa lí', 'Giáo dục công dân', 'Tin học', 'Công nghệ', 'Tiếng dân tộc'],
            commentOnly: ['Giáo dục thể chất', 'Nghệ thuật (Âm nhạc, Mĩ thuật)', 'Hoạt động trải nghiệm, hướng nghiệp', 'Nội dung giáo dục địa phương']
          },
          '10-12': {
            scored: ['Ngữ văn', 'Toán', 'Tiếng Anh', 'Ngoại ngữ', 'Lịch sử', 'Địa lí', 'Vật lí', 'Hóa học', 'Sinh học', 'GDKT&PL', 'Tin học', 'Công nghệ', 'GDQP-AN', 'Chuyên đề học tập', 'Tiếng dân tộc'],
            commentOnly: ['Giáo dục thể chất', 'Âm nhạc', 'Mĩ thuật', 'Hoạt động trải nghiệm, hướng nghiệp', 'Nội dung giáo dục địa phương']
          }
        }
      }
    ];
  }

  return {
    PERIODS,
    PERIOD_LIST,
    GRADE_LIST,
    PRIMARY_GRADES,
    SECONDARY_GRADES,
    HIGH_SCHOOL_GRADES,
    getEducationLevel,
    getAssessmentStandard,
    normalizePeriod,
    normalizeGrade,
    normalizeSubjectName,
    getScoredSubjects,
    isSubjectScored,
    getAssessmentRule,
    getFullMatrix
  };
});
