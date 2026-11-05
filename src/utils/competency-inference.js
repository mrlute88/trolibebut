/**
 * Competency and Quality Inference Engine (Bản chuẩn hóa theo Thông tư 27/2020/TT-BGDĐT)
 * Nguồn quy tắc: Bo_Quy_Tac_Suy_Luan_TT27_Chuan_Hoa.docx
 * Áp dụng tự động hóa trên hệ thống vnEdu cho Giáo viên chủ nhiệm Lớp 1 - Lớp 5
 * Nguyên tắc cốt lõi: Xét mức C trước -> Xét mức T -> Mặc định gán mức Đ.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VnEduCompetencyInference = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Chuẩn hóa ký hiệu mức đạt được của môn học
   * Input: 'T', 'H', 'Đ', 'C', điểm số '10', '9', '8'...
   * Output: 'T', 'H', 'C'
   */
  function normalizeSubjectRating(rawRating, rawScore = null) {
    let scoreNum = null;
    if (rawScore !== null && rawScore !== undefined && rawScore !== '') {
      const parsed = parseFloat(String(rawScore).replace(',', '.'));
      if (!isNaN(parsed)) {
        scoreNum = parsed;
      }
    }

    let explicitLvl = null;
    if (rawRating) {
      const str = String(rawRating).trim().toUpperCase();
      if (str === 'T' || str === 'TỐT' || str === 'HOÀN THÀNH TỐT' || str === 'HTT' || str === '2') explicitLvl = 'T';
      else if (str === 'H' || str === 'Đ' || str === 'ĐẠT' || str === 'HOÀN THÀNH' || str === 'HT' || str === '1') explicitLvl = 'H';
      else if (str === 'C' || str === 'CHƯA HOÀN THÀNH' || str === 'CHT' || str === 'CẦN CỐ GẮNG' || str === 'CCG' || str === '0') explicitLvl = 'C';
      else if (str === 'MIỄN' || str === 'MIEN' || str === 'MIỄN GIẢM' || str === 'MIEN GIAM' || str === 'MG') return null; // Học sinh được miễn môn học (không tính là môn điểm C hay H)
    }

    // Nếu có điểm số dưới 5 thì chắc chắn là Chưa hoàn thành (C)
    if (scoreNum !== null && scoreNum < 5.0) {
      return 'C';
    }

    if (explicitLvl) return explicitLvl;

    // Nếu không có explicit rating nhưng có điểm số:
    if (scoreNum !== null) {
      if (scoreNum >= 9.0) return 'T';
      if (scoreNum >= 5.0) return 'H';
      return 'C';
    }

    return null;
  }

  /**
   * Động cơ suy luận 15 chỉ số Năng lực & Phẩm chất chuẩn Thông tư 27
   * @param {Object} studentRowData Thông tin học sinh và các môn học
   * @param {string|number} grade Khối lớp ('1', '2', '3', '4', '5')
   * @returns {Object} 15 chỉ số xếp loại T / Đ / C
   */
  function inferStudentCompetencies(studentRowData, grade = '1') {
    // Nếu học sinh chưa có đủ dữ liệu các cột điểm hoặc xếp loại môn học -> Bỏ qua, không điền NL-PC
    if (studentRowData && studentRowData.isIncomplete) {
      return {
        tuChuVaTuHoc: null,
        giaoTiepVaHopTac: null,
        gqvdVaSangTao: null,
        ngonNgu: null,
        tinhToan: null,
        khoaHoc: null,
        congNghe: null,
        tinHoc: null,
        thamMi: null,
        theChat: null,
        yeuNuoc: null,
        nhanAi: null,
        chamChi: null,
        trungThuc: null,
        trachNhiem: null,
        rawMap: {},
        isIncomplete: true,
        skippedReason: studentRowData.missingReason || 'Chưa đủ điểm hoặc xếp loại các môn học'
      };
    }

    const g = String(grade).match(/\d+/)?.[0] || '1';
    const numGrade = parseInt(g, 10);
    const subMap = studentRowData?.subjects || {};

    // Helper trích xuất thông tin môn học với loại trừ chéo an toàn
    function getSub(nameKeywords, excludeKeywords = []) {
      if (!Array.isArray(nameKeywords)) nameKeywords = [nameKeywords];
      if (!Array.isArray(excludeKeywords)) excludeKeywords = [excludeKeywords];
      for (const [key, val] of Object.entries(subMap)) {
        const cleanKey = key.toLowerCase().trim();
        const hasExcluded = excludeKeywords.some(ex => cleanKey.includes(ex.toLowerCase()));
        if (hasExcluded) continue;

        for (const kw of nameKeywords) {
          if (cleanKey.includes(kw.toLowerCase())) {
            const rawScore = val?.score;
            let score = null;
            if (rawScore !== null && rawScore !== undefined && rawScore !== '') {
              const num = parseFloat(String(rawScore).replace(',', '.'));
              if (!isNaN(num)) score = num;
            }
            const rating = normalizeSubjectRating(val?.rating, score);
            return { rating, score, raw: val };
          }
        }
      }
      return { rating: null, score: null, raw: null };
    }

    // Bóc tách từng môn học với cơ chế phân định an toàn giữa Tin học và Công nghệ
    const tv = getSub(['tiếng việt', 't.việt', 'tv']);
    const toan = getSub(['toán']);
    const tnxh = getSub(['tự nhiên và xã hội', 'tn-xh', 'tnxh', 'tự nhiên']);
    const kh = getSub(['khoa học', 'kh']);
    const lsdl = getSub(['lịch sử và địa lí', 'ls-đl', 'lsdl', 'lịch sử', 'địa lí']);
    const nn1 = getSub(['tiếng anh', 'ngoại ngữ', 'ngoại ngữ 1', 'nn1', 'ta']);
    const tdt = getSub(['tiếng dân tộc', 'tiếng dt', 'dân tộc', 'tdt']);
    const tin = getSub(['tin học', 'cntt'], ['(công nghệ)', '(cn)']);
    const cn = getSub(['công nghệ'], ['(tin học)', '(th)']);
    const dd = getSub(['đạo đức', 'đđ']);
    const an = getSub(['âm nhạc']);
    const mt = getSub(['mĩ thuật', 'mỹ thuật']);
    const nt = getSub(['nghệ thuật']);
    const gdtc = getSub(['thể chất', 'gdtc', 'thể dục']);
    const hdtn = getSub(['trải nghiệm', 'hđtn']);

    // Tập hợp tất cả các môn có đánh giá thực tế (học sinh được Miễn môn Tiếng dân tộc thì bỏ qua)
    const allValidRatings = [
      tv.rating, toan.rating, tnxh.rating, kh.rating, lsdl.rating,
      nn1.rating, tdt.rating, tin.rating, cn.rating, dd.rating, an.rating, mt.rating,
      nt.rating, gdtc.rating, hdtn.rating
    ].filter(Boolean);

    // Xử lý dữ liệu khuyết: Nếu học sinh hoàn toàn chưa có đánh giá ở bất kỳ môn nào -> bỏ qua
    if (allValidRatings.length === 0) {
      return {
        tuChuVaTuHoc: null,
        giaoTiepVaHopTac: null,
        gqvdVaSangTao: null,
        ngonNgu: null,
        tinhToan: null,
        khoaHoc: null,
        congNghe: null,
        tinHoc: null,
        thamMi: null,
        theChat: null,
        yeuNuoc: null,
        nhanAi: null,
        chamChi: null,
        trungThuc: null,
        trachNhiem: null,
        rawMap: {}
      };
    }

    const countT = allValidRatings.filter(r => r === 'T').length;
    const countH = allValidRatings.filter(r => r === 'H').length;
    const countC = allValidRatings.filter(r => r === 'C').length;
    const totalRated = allValidRatings.length || 1;
    const percentT = (countT / totalRated) * 100;

    // =========================================================================
    // I. BỘ QUY TẮC SUY LUẬN NHÓM NĂNG LỰC ĐẶC THÙ (7 NĂNG LỰC)
    // Nguyên tắc: C -> T -> Đ
    // =========================================================================

    // 1. Ngôn ngữ: Do môn Tiếng Việt chi phối trực tiếp (giữ nguyên mức theo Tiếng Việt để GVCN tự điều chỉnh)
    let nlNgonNgu = 'Đ';
    if (tv.rating === 'C' || (tv.score !== null && tv.score < 5.0)) {
      nlNgonNgu = 'C';
    } else if (tv.rating === 'T' || (tv.score !== null && tv.score >= 9.0)) {
      nlNgonNgu = 'T';
    } else {
      nlNgonNgu = 'Đ';
    }

    // 2. Tính toán: Toán
    let nlTinhToan = 'Đ';
    if (toan.rating === 'C' || (toan.score !== null && toan.score < 5.0)) {
      nlTinhToan = 'C';
    } else if (toan.rating === 'T' || (toan.score !== null && toan.score >= 9.0)) {
      nlTinhToan = 'T';
    } else {
      nlTinhToan = 'Đ';
    }

    // 3. Khoa học (Tìm hiểu tự nhiên và xã hội)
    // - Khối 1, 2, 3: TN-XH
    // - Khối 4, 5: Khoa học & Lịch sử - Địa lí
    let nlKhoaHoc = 'Đ';
    if (numGrade <= 3) {
      if (tnxh.rating === 'C') {
        nlKhoaHoc = 'C';
      } else if (tnxh.rating === 'T') {
        nlKhoaHoc = 'T';
      } else {
        nlKhoaHoc = 'Đ';
      }
    } else {
      // Khối 4, 5: Ưu tiên xếp loại T nếu 1 trong 2 môn (Khoa học hoặc Lịch sử & Địa lí) có xếp loại T
      const hasC = kh.rating === 'C' || lsdl.rating === 'C' ||
                   (kh.score !== null && kh.score < 5.0) ||
                   (lsdl.score !== null && lsdl.score < 5.0);
      if (hasC) {
        nlKhoaHoc = 'C';
      } else if (kh.rating === 'T' || lsdl.rating === 'T' ||
                 (kh.score !== null && kh.score >= 9.0) ||
                 (lsdl.score !== null && lsdl.score >= 9.0)) {
        nlKhoaHoc = 'T';
      } else {
        nlKhoaHoc = 'Đ';
      }
    }

    // 4. Công nghệ (Tin học và Công nghệ)
    let nlCongNghe = null;
    if (numGrade >= 3) {
      if (cn.rating === 'C' || (cn.score !== null && cn.score < 5.0)) {
        nlCongNghe = 'C';
      } else if (cn.rating === 'T' || (cn.score !== null && cn.score >= 9.0)) {
        nlCongNghe = 'T';
      } else {
        nlCongNghe = 'Đ';
      }
    } else {
      // Dự phòng Khối 1, 2 nếu trường yêu cầu điền: lấy Mĩ thuật hoặc TN-XH
      const fallbackRating = mt.rating || tnxh.rating || null;
      nlCongNghe = fallbackRating === 'C' ? 'C' : (fallbackRating === 'T' ? 'T' : (fallbackRating ? 'Đ' : null));
    }

    // 5. Tin học (Tin học và Công nghệ)
    let nlTinHoc = null;
    if (numGrade >= 3) {
      if (tin.rating === 'C' || (tin.score !== null && tin.score < 5.0)) {
        nlTinHoc = 'C';
      } else if (tin.rating === 'T' || (tin.score !== null && tin.score >= 9.0)) {
        nlTinHoc = 'T';
      } else {
        nlTinHoc = 'Đ';
      }
    } else {
      // Dự phòng Khối 1, 2 nếu trường yêu cầu điền: lấy Toán
      const fallbackRating = toan.rating || null;
      nlTinHoc = fallbackRating === 'C' ? 'C' : (fallbackRating === 'T' ? 'T' : (fallbackRating ? 'Đ' : null));
    }

    // 6. Thẩm mĩ: Nghệ thuật (Âm nhạc & Mĩ thuật)
    let nlThamMi = 'Đ';
    const hasAnyCArt = an.rating === 'C' || mt.rating === 'C' || nt.rating === 'C';
    const bothHArt = (an.rating === 'H' && mt.rating === 'H') || nt.rating === 'H';
    const hasAnyTArt = an.rating === 'T' || mt.rating === 'T' || nt.rating === 'T';

    if (hasAnyCArt) {
      nlThamMi = 'C';
    } else if (hasAnyTArt) {
      // Cả 2 đều T, hoặc 1 môn T và 1 môn H
      nlThamMi = 'T';
    } else {
      nlThamMi = 'Đ';
    }

    // 7. Thể chất: Giáo dục thể chất (GDTC)
    let nlTheChat = 'Đ';
    if (gdtc.rating === 'C') {
      nlTheChat = 'C';
    } else if (gdtc.rating === 'T') {
      nlTheChat = 'T';
    } else {
      nlTheChat = 'Đ';
    }

    // =========================================================================
    // II. BỘ QUY TẮC SUY LUẬN NHÓM NĂNG LỰC CHUNG (3 NĂNG LỰC CỐT LÕI)
    // Nguyên tắc: Xét C trước -> Xét T -> Mặc định Đ
    // =========================================================================

    // 1. Tự chủ và tự học (Chuẩn theo Bo_Quy_Tac_Suy_Luan_TT27_Chuan_Hoa.docx)
    let nlTuChu = 'Đ';
    // Xét C: Cả Toán và TV = C HOẶC có từ 2 môn trở lên xếp mức C
    if ((toan.rating === 'C' && tv.rating === 'C') || countC >= 2) {
      nlTuChu = 'C';
    }
    // Xét T: Không có môn C VÀ (Cả Toán & TV đều là T HOẶC có 1 môn H nhưng >= 80% tổng số môn đạt T)
    else if (countC === 0 && ((toan.rating === 'T' && tv.rating === 'T') || (countH <= 1 && percentT >= 80.0))) {
      nlTuChu = 'T';
    }
    // Mặc định: Đ
    else {
      nlTuChu = 'Đ';
    }

    // 2. Giao tiếp và hợp tác (Chuẩn theo Bo_Quy_Tac_Suy_Luan_TT27_Chuan_Hoa.docx)
    let nlGiaoTiep = 'Đ';
    // Xét C: HĐTN = C VÀ TV = C HOẶC có từ 3 môn trở lên xếp mức C
    if ((hdtn.rating === 'C' && tv.rating === 'C') || countC >= 3) {
      nlGiaoTiep = 'C';
    }
    // Xét T: Không có môn C VÀ (Toán hoặc TV đạt T) VÀ đa số các môn đạt T (>= 50%)
    else if (countC === 0 && (toan.rating === 'T' || tv.rating === 'T') && percentT >= 50.0) {
      nlGiaoTiep = 'T';
    }
    // Mặc định: Đ
    else {
      nlGiaoTiep = 'Đ';
    }

    // 3. Giải quyết vấn đề và sáng tạo (Chỉ tiêu chặt chẽ nhất theo Bo_Quy_Tac_Suy_Luan_TT27_Chuan_Hoa.docx)
    let nlGQVD = 'Đ';
    // Xét C: Cả Toán và TV = C HOẶC có từ 2 môn trở lên xếp mức C
    if ((toan.rating === 'C' && tv.rating === 'C') || countC >= 2) {
      nlGQVD = 'C';
    }
    // Xét T (Điều kiện xuất sắc): Không có môn C, không có quá 1 môn phụ bị mức H (countH <= 1)
    // VÀ cả Toán & TV đều đạt T (hoặc 1 môn T, 1 môn H có điểm >= 8 và >= 80% tổng số môn đạt T)
    else if (countC === 0 && countH <= 1) {
      const bothMathTvT = (toan.rating === 'T' && tv.rating === 'T');
      const mathScore = toan.score !== null ? toan.score : (toan.rating === 'T' ? 9 : 7);
      const tvScore = tv.score !== null ? tv.score : (tv.rating === 'T' ? 9 : 7);
      const oneTOneH8 = ((toan.rating === 'T' && tv.rating === 'H' && tvScore >= 8.0) ||
                         (tv.rating === 'T' && toan.rating === 'H' && mathScore >= 8.0)) && percentT >= 80.0;

      if (bothMathTvT || oneTOneH8) {
        nlGQVD = 'T';
      } else {
        nlGQVD = 'Đ';
      }
    } else {
      nlGQVD = 'Đ';
    }

    // =========================================================================
    // III. BỘ QUY TẮC SUY LUẬN NHÓM PHẨM CHẤT CHỦ YẾU (5 PHẨM CHẤT)
    // Trụ cột: Đạo đức & Hoạt động trải nghiệm (HĐTN)
    // =========================================================================

    // 1. Yêu nước
    // - Mức T: Đạo đức ≠ C VÀ HĐTN ≠ C
    // - Mức Đ: Đạo đức = C HOẶC HĐTN = C
    let pcYeuNuoc = (dd.rating === 'C' || hdtn.rating === 'C') ? 'Đ' : 'T';

    // 2. Nhân ái
    // - Mức T: Đạo đức ≠ C VÀ HĐTN ≠ C
    // - Mức Đ: Đạo đức = C HOẶC HĐTN = C
    let pcNhanAi = (dd.rating === 'C' || hdtn.rating === 'C') ? 'Đ' : 'T';

    // 3. Trung thực
    // - Mức T: Đạo đức ≠ C
    // - Mức Đ: Đạo đức = C
    let pcTrungThuc = (dd.rating === 'C') ? 'Đ' : 'T';

    // 4. Chăm chỉ
    // - Mức C: Có từ 3 môn trở lên xếp mức C
    // - Mức T: Không có môn C VÀ cả Đạo đức, HĐTN đều đạt T VÀ >= 50% tổng số môn đạt T
    // - Mức Đ: Các trường hợp còn lại
    let pcChamChi = 'Đ';
    if (countC >= 3) {
      pcChamChi = 'C';
    } else if (countC === 0 && dd.rating === 'T' && hdtn.rating === 'T' && percentT >= 50.0) {
      pcChamChi = 'T';
    } else {
      pcChamChi = 'Đ';
    }

    // 5. Trách nhiệm
    // - Mức C: Cả Đạo đức và HĐTN = C (hoặc có >= 3 môn xếp mức C)
    // - Mức T: Không có môn C VÀ cả Đạo đức, HĐTN đều đạt T VÀ (Toán = T hoặc TV = T hoặc >= 60% tổng số môn đạt T)
    // - Mức Đ: Các trường hợp còn lại
    let pcTrachNhiem = 'Đ';
    if ((dd.rating === 'C' && hdtn.rating === 'C') || countC >= 3) {
      pcTrachNhiem = 'C';
    } else if (countC === 0 && dd.rating === 'T' && hdtn.rating === 'T' && (toan.rating === 'T' || tv.rating === 'T' || percentT >= 60.0)) {
      pcTrachNhiem = 'T';
    } else {
      pcTrachNhiem = 'Đ';
    }

    return {
      // Năng lực chung
      tuChuVaTuHoc: nlTuChu,
      giaoTiepVaHopTac: nlGiaoTiep,
      gqvdVaSangTao: nlGQVD,

      // Năng lực đặc thù
      ngonNgu: nlNgonNgu,
      tinhToan: nlTinhToan,
      khoaHoc: nlKhoaHoc,
      congNghe: nlCongNghe,
      tinHoc: nlTinHoc,
      thamMi: nlThamMi,
      theChat: nlTheChat,

      // Phẩm chất chủ yếu
      yeuNuoc: pcYeuNuoc,
      nhanAi: pcNhanAi,
      chamChi: pcChamChi,
      trungThuc: pcTrungThuc,
      trachNhiem: pcTrachNhiem,

      // Mapping danh pháp hiển thị cột tiếng Việt trên ExtJS Grid
      rawMap: {
        'tự chủ và tự học': nlTuChu,
        'giao tiếp và hợp tác': nlGiaoTiep,
        'gqvd và sáng tạo': nlGQVD,
        'giải quyết vấn đề và sáng tạo': nlGQVD,
        'ngôn ngữ': nlNgonNgu,
        'tính toán': nlTinhToan,
        'khoa học': nlKhoaHoc,
        'công nghệ': nlCongNghe,
        'tin học': nlTinHoc,
        'thẩm mĩ': nlThamMi,
        'thẩm mỹ': nlThamMi,
        'thể chất': nlTheChat,
        'yêu nước': pcYeuNuoc,
        'nhân ái': pcNhanAi,
        'chăm chỉ': pcChamChi,
        'trung thực': pcTrungThuc,
        'trách nhiệm': pcTrachNhiem
      }
    };
  }

  return {
    normalizeSubjectRating,
    inferStudentCompetencies
  };
});
