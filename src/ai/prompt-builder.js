/**
 * Prompt Builder for AI Assessment (K-12: Lớp 1 - 12)
 * - Tiểu học: Thông tư 27/2020/TT-BGDĐT
 * - THCS & THPT: Thông tư 22/2021/TT-BGDĐT (GDPT 2018)
 * Respects student privacy: anonymizes names by default.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VnEduPromptBuilder = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function buildPrompt(data, options = {}) {
    const {
      studentName,
      grade = '1',
      subject = 'Toán',
      achievement = 'H',
      score = null,
      strength = '',
      weakness = '',
      progress = '',
      qualities = '',
      competencies = '',
      customTeacherNote = ''
    } = data;

    const anonymize = options.anonymize !== false;
    const displayName = anonymize ? 'Em' : (studentName || 'Em');

    const gradeNum = parseInt(grade, 10) || 1;
    let persona = '';
    let circularRule = '';

    if (gradeNum <= 5) {
      persona = `Bạn là chuyên gia sư phạm tiểu học tại Việt Nam môn ${subject} (Khối ${gradeNum}).`;
      circularRule = 'Thông tư 27/2020/TT-BGDĐT';
    } else if (gradeNum <= 9) {
      persona = `Bạn là giáo viên bộ môn ${subject} cấp Trung học cơ sở (THCS - Khối ${gradeNum}) tại Việt Nam.`;
      circularRule = 'chương trình GDPT 2018 và Thông tư 22/2021/TT-BGDĐT';
    } else {
      persona = `Bạn là giáo viên bộ môn ${subject} cấp Trung học phổ thông (THPT - Khối ${gradeNum}) tại Việt Nam.`;
      circularRule = 'chương trình GDPT 2018 và Thông tư 22/2021/TT-BGDĐT';
    }

    let levelText = 'Hoàn thành / Đạt';
    const achUpper = String(achievement || '').toUpperCase();
    if (achUpper === 'T') levelText = 'Tốt / Hoàn thành tốt';
    else if (achUpper === 'K') levelText = 'Khá';
    else if (achUpper === 'Đ') levelText = 'Đạt';
    else if (achUpper === 'C' || achUpper === 'CĐ') levelText = 'Chưa đạt / Chưa hoàn thành / Cần cố gắng';

    const prompt = `
${persona} Hãy viết 1 câu nhận xét đánh giá học sinh ngắn gọn (từ 15 đến 35 từ) theo đúng tinh thần ${circularRule}.

Thông tin học sinh:
- Đối tượng: ${displayName}
- Khối lớp: Khối ${gradeNum}
- Môn học: ${subject}
${score !== null && score !== undefined && score !== '' ? `- Điểm số kiểm tra: ${score}/10` : ''}
- Mức độ đánh giá: ${levelText}
${strength ? `- Điểm mạnh: ${strength}` : ''}
${weakness ? `- Nội dung cần rèn luyện: ${weakness}` : ''}
${progress ? `- Sự tiến bộ: ${progress}` : ''}
${qualities ? `- Phẩm chất nổi bật: ${qualities}` : ''}
${competencies ? `- Năng lực: ${competencies}` : ''}
${customTeacherNote ? `- Ghi chú giáo viên: ${customTeacherNote}` : ''}

Yêu cầu nghiêm ngặt:
1. KHÔNG nêu tên riêng học sinh vào câu nhận xét nếu không được yêu cầu. Dùng từ ngữ sư phạm thân thiện hoặc bắt đầu bằng cụm từ chỉ hành vi/kết quả (ví dụ: "Nắm vững kiến thức...", "Có tư duy tốt...", "Ý thức học tập tốt...").
2. Đánh giá đúng thực chất theo mức độ "${levelText}" ${score !== null ? `và điểm số ${score}` : ''}, tuyệt đối KHÔNG bịa đặt dữ liệu ngoài thông tin đã cho.
3. Câu văn mạch lạc, tích cực, mang tính khích lệ, phù hợp với tâm lý lứa tuổi học sinh Khối ${gradeNum} và chỉ dẫn cụ thể cho học sinh tiến bộ.
4. Chỉ trả về duy nhất 1 câu nhận xét hoàn chỉnh, không thêm lời chào, không đánh số thứ tự, không kèm ngoặc kép hay giải thích thêm.
`.trim();

    return prompt;
  }

  return {
    buildPrompt
  };
});
