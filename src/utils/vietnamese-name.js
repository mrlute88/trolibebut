/**
 * Vietnamese Name Detector & Heuristics
 * Identifies full Vietnamese personal names and handles duplicates.
 * NEVER alters the student's actual name.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VietnameseNameDetector = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  // Common Vietnamese Surnames & Ethnic Minority Surnames
  const VIETNAMESE_SURNAMES = new Set([
    'nguyễn', 'nguyen', 'trần', 'tran', 'lê', 'le', 'phạm', 'pham',
    'hoàng', 'hoang', 'huỳnh', 'huynh', 'phan', 'vũ', 'vu', 'võ', 'vo',
    'đặng', 'dang', 'bùi', 'bui', 'đỗ', 'do', 'hồ', 'ho', 'ngô', 'ngo',
    'dương', 'duong', 'lý', 'ly', 'đào', 'dao', 'đinh', 'dinh', 'đoàn', 'doan',
    'lâm', 'lam', 'trịnh', 'trinh', 'mai', 'hà', 'ha', 'cao', 'lương', 'luong',
    'châu', 'chau', 'la', 'tạ', 'ta', 'vương', 'vuong', 'phùng', 'phung',
    'tô', 'to', 'thái', 'thai', 'quách', 'quach', 'nông', 'nong', 'vi',
    'lưu', 'luu', 'giang', 'hứa', 'hua', 'tăng', 'tang', 'tôn', 'ton',
    'thạch', 'thach', 'sơn', 'son', 'danh', 'kiên', 'kien', 'kim',
    'thia', 'nhan', 'tiêu', 'tieu', 'liêu', 'lieu', 'triệu', 'trieu',
    'khưu', 'khuu', 'trầm', 'tram', 'đổng', 'dong', 'lục', 'luc', 'ma',
    'bàng', 'bang', 'kha', 'sầm', 'sam', 'cầm', 'cam', 'lò', 'lo',
    'lèo', 'leo', 'viên', 'vien', 'bạc', 'bac', 'hàng', 'hang', 'uông', 'uong',
    'diệp', 'diep', 'tào', 'tao', 'nhâm', 'nham', 'phù', 'phu', 'hầu', 'hau',
    'ung', 'quản', 'quan', 'biện', 'bien', 'chế', 'che', 'ôn', 'on', 'lăng', 'lang'
  ]);

  // Words that should NOT be considered a student name (UI elements, headers, buttons)
  // LƯU Ý QUAN TRỌNG: Tuyệt đối không đưa các tên riêng phổ biến như "nam", "nữ", "đạt", "toán", "trang", "lưu"
  // vào đây vì sẽ khiến học sinh mang tên này (hoặc tách cột Họ đệm + Tên) bị loại trừ nhầm.
  const EXCLUDED_WORDS = new Set([
    'họ và tên', 'họ tên', 'tên học sinh', 'học sinh', 'stt', 'số thứ tự', 'mã học sinh', 'mã hs',
    'họ và tên đệm', 'họ và đệm', 'họ đệm', 'họ và chữ đệm', 'họ lót', 'họ', 'tên',
    'ngày sinh', 'năm sinh', 'giới tính', 'lớp', 'môn học', 'nhận xét', 'đánh giá',
    'xếp loại', 'ghi chú', 'thao tác', 'xóa', 'sửa', 'xuất', 'nhập',
    'tìm kiếm', 'chọn', 'tất cả', 'tiếp theo', 'hoàn thành', 'chưa hoàn thành',
    'cần cố gắng', 'môn toán', 'tiếng việt', 'tiếng anh', 'khoa học',
    'lịch sử', 'địa lí', 'tin học', 'đạo đức', 'mĩ thuật', 'âm nhạc', 'thể chất',
    'mức đạt được', 'điểm ktđk', 'nội dung nhận xét', 'lời nhận xét'
  ]);

  // Regex to check presence of Vietnamese diacritics
  const VIETNAMESE_DIACRITICS_REGEX = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

  function removeDiacritics(str) {
    if (!str) return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
  }

  function cleanStudentName(text) {
    if (!text || typeof text !== 'string') return '';
    // Strip leading numbers like "1. ", "02 - ", "[1]"
    let cleaned = text.replace(/^[\s\d#№\.\-\[\]()|:]+/, '');
    // Strip trailing status badges or action words like "(Nữ)", " - Đang học"
    cleaned = cleaned.replace(/\s*\((nữ|nam|chuyển đi|đang học)\)/gi, '');
    // Strip redundant extra spaces
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned;
  }

  function isVietnameseName(text) {
    if (!text || typeof text !== 'string') return false;

    const cleaned = cleanStudentName(text);
    if (!cleaned) return false;

    const lower = cleaned.toLowerCase();
    if (EXCLUDED_WORDS.has(lower)) return false;

    // A student name typically has 2 to 5 words
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 6) return false;

    // Must not contain digits or weird symbols
    if (/\d|[<>{}\[\]=+\\_;!@#$%^&*~?]/.test(cleaned)) return false;

    // Every word must consist only of letters
    const allAlphabet = words.every(w => /^[A-Za-zÀ-ỹ]+$/.test(w));
    if (!allAlphabet) return false;

    // Check if first word is a known Vietnamese surname
    const firstWordLower = words[0].toLowerCase();
    const firstWordNoAccent = removeDiacritics(firstWordLower);

    const hasKnownSurname = VIETNAMESE_SURNAMES.has(firstWordLower) || VIETNAMESE_SURNAMES.has(firstWordNoAccent);
    const hasDiacritics = VIETNAMESE_DIACRITICS_REGEX.test(cleaned);

    // Each word should be capitalized appropriately in Vietnamese names
    const mostlyCapitalized = words.filter(w => /^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/.test(w)).length >= (words.length - 1);
    const allCapitalized = words.every(w => /^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/.test(w));

    if (hasKnownSurname) return true;
    if (hasDiacritics && mostlyCapitalized && words.length >= 2) return true;

    // Support valid names without diacritics (e.g. "Thia Thanh Duy", "Kim Van Duy", "Cao Anh Duong")
    if (allCapitalized && words.length >= 2 && words.length <= 5) {
      const anyExcludedWord = words.some(w => EXCLUDED_WORDS.has(w.toLowerCase()));
      if (!anyExcludedWord) {
        return true;
      }
    }

    return false;
  }

  function detectDuplicates(students) {
    if (!Array.isArray(students)) return { hasDuplicates: false, duplicateGroups: {} };

    const nameMap = new Map();
    const duplicateGroups = {};
    let hasDuplicates = false;

    students.forEach((s, idx) => {
      const norm = (s.studentName || '').toLowerCase().trim();
      if (!norm) return;

      if (!nameMap.has(norm)) {
        nameMap.set(norm, []);
      }
      nameMap.get(norm).push({ index: idx, student: s });
    });

    for (const [normName, list] of nameMap.entries()) {
      if (list.length > 1) {
        hasDuplicates = true;
        duplicateGroups[normName] = list;
      }
    }

    return {
      hasDuplicates,
      duplicateGroups
    };
  }

  function isHeaderOrLabel(text) {
    if (!text || typeof text !== 'string') return false;
    const lower = cleanStudentName(text).toLowerCase().trim();
    if (!lower) return false;
    if (EXCLUDED_WORDS.has(lower)) return true;
    return /^(họ và tên|họ tên|họ và tên đệm|họ và đệm|họ đệm|họ và chữ đệm|họ lót|họ|tên|tên học sinh|học sinh|mã học sinh|mã hs|stt|số thứ tự|ngày sinh|năm sinh|giới tính|nhận xét|đánh giá|thao tác|mức đạt được|điểm ktđk|lời nhận xét)$/i.test(lower);
  }

  return {
    cleanStudentName,
    isVietnameseName,
    detectDuplicates,
    removeDiacritics,
    isHeaderOrLabel,
    EXCLUDED_WORDS
  };
});
