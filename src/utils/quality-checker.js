/**
 * Quality Checker for Student Comments
 * Validates against TT27 standards, profanity, placeholders, undefined/null, length.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VnEduQualityChecker = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const BANNED_PATTERNS = [
    /undefined/i,
    /\bnull\b/i,
    /\bNaN\b/,            // JS NaN error (case-sensitive tránh bắt nhầm 'gian nan')
    /\{\{[^}]+\}\}/,      // Unreplaced template tags like {{strength}}
    /\[[^\]]+\]/,         // Unfilled brackets like [điền ở đây]
    /<[^>]+>/,            // HTML tags or angular braces
    /(?<![\p{L}\p{M}])(ngu|dốt|lười biếng|hư đốn|kém cỏi|vô dụng)(?![\p{L}\p{M}])/iu // Từ ngữ cấm, sử dụng Unicode boundary tránh nhầm từ 'nguồn', 'nguội'
  ];

  function validateComment(commentText) {
    const errors = [];
    if (!commentText || typeof commentText !== 'string' || commentText.trim().length === 0) {
      return {
        valid: false,
        errors: ['Nhận xét không được để trống.']
      };
    }

    const trimmed = commentText.trim();

    if (trimmed.length < 6) {
      errors.push('Nhận xét quá ngắn (tối thiểu 6 ký tự).');
    }

    if (trimmed.length > 500) {
      errors.push('Nhận xét quá dài (tối đa 500 ký tự trên vnEdu).');
    }

    for (const pat of BANNED_PATTERNS) {
      if (pat.test(trimmed)) {
        errors.push(`Nhận xét chứa từ ngữ hoặc định dạng không hợp lệ: "${trimmed.match(pat)[0]}"`);
      }
    }

    // Check for repetitive words (e.g. "rất rất rất" or repeated sentence chunks)
    const words = trimmed.toLowerCase().split(/\s+/);
    let currentConsecutive = 1;
    let hasAbnormalRepetition = false;
    for (let i = 1; i < words.length; i++) {
      if (words[i] && words[i] === words[i - 1]) {
        currentConsecutive++;
        if (currentConsecutive >= 3) {
          hasAbnormalRepetition = true;
          break;
        }
      } else {
        currentConsecutive = 1;
      }
    }
    if (hasAbnormalRepetition) {
      errors.push('Nhận xét có hiện tượng lặp từ bất thường liên tiếp.');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  return {
    validateComment
  };
});
