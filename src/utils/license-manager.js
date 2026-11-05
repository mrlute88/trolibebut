/**
 * vnEdu License Manager (Extension Guard)
 * Quản lý & kiểm tra bản quyền gắn liền với Tên Giáo Viên & Tên Trường học
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VnEduLicenseManager = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_SECRET_KEY = 'VNEDU_LICENSE_SECRET_2026_TH_NGOCTO_0347268432_SECURE';
  const STORAGE_KEY_ACTIVATION = 'vnedu_activated_license_record_v2';
  const STORAGE_KEY_LEGACY = 'vnedu_assistant_activated_key';

  const MASTER_HASHES = [
    '347528a9', // thngocto
    '48e28ed5',
    '68f16436',
    '67f162a3',
    'd7f2a42',
    'c7f28af',
    'acb6bc37',
    '7ee39b04'
  ];

  function fnv1aHash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
  }

  function basicNormalize(str) {
    return (str || '')
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/\s+/g, '');
  }

  // SHA-256 Pure JS
  function sha256(ascii) {
    function rightRotate(value, amount) {
      return (value >>> amount) | (value << (32 - amount));
    }
    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    let lengthProperty = 'length';
    let i, j;
    let result = '';
    const words = [];
    const asciiBitLength = ascii[lengthProperty] * 8;
    let hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const k = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    let primeCounter = k[lengthProperty];
    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 313; i += candidate) {
          isComposite[i] = candidate;
        }
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += '\x80';
    while ((ascii[lengthProperty] % 64) - 56) ascii += '\x00';
    for (i = 0; i < ascii[lengthProperty]; i++) {
      j = ascii.charCodeAt(i);
      if (j >> 8) return '';
      words[i >> 2] |= j << (((3 - i) % 4) * 8);
    }
    words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
    words[words[lengthProperty]] = asciiBitLength;
    for (j = 0; j < words[lengthProperty]; ) {
      const w = words.slice(j, (j += 16));
      const oldHash = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        const i2 = i + j;
        const w15 = w[i - 15], w2 = w[i - 2];
        const a = hash[0], e = hash[4];
        const temp1 =
          hash[7] +
          (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
          ((e & hash[5]) ^ (~e & hash[6])) +
          k[i] +
          (w[i] =
            i < 16
              ? w[i]
              : (w[i - 16] +
                  (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                  w[i - 7] +
                  (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
                0);
        const temp2 =
          (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
          ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (i = 0; i < 8; i++) {
        hash[i] = (hash[i] + oldHash[i]) | 0;
      }
    }
    for (i = 0; i < 8; i++) {
      for (let b = 3; b >= 0; b--) {
        const byte = (hash[i] >> (8 * b)) & 255;
        result += (byte < 16 ? '0' : '') + byte.toString(16);
      }
    }
    return result;
  }

  function hexToBin(hex) {
    let str = '';
    for (let i = 0; i < hex.length; i += 2) {
      str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    }
    return str;
  }

  function hmacSha256(key, message) {
    const blockSize = 64;
    let k = key;
    if (k.length > blockSize) {
      k = hexToBin(sha256(k));
    }
    while (k.length < blockSize) {
      k += '\x00';
    }
    let oKeyPad = '', iKeyPad = '';
    for (let i = 0; i < blockSize; i++) {
      oKeyPad += String.fromCharCode(k.charCodeAt(i) ^ 0x5c);
      iKeyPad += String.fromCharCode(k.charCodeAt(i) ^ 0x36);
    }
    const innerHash = hexToBin(sha256(iKeyPad + message));
    return sha256(oKeyPad + innerHash);
  }

  function base64UrlToUtf8(b64) {
    let s = (b64 || '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(s, 'base64').toString('utf8');
    }
    const binStr = atob(s);
    const escaped = Array.from(binStr).map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('');
    return decodeURIComponent(escaped);
  }

  function cleanTeacherName(name) {
    let s = (name || '').toLowerCase().trim();
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
    s = s.replace(/^(?:gv\.?|thay|co|giao\s*vien|thay\s*co)\s+/i, '');
    s = s.replace(/[^a-z0-9]/g, '');
    return s;
  }

  function cleanSchoolName(school) {
    let s = (school || '').toLowerCase().trim();
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
    s = s.replace(/^(?:truong\s+tieu\s+hoc|truong\s+th|tieu\s+hoc|th|truong\s+thcs|thcs|truong)\s+/i, '');
    s = s.replace(/[^a-z0-9]/g, '');
    return s;
  }

  function parseLicenseKey(keyString) {
    if (!keyString || typeof keyString !== 'string') return null;
    const clean = keyString.trim();

    // Key Master cũ (thngocto)
    const normClean = basicNormalize(clean);
    const oldHash = fnv1aHash(normClean);
    if (MASTER_HASHES.includes(clean) || MASTER_HASHES.includes(oldHash)) {
      return {
        isMaster: true,
        teacher: 'Tác giả / Quản trị viên',
        school: 'Hệ thống toàn quốc',
        expiryDate: '0',
        plan: 'master',
        isExpired: false,
        daysLeft: 99999
      };
    }

    if (!clean.startsWith('VNEDU-')) return null;

    const firstDash = clean.indexOf('-');
    const lastDash = clean.lastIndexOf('-');
    if (firstDash === -1 || lastDash === -1 || firstDash === lastDash) return null;

    const b64 = clean.slice(firstDash + 1, lastDash);
    const sig = clean.slice(lastDash + 1);

    try {
      const jsonStr = base64UrlToUtf8(b64);
      const data = JSON.parse(jsonStr);
      if (!data || !data.t || !data.s) return null;

      let isExpired = false;
      let daysLeft = 99999;
      if (data.e && data.e !== '0') {
        const expDate = new Date(data.e + 'T23:59:59');
        const now = new Date();
        const diffMs = expDate.getTime() - now.getTime();
        daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (daysLeft < 0) {
          isExpired = true;
          daysLeft = 0;
        }
      }

      return {
        isMaster: false,
        rawPayloadB64: b64,
        signature: sig,
        teacher: data.t,
        school: data.s,
        expiryDate: data.e || '0',
        plan: data.p || 'custom',
        createdAt: data.c || '',
        isExpired,
        daysLeft
      };
    } catch (e) {
      return null;
    }
  }

  function verifyLicense(keyString, options = {}) {
    if (!keyString) {
      return { isValid: false, reason: 'Chưa nhập mã kích hoạt bản quyền!' };
    }

    const parsed = parseLicenseKey(keyString);
    if (!parsed) {
      return { isValid: false, reason: 'Mã kích hoạt không đúng hoặc đã bị chỉnh sửa!' };
    }

    if (parsed.isMaster) {
      return {
        isValid: true,
        reason: '✓ Mã kích hoạt Quản trị viên (Master Key) hợp lệ.',
        licenseInfo: parsed
      };
    }

    const secret = options.secret || DEFAULT_SECRET_KEY;
    const expectedSig = hmacSha256(secret, parsed.rawPayloadB64).slice(0, 16).toUpperCase();

    if (parsed.signature !== expectedSig) {
      return {
        isValid: false,
        reason: '❌ Chữ ký bản quyền không hợp lệ! Khóa bí mật không khớp hoặc mã key đã bị làm giả.',
        licenseInfo: parsed
      };
    }

    if (parsed.isExpired) {
      return {
        isValid: false,
        reason: `⚠️ Bản quyền đã HẾT HẠN vào ngày ${formatDateVN(parsed.expiryDate)}! Vui lòng nhập mã bản quyền mới.`,
        licenseInfo: parsed
      };
    }

    if ((options.currentTeacher || (options.teachers && options.teachers.length > 0)) && !options.ignoreMatch) {
      const cleanExpected = cleanTeacherName(parsed.teacher);
      const allowedTeachers = (options.teachers && options.teachers.length > 0)
        ? options.teachers.map(cleanTeacherName)
        : [cleanTeacherName(options.currentTeacher)];

      if (!allowedTeachers.includes(cleanExpected)) {
        return {
          isValid: false,
          isTeacherMismatch: true,
          expectedTeacher: parsed.teacher,
          currentTeacher: options.currentTeacher,
          reason: `⚠️ Mã bản quyền này được cấp cho GV: "${parsed.teacher}". Sổ điểm/Lớp hiện tại trên vnEdu do GV: "${(options.teachers && options.teachers.length > 0) ? options.teachers.join(' & ') : options.currentTeacher}" phụ trách. Vui lòng sử dụng mã đúng với giáo viên phụ trách!`,
          licenseInfo: parsed
        };
      }
    }

    if (options.currentSchool && !options.ignoreMatch) {
      const cleanExpected = cleanSchoolName(parsed.school);
      const cleanCurrent = cleanSchoolName(options.currentSchool);

      if (cleanExpected && cleanCurrent && cleanExpected !== cleanCurrent) {
        return {
          isValid: false,
          reason: `⚠️ Mã bản quyền này được cấp cho đơn vị: "${parsed.school}". Đơn vị hiện tại trên vnEdu là: "${options.currentSchool}". Vui lòng sử dụng đúng trường được cấp phép!`,
          licenseInfo: parsed
        };
      }
    }

    return {
      isValid: true,
      reason: '✓ Bản quyền hợp lệ.',
      licenseInfo: parsed
    };
  }

  function formatDateVN(dateStr) {
    if (!dateStr || dateStr === '0') return 'Vĩnh viễn (Không thời hạn)';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  }

  function isValidTeacherName(name) {
    if (!name || typeof name !== 'string') return false;
    let s = name.trim();
    // Loại bỏ prefix chức danh
    s = s.replace(/^(?:giáo\s*viên\s*(?:dạy|chủ\s*nhiệm|bộ\s*môn)?|gv\s*(?:dạy|cn|bm)?|thầy|cô|gv\.?|thầy\/cô)\s*[:\-]?\s*/i, '').trim();
    // Loại bỏ phần phụ sau tên
    s = s.replace(/\s*\+\s*\d+.*$/i, '').trim();
    s = s.replace(/\s*\(.*?\)$/i, '').trim();
    s = s.replace(/[\-|,|;].*$/i, '').trim();

    if (s.length < 3 || s.length > 45) return false;
    const lower = s.toLowerCase();
    const invalidWords = [
      'học sinh', 'hoc sinh', 'toàn trường', 'tat ca', 'tất cả', 'quản trị', 'quan tri',
      'hệ thống', 'he thong', 'nhận xét', 'nhan xet', 'đánh giá', 'danh gia',
      'sổ điểm', 'so diem', 'sổ nhận xét', 'so nhan xet', 'tiểu học', 'tieu hoc',
      'trung học', 'thcs', 'thpt', 'chủ nhiệm', 'bộ môn', 'phân hiệu',
      'điểm trường', 'quyền hạn', 'quyen han', 'ủy quyền', 'uy quyen',
      'tiếng việt', 'toán', 'tiếng anh', 'tin học', 'khối', 'lớp', 'môn học',
      'học kỳ', 'giữa kỳ', 'cuối kỳ', 'cuối năm', 'đăng nhập', 'đăng xuất',
      'báo cáo', 'thống kê', 'tra cứu', 'danh mục', 'chọn', 'tìm kiếm', 'phần mềm',
      'trợ lý', 'phiên bản', 'thoát', 'cấu hình', 'hướng dẫn', 'hủy', 'lưu'
    ];
    for (const w of invalidWords) {
      if (lower === w || lower.includes(w)) {
        return false;
      }
    }
    const cleanWords = s.split(/\s+/).filter(Boolean);
    if (cleanWords.length < 2 || cleanWords.length > 6) return false;
    return true;
  }

  /**
   * Bóc tách danh sách giáo viên từ chuỗi text vnEdu (hỗ trợ 1 hoặc nhiều GV cùng dạy)
   * Ví dụ: "Giáo viên dạy: Hứa Thị Ngọc Nga & Trần Thị Thanh Trúc - 0 GV được ủy quyền"
   * -> ["Hứa Thị Ngọc Nga", "Trần Thị Thanh Trúc"]
   */
  function extractTeachersFromText(text) {
    if (!text || typeof text !== 'string') return [];
    const multiPattern = /(?:giáo\s*viên\s*(?:dạy|chủ\s*nhiệm|bộ\s*môn)?|gv\s*(?:dạy|cn|bm)?)\s*[:\-]\s*([A-ZÀ-Ỹa-zà-ỹ\s,&/;\+]+?)(?:\s+-\s+|\s*-\s*\d+\s*gv|\s*\+\s*\d+|\s*\(|\s*(?:quần|quyền)\s*hạn|[\n\r]|$)/i;
    const m = text.match(multiPattern);
    if (!m || !m[1]) return [];
    const rawNames = m[1].split(/\s+(?:&|,|;|\/|và)\s+|\s*(?:&|,|;|\/)\s*/i);
    const result = [];
    for (const raw of rawNames) {
      if (!raw) continue;
      const clean = raw
        .replace(/^(?:giáo\s*viên\s*(?:dạy|chủ\s*nhiệm|bộ\s*môn)?|gv\s*(?:dạy|cn|bm)?|thầy|cô|gv\.?|thầy\/cô)\s*[:\-]?\s*/i, '')
        .replace(/\s*\+\s*\d+.*$/i, '')
        .replace(/\s*\(.*?\)$/i, '')
        .replace(/[\-|,|;].*$/i, '')
        .trim();
      if (clean && isValidTeacherName(clean) && !result.includes(clean)) {
        result.push(clean);
      }
    }
    return result;
  }

  /**
   * Tự động phát hiện Tên Giáo Viên & Tên Trường học từ giao diện trang web vnEdu
   * Quét header, user profile, banner, document.title, top window, ExtJS menu & taskbar...
   */
  function detectVnEduTeacherAndSchool(options = {}) {
    let teacher = '';
    let teachers = [];
    let school = '';

    if (typeof document === 'undefined') {
      return { teacher: '', teachers: [], school: '' };
    }

    // Danh sách giáo viên đã lưu bản quyền trên máy để đối soát chéo (nếu có)
    const savedTeachers = [];
    if (options && options.licensesMap) {
      Object.values(options.licensesMap).forEach(r => {
        if (r && r.teacher && !r.isMaster && !savedTeachers.includes(r.teacher)) {
          savedTeachers.push(r.teacher);
        }
      });
    }
    if (options && options.currentRecord && options.currentRecord.teacher && !options.currentRecord.isMaster) {
      if (!savedTeachers.includes(options.currentRecord.teacher)) {
        savedTeachers.push(options.currentRecord.teacher);
      }
    }

    // 0. ƯU TIÊN SỐ 0: Đọc kết quả nhận diện từ MAIN world ExtJS bridge (nếu đã tìm thấy trong bộ nhớ ExtJS)
    if (typeof document !== 'undefined') {
      const dt = document.documentElement.getAttribute('data-vnedu-detected-teacher');
      if (dt && isValidTeacherName(dt)) {
        teacher = dt;
        if (!teachers.includes(dt)) teachers.unshift(dt);
      }
      const dts = document.documentElement.getAttribute('data-vnedu-detected-teachers');
      if (dts) {
        try {
          const parsed = JSON.parse(dts);
          if (Array.isArray(parsed)) {
            for (const t of parsed) {
              if (isValidTeacherName(t) && !teachers.includes(t)) {
                teachers.push(t);
                if (!teacher) teacher = t;
              }
            }
          }
        } catch (e) {}
      }
      const ds = document.documentElement.getAttribute('data-vnedu-detected-school');
      if (ds && !school) {
        school = ds;
      }
    }

    // Quét toàn bộ localStorage & sessionStorage đối soát với bản quyền đã lưu
    if (savedTeachers.length > 0) {
      try {
        const storages = [sessionStorage, localStorage];
        for (const st of storages) {
          if (!st) continue;
          for (let i = 0; i < st.length; i++) {
            const k = st.key(i);
            if (!k) continue;
            const v = st.getItem(k);
            if (!v || typeof v !== 'string') continue;
            for (const savedT of savedTeachers) {
              if (v.includes(savedT)) {
                if (!teachers.includes(savedT)) teachers.unshift(savedT);
                if (!teacher) teacher = savedT;
                break;
              }
            }
            if (teacher) break;
          }
          if (teacher) break;
        }
      } catch (e) {}
    }

    const docs = [document];
    try {
      if (window.top && window.top.document && window.top.document !== document) {
        docs.push(window.top.document);
      }
    } catch (e) {}

    try {
      const iframes = document.querySelectorAll('iframe');
      for (const ifr of iframes) {
        try {
          if (ifr.contentDocument && !docs.includes(ifr.contentDocument)) {
            docs.push(ifr.contentDocument);
          }
        } catch (e) {}
      }
    } catch (e) {}

    for (const doc of docs) {
      if (!doc) continue;

      // 1. ƯU TIÊN SỐ 1: Quét trường "Giáo viên dạy: ..." trên thanh công cụ sổ điểm vnEdu
      if (teachers.length === 0) {
        const potentialEls = doc.querySelectorAll('.x-toolbar, .x-panel-header, .x-grid3-header, .x-grid3-topbar, div, td, span, b, strong, label, p');
        for (const el of potentialEls) {
          const txt = (el.innerText || el.textContent || '').trim();
          if (txt.length >= 10 && txt.length <= 250 && /giáo\s*viên\s*dạy|gv\s*dạy|giáo\s*viên\s*chủ\s*nhiệm|gvcn/i.test(txt)) {
            const found = extractTeachersFromText(txt);
            if (found.length > 0) {
              teachers = found;
              teacher = found[0];
              break;
            }
          }
        }
      }

      // Quét text trên body nếu cấu trúc DOM bị phân tách
      if (teachers.length === 0 && doc.body) {
        const bodyTxt = doc.body.innerText || '';
        const found = extractTeachersFromText(bodyTxt);
        if (found.length > 0) {
          teachers = found;
          teacher = found[0];
        }
      }

      // 2. ƯU TIÊN SỐ 2: Quét ExtJS Popup Menu & Dropdown (.x-menu, .x-menu-item-text, .x-menu-list-item)
      // Thường chứa danh sách tài khoản, trường học, giáo viên phụ trách (như trong ảnh chụp thực tế trên Desktop vnEdu)
      const menuEls = doc.querySelectorAll('.x-menu-item-text, .x-menu-item, .x-menu-list-item, .x-menu a, .x-menu-check-item, .x-menu span, .ux-taskbar .x-btn-text, .ux-taskbar-item, .x-btn-text');
      for (const el of menuEls) {
        const txt = (el.innerText || el.textContent || '').trim();
        if (!txt || txt.length < 3 || txt.length > 80) continue;

        // Nhận diện trường học
        if (!school && /trường|tiểu\s*học|th|thcs|thpt|mầm\s*non/i.test(txt)) {
          const matchSchool = txt.match(/(?:trường\s*(?:tiểu\s*học|th|thcs|thpt|mầm\s*non)?\s*[^|\n\r\-•]{3,50})/i);
          if (matchSchool) {
            school = matchSchool[0].trim();
          } else {
            school = txt;
          }
        }

        // Đối soát nếu khớp với tên giáo viên đã kích hoạt bản quyền trên máy
        for (const st of savedTeachers) {
          if (cleanTeacherName(txt) === cleanTeacherName(st)) {
            if (!teachers.includes(st)) teachers.unshift(st);
            if (!teacher) teacher = st;
            break;
          }
        }

        // Nhận diện giáo viên từ tên hợp lệ
        if (!teacher && isValidTeacherName(txt)) {
          if (!/trường|tiểu\s*học|th|thcs|thpt|mầm\s*non|khối|lớp|năm\s*học|học\s*kỳ|hệ\s*thống|đăng\s*xuất|thoát|cài\s*đặt|hướng\s*dẫn|báo\s*cáo|thống\s*kê|desktop|bàn\s*làm\s*việc|start/i.test(txt)) {
            teacher = txt;
            if (!teachers.includes(txt)) teachers.push(txt);
          }
        }
      }

      // Quét đối soát tên giáo viên đã lưu bản quyền trên toàn bộ body
      if (savedTeachers.length > 0 && doc.body) {
        const bodyTxt = doc.body.innerText || doc.body.textContent || '';
        for (const st of savedTeachers) {
          if (bodyTxt.includes(st)) {
            if (!teachers.includes(st)) teachers.unshift(st);
            if (!teacher) teacher = st;
            break;
          }
        }
      }

      // Quét các thuộc tính tooltip, title, ext:qtip (thường chứa tên đầy đủ của giáo viên/trường học trên taskbar)
      const qtipEls = doc.querySelectorAll('[ext\\:qtip], [data-qtip], [title], [aria-label], .ux-taskbar-item, .x-btn');
      for (const el of qtipEls) {
        const txt = (el.getAttribute('ext:qtip') || el.getAttribute('data-qtip') || el.getAttribute('title') || el.getAttribute('aria-label') || '').trim();
        if (!txt || txt.length < 3 || txt.length > 80) continue;

        if (!school && /trường|tiểu\s*học|th|thcs|thpt|mầm\s*non/i.test(txt)) {
          const matchSchool = txt.match(/(?:trường\s*(?:tiểu\s*học|th|thcs|thpt|mầm\s*non)?\s*[^|\n\r\-•]{3,50})/i);
          if (matchSchool) school = matchSchool[0].trim();
        }

        for (const st of savedTeachers) {
          if (cleanTeacherName(txt).includes(cleanTeacherName(st))) {
            if (!teachers.includes(st)) teachers.unshift(st);
            if (!teacher) teacher = st;
            break;
          }
        }

        if (!teacher && isValidTeacherName(txt)) {
          if (!/trường|tiểu\s*học|th|thcs|thpt|mầm\s*non|khối|lớp|năm\s*học|học\s*kỳ|hệ\s*thống|đăng\s*xuất|thoát|cài\s*đặt|hướng\s*dẫn|báo\s*cáo|thống\s*kê|desktop|bàn\s*làm\s*việc|start|system/i.test(txt)) {
            teacher = txt;
            if (!teachers.includes(txt)) teachers.push(txt);
          }
        }
      }

      // 3. ƯU TIÊN SỐ 3: Quét thông tin tài khoản / Header / User Profile vnEdu
      if (!teacher) {
        const teacherSelectors = [
          '#lblFullName',
          '#user_fullname',
          '#header_user_name',
          '.user-name',
          '.user-fullname',
          '.profile-name',
          '.username',
          '#tb-user-name',
          '[id*="lblFullName"]',
          '[id*="userName"]',
          '[id*="user_name"]',
          '[id*="TenGiaoVien"]',
          '[id*="HoTen"]',
          '.vnedu-user',
          '#vnedu-user',
          '.account-name',
          '.nav-user',
          '.header-user'
        ];

        for (const sel of teacherSelectors) {
          const el = doc.querySelector(sel);
          if (el) {
            const txt = (el.innerText || el.textContent || '').trim();
            if (txt && isValidTeacherName(txt)) {
              teacher = txt;
              break;
            }
          }
        }
      }

      // 4. ƯU TIÊN SỐ 4: Quét theo lời chào "Xin chào: [Tên]"
      if (!teacher) {
        const textElements = Array.from(doc.querySelectorAll('.x-btn-text, .x-toolbar-cell, header, .header, #header, span, div, a'));
        for (const el of textElements) {
          const txt = (el.innerText || el.textContent || '').trim();
          if (txt && /xin\s*chào/i.test(txt)) {
            const match = txt.match(/xin\s*chào\s*[:,\-]?\s*(?:thầy|cô|gv\.?|thầy\/cô)?\s*([A-ZÀ-Ỹ][a-zà-ỹA-ZÀ-Ỹ\s]{2,35})/i);
            if (match && match[1]) {
              const candidate = match[1].replace(/^(?:gv\.?|thầy|cô)\s+/i, '').trim();
              if (isValidTeacherName(candidate)) {
                teacher = candidate;
                break;
              }
            }
          }
        }
      }

      // 5. ƯU TIÊN SỐ 5: Quét ExtJS Desktop Start Menu & Taskbar vnEdu
      if (!teacher) {
        const startMenuHeader = doc.querySelector('.ux-start-menu-tl .x-window-header-text, .ux-start-menu-header, #ux-start-menu, .x-desktop-taskbar');
        if (startMenuHeader) {
          const txt = (startMenuHeader.innerText || startMenuHeader.textContent || '').trim();
          if (txt && isValidTeacherName(txt)) {
            teacher = txt;
          }
        }
      }

      // 6. Quét Tên Trường
      if (!school) {
        // Quét góc dưới thanh taskbar (ví dụ: "Trường Tiểu học...")
        const taskbarStatus = doc.querySelector('.ux-taskbar, .x-statusbar, #statusbar, .ux-taskbar-status, .taskbar');
        if (taskbarStatus) {
          const txt = (taskbarStatus.innerText || taskbarStatus.textContent || '').trim();
          const matchSchool = txt.match(/(?:trường\s*(?:tiểu\s*học|th|thcs|thpt|mầm\s*non)?\s*[^|\n\r\-•]{3,50})/i);
          if (matchSchool) {
            school = matchSchool[0].trim();
          }
        }
      }

      if (!school) {
        const schoolSelectors = [
          '#lblSchoolName',
          '#school_name',
          '.school-name',
          '.school_name',
          '.app-school-name',
          '[id*="SchoolName"]',
          '[id*="school"]',
          '.banner-title',
          '.header-title'
        ];

        for (const sel of schoolSelectors) {
          const el = doc.querySelector(sel);
          if (el) {
            const txt = (el.innerText || el.textContent || '').trim();
            if (txt && /trường|tiểu\s*học|th|thcs|thpt/i.test(txt)) {
              school = txt;
              break;
            }
          }
        }
      }

      if (!school && doc.title) {
        const titleMatch = doc.title.match(/(?:trường\s*(?:tiểu\s*học|th|thcs|thpt|mầm\s*non)?\s*[^|\n\r\-•]{3,50})/i);
        if (titleMatch) {
          school = titleMatch[0].trim();
        }
      }
    }

    // 6. Fallback quét sessionStorage & localStorage của vnEdu
    if (!teacher) {
      try {
        const storages = [sessionStorage, localStorage];
        for (const st of storages) {
          if (!st) continue;
          for (let i = 0; i < st.length; i++) {
            const key = st.key(i);
            if (!key) continue;
            const lk = key.toLowerCase();
            if (lk.includes('user') || lk.includes('auth') || lk.includes('profile') || lk.includes('login')) {
              try {
                const val = st.getItem(key);
                if (val && typeof val === 'string') {
                  if (val.startsWith('{') && val.endsWith('}')) {
                    const parsed = JSON.parse(val);
                    const candidate = parsed.fullname || parsed.fullName || parsed.teacher_name || parsed.user_fullname || parsed.displayName || parsed.name;
                    if (candidate && isValidTeacherName(candidate)) {
                      teacher = candidate;
                      break;
                    }
                  } else if (isValidTeacherName(val)) {
                    teacher = val;
                    break;
                  }
                }
              } catch (e) {}
            }
          }
          if (teacher) break;
        }
      } catch (e) {}
    }

    // Làm sạch tên giáo viên
    if (teacher) {
      teacher = teacher
        .replace(/^(?:giáo\s*viên\s*(?:dạy|chủ\s*nhiệm|bộ\s*môn)?|gv\s*(?:dạy|cn|bm)?|thầy|cô|gv\.?|thầy\/cô)\s*[:\-]?\s*/i, '')
        .replace(/\s*\+\s*\d+.*$/i, '')
        .replace(/\s*\(.*?\)$/i, '')
        .replace(/[\-|,|;].*$/i, '')
        .trim();
    }

    if (teachers.length === 0 && teacher) {
      teachers = [teacher];
    }

    return {
      teacher: teacher || (teachers[0] || ''),
      teachers: teachers,
      school: school || ''
    };
  }

  // Quản lý lưu trữ & kiểm tra bản quyền đa tài khoản
  function isExtensionEnv() {
    try {
      return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id && !!chrome.storage && !!chrome.storage.local;
    } catch (e) {
      return false;
    }
  }

  const STORAGE_KEY_MAP = 'vnedu_activated_licenses_map_v2';

  function getAllStoredRecords(callback) {
    try {
      localStorage.removeItem(STORAGE_KEY_LEGACY);
    } catch (e) {}

    if (isExtensionEnv()) {
      try {
        chrome.storage.local.remove([STORAGE_KEY_LEGACY]);
        chrome.storage.local.get([STORAGE_KEY_ACTIVATION, STORAGE_KEY_MAP], function (res) {
          let rec = res && res[STORAGE_KEY_ACTIVATION];
          let map = (res && res[STORAGE_KEY_MAP]) || {};
          if (typeof map !== 'object' || Array.isArray(map)) map = {};

          try {
            if (!rec) {
              const localRec = localStorage.getItem(STORAGE_KEY_ACTIVATION);
              if (localRec) rec = JSON.parse(localRec);
            }
            if (Object.keys(map).length === 0) {
              const localMap = localStorage.getItem(STORAGE_KEY_MAP);
              if (localMap) map = JSON.parse(localMap);
            }
          } catch (e) {}

          if (rec && rec.key) {
            const keyClean = rec.isMaster ? '_master_' : cleanTeacherName(rec.teacher);
            if (keyClean && !map[keyClean]) {
              map[keyClean] = rec;
            }
          }

          callback(rec || null, map);
        });
        return;
      } catch (e) {}
    }

    let rec = null;
    let map = {};
    try {
      const localRec = localStorage.getItem(STORAGE_KEY_ACTIVATION);
      if (localRec) rec = JSON.parse(localRec);
      const localMap = localStorage.getItem(STORAGE_KEY_MAP);
      if (localMap) map = JSON.parse(localMap);
    } catch (e) {}

    if (rec && rec.key) {
      const keyClean = rec.isMaster ? '_master_' : cleanTeacherName(rec.teacher);
      if (keyClean && !map[keyClean]) {
        map[keyClean] = rec;
      }
    }
    callback(rec, map);
  }

  function getStoredRecord(callback) {
    getAllStoredRecords((rec) => {
      if (callback) callback(rec);
    });
  }

  function saveStoredRecord(record, callback) {
    getAllStoredRecords((_, existingMap) => {
      const map = Object.assign({}, existingMap);
      const keyClean = record.isMaster ? '_master_' : cleanTeacherName(record.teacher);
      if (keyClean) {
        map[keyClean] = record;
      }

      try {
        localStorage.setItem(STORAGE_KEY_ACTIVATION, JSON.stringify(record));
        localStorage.setItem(STORAGE_KEY_MAP, JSON.stringify(map));
      } catch (e) {}

      if (isExtensionEnv()) {
        try {
          chrome.storage.local.set({
            [STORAGE_KEY_ACTIVATION]: record,
            [STORAGE_KEY_MAP]: map
          }, () => {
            if (callback) callback(true);
          });
          return;
        } catch (e) {}
      }

      if (callback) callback(true);
    });
  }

  function clearStoredRecord(teacherName, callback) {
    getAllStoredRecords((currRec, map) => {
      let newRec = currRec;
      const newMap = Object.assign({}, map);

      if (teacherName && typeof teacherName === 'string') {
        const cleanT = cleanTeacherName(teacherName);
        if (newMap[cleanT]) delete newMap[cleanT];
        if (currRec && cleanTeacherName(currRec.teacher) === cleanT) {
          const remainingKeys = Object.keys(newMap).filter(k => k !== '_master_');
          newRec = remainingKeys.length > 0 ? newMap[remainingKeys[0]] : null;
        }
      } else {
        newRec = null;
        for (const k of Object.keys(newMap)) {
          delete newMap[k];
        }
      }

      try {
        if (newRec) {
          localStorage.setItem(STORAGE_KEY_ACTIVATION, JSON.stringify(newRec));
        } else {
          localStorage.removeItem(STORAGE_KEY_ACTIVATION);
          localStorage.removeItem(STORAGE_KEY_LEGACY);
        }
        localStorage.setItem(STORAGE_KEY_MAP, JSON.stringify(newMap));
      } catch (e) {}

      if (isExtensionEnv()) {
        try {
          if (newRec) {
            chrome.storage.local.set({ [STORAGE_KEY_ACTIVATION]: newRec, [STORAGE_KEY_MAP]: newMap }, () => {
              if (callback) callback(true);
            });
          } else {
            chrome.storage.local.remove([STORAGE_KEY_ACTIVATION, STORAGE_KEY_LEGACY], () => {
              chrome.storage.local.set({ [STORAGE_KEY_MAP]: newMap }, () => {
                if (callback) callback(true);
              });
            });
          }
          return;
        } catch (e) {}
      }

      if (callback) callback(true);
    });
  }

  /**
   * Kiểm tra bản quyền hiện tại kèm xác thực tài khoản vnEdu
   * @param {Object} options: { currentTeacher, currentSchool }
   * @param {Function} callback: (isLicensed, licenseInfo, reason, details) => void
   */
  function checkCurrentLicense(options = {}, callback) {
    getAllStoredRecords((currentRecord, licensesMap) => {
      // 1. Tự động phát hiện tài khoản vnEdu trên trang nếu không truyền vào
      let currTeacher = options.currentTeacher;
      let currSchool = options.currentSchool;
      let detectedTeachers = options.teachers || [];

      const detected = detectVnEduTeacherAndSchool({ ...options, licensesMap, currentRecord });
      if (!currTeacher && detected.teacher) currTeacher = detected.teacher;
      if (!currSchool && detected.school) currSchool = detected.school;
      if (detectedTeachers.length === 0 && detected.teachers && detected.teachers.length > 0) {
        detectedTeachers = detected.teachers;
      }
      if (detectedTeachers.length === 0 && currTeacher) {
        detectedTeachers = [currTeacher];
      }

      // 2. Kiểm tra nếu có Master Key (khóa tổng quản trị)
      const masterRecord = (licensesMap && licensesMap['_master_']) || (currentRecord && currentRecord.isMaster ? currentRecord : null);
      if (masterRecord && masterRecord.key) {
        const masterRes = verifyLicense(masterRecord.key, { ignoreMatch: true });
        if (masterRes.isValid) {
          if (callback) callback(true, masterRes.licenseInfo, '✓ Mã Quản trị viên (Master Key) hợp lệ.', {
            currentTeacher: currTeacher || 'Quản trị viên',
            teachers: detectedTeachers,
            currentSchool: currSchool || 'Toàn hệ thống',
            isMaster: true,
            status: 'VALID',
            matchedRecord: masterRecord
          });
          return;
        }
      }

      // 3. Nếu chưa có bất kỳ bản quyền nào được lưu
      const hasAnyRecord = (currentRecord && currentRecord.key) || (licensesMap && Object.keys(licensesMap).length > 0);
      if (!hasAnyRecord) {
        if (callback) callback(false, null, 'Chưa kích hoạt bản quyền.', {
          currentTeacher: currTeacher || '',
          teachers: detectedTeachers,
          currentSchool: currSchool || '',
          status: 'UNLICENSED'
        });
        return;
      }

      // 4. NẾU ĐÃ PHÁT HIỆN ĐƯỢC TÀI KHOẢN GIÁO VIÊN HIỆN TẠI TRÊN VNEDU
      if (detectedTeachers.length > 0) {
        const savedTeachers = Object.values(licensesMap || {})
          .filter(r => r && r.teacher && !r.isMaster)
          .map(r => r.teacher);

        // Duyệt danh sách các giáo viên dạy lớp này để xem ai đã có bản quyền hợp lệ đã kích hoạt trên máy
        let matchedRecord = null;
        let matchedTeacherName = '';

        for (const tName of detectedTeachers) {
          const cleanT = cleanTeacherName(tName);
          let teacherRec = licensesMap && licensesMap[cleanT];
          if (!teacherRec && currentRecord && cleanTeacherName(currentRecord.teacher) === cleanT) {
            teacherRec = currentRecord;
          }
          if (teacherRec && teacherRec.key) {
            const res = verifyLicense(teacherRec.key, {
              currentTeacher: tName,
              teachers: detectedTeachers,
              currentSchool: currSchool
            });
            if (res.isValid) {
              matchedRecord = teacherRec;
              matchedTeacherName = tName;
              break;
            }
          }
        }

        if (matchedRecord) {
          const res = verifyLicense(matchedRecord.key, {
            currentTeacher: matchedTeacherName,
            teachers: detectedTeachers,
            currentSchool: currSchool
          });
          const otherCoTeachers = detectedTeachers.filter(t => cleanTeacherName(t) !== cleanTeacherName(matchedTeacherName));
          const coTeacherMsg = otherCoTeachers.length > 0
            ? ` (cùng GV: ${otherCoTeachers.join(', ')})`
            : '';

          if (callback) callback(true, res.licenseInfo, `✓ Đã kích hoạt bản quyền cho GV: ${matchedTeacherName}${coTeacherMsg}`, {
            currentTeacher: matchedTeacherName,
            teachers: detectedTeachers,
            currentSchool: currSchool,
            status: 'VALID',
            savedTeachers: savedTeachers,
            matchedRecord: matchedRecord
          });
          return;
        }

        // Nếu có bản quyền nhưng hết hạn
        for (const tName of detectedTeachers) {
          const cleanT = cleanTeacherName(tName);
          let teacherRec = (licensesMap && licensesMap[cleanT]) || (currentRecord && cleanTeacherName(currentRecord.teacher) === cleanT ? currentRecord : null);
          if (teacherRec && teacherRec.key) {
            const res = verifyLicense(teacherRec.key, {
              currentTeacher: tName,
              teachers: detectedTeachers,
              currentSchool: currSchool
            });
            if (!res.isValid) {
              if (callback) callback(false, res.licenseInfo, res.reason, {
                currentTeacher: tName,
                teachers: detectedTeachers,
                currentSchool: currSchool,
                status: 'EXPIRED_OR_INVALID',
                savedTeachers: savedTeachers,
                matchedRecord: teacherRec
              });
              return;
            }
          }
        }

        // Chưa kích hoạt cho bất kỳ giáo viên nào trong danh sách
        const otherRecord = currentRecord || Object.values(licensesMap)[0];
        const otherTeacherName = otherRecord ? (otherRecord.teacher || 'tài khoản khác') : '';
        const displayTeachers = savedTeachers.length > 0 ? savedTeachers.join(', ') : otherTeacherName;
        const displayCurrent = detectedTeachers.join(' & ');
        const mismatchReason = savedTeachers.length > 0
          ? `⚠️ Bản quyền đã lưu cấp cho GV: "${displayTeachers}". Sổ điểm này do GV: "${displayCurrent}" phụ trách. Vui lòng kích hoạt bản quyền cho giáo viên phụ trách!`
          : `⚠️ Sổ điểm do GV: "${displayCurrent}" phụ trách chưa được kích hoạt bản quyền.`;

        if (callback) callback(false, null, mismatchReason, {
          currentTeacher: detectedTeachers[0] || currTeacher,
          teachers: detectedTeachers,
          currentSchool: currSchool,
          status: savedTeachers.length > 0 ? 'TEACHER_MISMATCH' : 'UNLICENSED',
          licensedTeacher: otherTeacherName,
          savedTeachers: savedTeachers,
          mismatchRecord: otherRecord
        });
        return;
      }

      // 5. NẾU CHƯA PHÁT HIỆN ĐƯỢC TÊN GIÁO VIÊN (Ví dụ: đang ở trang chủ/dashboard vnEdu, chưa mở sổ điểm)
      // TUYỆT ĐỐI KHÔNG BÁO "ĐÃ KÍCH HOẠT" BỪA BÃI để tránh tài khoản khác hưởng sái!
      const candidateRecord = currentRecord || Object.values(licensesMap)[0];
      const candidateTeacher = candidateRecord ? (candidateRecord.teacher || '') : '';

      const pendingReason = candidateTeacher
        ? `ℹ️ Bản quyền lưu trên máy thuộc về GV: "${candidateTeacher}". Vui lòng mở sổ điểm hoặc xác nhận tài khoản vnEdu để tiếp tục.`
        : 'Chưa xác nhận tài khoản giáo viên sử dụng.';

      if (callback) callback(false, null, pendingReason, {
        currentTeacher: '',
        currentSchool: currSchool || '',
        status: 'PENDING_TEACHER_DETECTION',
        candidateTeacher: candidateTeacher,
        candidateRecord: candidateRecord
      });
    });
  }

  return {
    DEFAULT_SECRET_KEY,
    MASTER_HASHES,
    fnv1aHash,
    cleanTeacherName,
    cleanSchoolName,
    isValidTeacherName,
    parseLicenseKey,
    verifyLicense,
    detectVnEduTeacherAndSchool,
    getStoredRecord,
    getAllStoredRecords,
    saveStoredRecord,
    clearStoredRecord,
    checkCurrentLicense,
    formatDateVN
  };
});
