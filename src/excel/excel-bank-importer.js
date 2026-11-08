/**
 * Excel Comment Bank Importer
 * Đọc file Excel (.xlsx) trong thư mục làm NGÂN HÀNG LỜI NHẬN XÉT và đồng bộ vào dự án.
 * Hỗ trợ định dạng: .xlsx (đọc qua FileReader API trong popup/options),
 * hoặc import qua giao diện kéo thả.
 *
 * CẤU TRÚC SHEET EXCEL NHẬN XÉT:
 *   Cột A: Môn học      (Toán, Tiếng Việt, Khoa học, v.v.)
 *   Cột B: Cấp học      (PRIMARY / SECONDARY / HIGH_SCHOOL hoặc TH / THCS / THPT)
 *   Cột C: Xếp loại     (T / H / C / Đ / CĐ hoặc Tốt / Hoàn thành / Cần cố gắng / Đạt / Chưa đạt)
 *   Cột D: Kỳ đánh giá  (GK1 / CK1 / GK2 / CK2 hoặc để trống = áp dụng tất cả kỳ)
 *   Cột E: Lời nhận xét (nội dung câu nhận xét, tối đa 90 ký tự)
 *   Cột F: Nhóm/Tag     (Tùy chọn - phân nhóm câu nhận xét)
 *
 * File Excel tham chiếu: "File loi nhan xet chuan.xlsx" trong thư mục gốc dự án.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../utils/logger'));
  } else {
    root.VnEduExcelBankImporter = factory(root.VnEduLogger);
  }
})(typeof self !== 'undefined' ? self : this, function (Logger) {
  'use strict';

  // ============================================================
  // CẤU HÌNH NHẬN DIỆN TÊN CỘT (FLEXIBLE HEADER MAPPING)
  // ============================================================
  const HEADER_MAP = {
    subject:   ['môn học', 'môn', 'subject', 'mon hoc', 'mon'],
    level:     ['cấp học', 'cap hoc', 'cấp', 'cap', 'education level', 'level'],
    rating:    ['xếp loại', 'xep loai', 'mức đạt', 'muc dat', 'rating', 'loại', 'loai'],
    period:    ['kỳ đánh giá', 'ky danh gia', 'kỳ', 'ky', 'period', 'đợt', 'dot'],
    comment:   ['lời nhận xét', 'loi nhan xet', 'nhận xét', 'nhan xet', 'câu nhận xét', 'comment', 'nội dung'],
    tag:       ['nhóm', 'nhom', 'tag', 'phân nhóm', 'phan nhom', 'ghi chú', 'ghi chu', 'note']
  };

  // ============================================================
  // CHUẨN HÓA XẾP LOẠI
  // ============================================================
  function normalizeRating(raw) {
    if (!raw) return '';
    const s = String(raw).trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');

    if (s === 't' || s === 'tot' || s.includes('tot') || s.includes('xuat sac')) return 'T';
    if (s === 'h' || s === 'hoan thanh' || s.includes('hoan thanh') || s === 'k' || s === 'kha') return 'H';
    if (s === 'c' || s.includes('can co gang') || s.includes('chua hoan thanh') || s.includes('yeu')) return 'C';
    if (s === 'dd' || s === 'd' || s === 'dat' || s.includes(' dat') || s === 'đạt') return 'Đ';
    if (s.includes('chua dat') || s.includes('khong dat') || s === 'cd' || s === 'cđ') return 'CĐ';
    // Trả về nguyên gốc nếu không nhận ra
    return String(raw).trim().toUpperCase().slice(0, 3);
  }

  // ============================================================
  // CHUẨN HÓA CẤP HỌC
  // ============================================================
  function normalizeLevel(raw) {
    if (!raw) return '';
    const s = String(raw).trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');

    if (s === 'primary' || s === 'th' || s === 'tieu hoc' || s.includes('tieu hoc') || s.includes('1-5') || s.includes('lop 1')) return 'PRIMARY';
    if (s === 'secondary' || s === 'thcs' || s.includes('trung hoc co so') || s.includes('6-9') || s.includes('lop 6')) return 'SECONDARY';
    if (s === 'high_school' || s === 'high school' || s === 'thpt' || s.includes('trung hoc pho thong') || s.includes('10-12') || s.includes('lop 10')) return 'HIGH_SCHOOL';
    return '';
  }

  // ============================================================
  // CHUẨN HÓA KỲ ĐÁNH GIÁ
  // ============================================================
  function normalizePeriod(raw) {
    if (!raw) return '';
    const s = String(raw).trim().toUpperCase()
      .replace(/\s+/g, '').replace(/[–—-]/g, '');

    if (s === 'GK1' || s.includes('GIUAHK1') || s.includes('GIUAHKI1') || s === 'HK1GIUA' || s === 'GHK1') return 'GK1';
    if (s === 'CK1' || s.includes('CUOIHK1') || s.includes('CUOIHKI1') || s === 'HK1CUOI' || s === 'CHK1') return 'CK1';
    if (s === 'GK2' || s.includes('GIUAHK2') || s.includes('GIUAHKI2') || s === 'HK2GIUA' || s === 'GHK2') return 'GK2';
    if (s === 'CK2' || s.includes('CUOIHK2') || s.includes('CUOINAM') || s === 'CANA' || s === 'CN' || s === 'CHK2') return 'CK2';
    return '';
  }

  // ============================================================
  // ĐỌC HEADER TỪ HÀNG ĐẦU TIÊN CỦA SHEET
  // ============================================================
  function detectHeaders(headerRow) {
    const headerIndexMap = {};
    const normalized = headerRow.map(h => String(h || '').toLowerCase().trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
    );

    for (const [key, aliases] of Object.entries(HEADER_MAP)) {
      // Pass 1: exact match
      for (let i = 0; i < normalized.length; i++) {
        if (aliases.some(a => normalized[i] === a)) {
          headerIndexMap[key] = i;
          break;
        }
      }
      // Pass 2: partial match
      if (headerIndexMap[key] === undefined) {
        for (let i = 0; i < normalized.length; i++) {
          if (Object.values(headerIndexMap).includes(i)) continue;
          if (aliases.some(a => normalized[i].includes(a) || a.includes(normalized[i]))) {
            headerIndexMap[key] = i;
            break;
          }
        }
      }
    }
    return headerIndexMap;
  }

  // ============================================================
  // PARSE DỮ LIỆU SHEET 2D (mảng mảng) THÀNH DANH SÁCH NHẬN XÉT
  // ============================================================
  function parseSheetData(rows) {
    if (!Array.isArray(rows) || rows.length < 2) return [];

    const headerRow = rows[0].map(c => String(c === null || c === undefined ? '' : c));
    const headerMap = detectHeaders(headerRow);

    // Nếu không tìm được cột comment thì thử cột thứ 5 (index 4) làm mặc định
    if (headerMap.comment === undefined) {
      // Tìm cột dài nhất (heuristic: cột comment thường dài nhất)
      const colLengths = Array(headerRow.length).fill(0);
      for (let r = 1; r < Math.min(rows.length, 20); r++) {
        const row = rows[r];
        for (let c = 0; c < row.length; c++) {
          colLengths[c] = Math.max(colLengths[c], String(row[c] || '').length);
        }
      }
      const maxLen = Math.max(...colLengths);
      const maxIdx = colLengths.indexOf(maxLen);
      if (maxLen > 10 && maxIdx >= 0) {
        headerMap.comment = maxIdx;
      }
    }

    if (headerMap.comment === undefined) {
      if (Logger) Logger.warn('[ExcelBankImporter] Không tìm được cột lời nhận xét trong sheet Excel.');
      return [];
    }

    const result = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.every(c => c === null || c === undefined || String(c).trim() === '')) continue;

      const comment = String(row[headerMap.comment] === null || row[headerMap.comment] === undefined ? '' : row[headerMap.comment]).trim();
      if (!comment || comment.length < 3) continue;

      const item = {
        subject:  headerMap.subject  !== undefined ? String(row[headerMap.subject]  || '').trim() : '',
        level:    normalizeLevel(headerMap.level  !== undefined ? row[headerMap.level]  : ''),
        rating:   normalizeRating(headerMap.rating !== undefined ? row[headerMap.rating] : ''),
        period:   normalizePeriod(headerMap.period !== undefined ? row[headerMap.period] : ''),
        comment:  comment.length > 100 ? comment.slice(0, 97) + '...' : comment,
        tag:      headerMap.tag !== undefined ? String(row[headerMap.tag] || '').trim() : ''
      };

      result.push(item);
    }

    return result;
  }

  // ============================================================
  // ĐỌC FILE XLSX QUA SheetJS (NHÚNG SẴN HOẶC CDN)
  // ============================================================

  /**
   * Đọc file xlsx từ đối tượng File (FileReader API)
   * @param {File} file - File object từ <input type="file"> hoặc drag-drop
   * @returns {Promise<Array>} - Danh sách nhận xét
   */
  function readXlsxFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error('Không có file để đọc.'));
        return;
      }

      const ext = (file.name || '').toLowerCase().split('.').pop();
      const isExcel = ['xlsx', 'xls', 'ods'].includes(ext);
      const isCsv  = ['csv', 'txt'].includes(ext);

      if (!isExcel && !isCsv) {
        reject(new Error('Chỉ hỗ trợ định dạng .xlsx, .xls hoặc .csv'));
        return;
      }

      if (isCsv) {
        // Đọc CSV trực tiếp
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const text = e.target.result;
            const rows = parseCSVToRows(text);
            const data = parseSheetData(rows);
            resolve(data);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = () => reject(new Error('Không thể đọc file CSV.'));
        reader.readAsText(file, 'UTF-8');
        return;
      }

      // Đọc XLSX: cần SheetJS (XLSX global)
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const XLSX = window.XLSX || (typeof self !== 'undefined' && self.XLSX);
          if (!XLSX) {
            // Nếu chưa có SheetJS, thử load từ CDN rồi thử lại
            loadSheetJS().then(() => {
              try {
                const data_buf = e.target.result;
                const wb = window.XLSX.read(data_buf, { type: 'array' });
                const sheetName = wb.SheetNames[0];
                const ws = wb.Sheets[sheetName];
                const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
                resolve(parseSheetData(rows));
              } catch (err2) {
                reject(new Error('Lỗi đọc file Excel: ' + err2.message));
              }
            }).catch(() => {
              reject(new Error('Chưa cài thư viện SheetJS để đọc .xlsx. Vui lòng dùng định dạng .csv.'));
            });
            return;
          }

          const data_buf = e.target.result;
          const wb = XLSX.read(data_buf, { type: 'array' });
          const sheetName = wb.SheetNames[0];
          const ws = wb.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          resolve(parseSheetData(rows));
        } catch (err) {
          reject(new Error('Lỗi phân tích file Excel: ' + err.message));
        }
      };
      reader.onerror = () => reject(new Error('Không thể đọc file Excel.'));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Lazy-load SheetJS từ CDN nếu chưa có
   */
  function loadSheetJS() {
    return new Promise((resolve, reject) => {
      if (window.XLSX) { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      script.onload = () => { resolve(); };
      script.onerror = () => { reject(new Error('Không tải được SheetJS từ CDN.')); };
      document.head.appendChild(script);
    });
  }

  // ============================================================
  // PARSE CSV ĐƠN GIẢN (FALLBACK)
  // ============================================================
  function parseCSVToRows(text) {
    if (!text) return [];
    // Bỏ BOM UTF-8
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    const lines = text.split(/\r\n|\n|\r/).filter(l => l.trim().length > 0);
    if (lines.length === 0) return [];

    const firstLine = lines[0];
    let delimiter = ',';
    if (firstLine.includes('\t')) delimiter = '\t';
    else if (firstLine.includes(';') && (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length) {
      delimiter = ';';
    }

    return lines.map(line => {
      const row = [];
      let inQuotes = false;
      let field = '';
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = !inQuotes;
        } else if (ch === delimiter && !inQuotes) {
          row.push(field.trim());
          field = '';
        } else {
          field += ch;
        }
      }
      row.push(field.trim());
      return row;
    });
  }

  // ============================================================
  // ĐỒNG BỘ NGÂN HÀNG VÀO OfflineTemplates
  // ============================================================

  /**
   * Nhập danh sách nhận xét từ Excel vào ngân hàng OfflineTemplates
   * @param {Array} items - Mảng items từ parseSheetData
   * @param {Object} offlineTemplates - Module VnEduOfflineTemplates
   * @param {Object} storage - Module VnEduStorage
   * @returns {Promise<{imported: number, skipped: number}>}
   */
  async function syncToOfflineTemplates(items, offlineTemplates, storage) {
    if (!Array.isArray(items) || items.length === 0) {
      return { imported: 0, skipped: 0 };
    }

    let imported = 0;
    let skipped = 0;

    for (const item of items) {
      if (!item.comment || item.comment.length < 3) { skipped++; continue; }

      // Lưu vào storage
      if (storage && typeof storage.saveExcelBankItem === 'function') {
        await storage.saveExcelBankItem(item);
      }

      // Nếu OfflineTemplates có method nhận bank item thì gọi luôn
      if (offlineTemplates && typeof offlineTemplates.addBankComment === 'function') {
        offlineTemplates.addBankComment(item);
        imported++;
      } else if (offlineTemplates && typeof offlineTemplates.replaceCustomComment === 'function') {
        // Fallback: sử dụng replaceCustomComment nếu chưa có addBankComment
        // Tạo một key giả dựa trên nội dung để tránh duplicate
        offlineTemplates.replaceCustomComment('__bank__' + item.comment.slice(0, 20), item.comment, {
          subject: item.subject,
          period: item.period,
          level: item.rating,
          educationLevel: item.level
        });
        imported++;
      } else {
        // Lưu vào storage dự phòng để load sau
        imported++;
      }
    }

    if (Logger) Logger.info(`[ExcelBankImporter] Đã đồng bộ ${imported} câu nhận xét từ Excel vào ngân hàng. Bỏ qua ${skipped} dòng không hợp lệ.`);
    return { imported, skipped };
  }

  // ============================================================
  // LƯU & LẤY NGÂN HÀNG TỪ CHROME STORAGE
  // ============================================================

  const STORAGE_KEY = 'vnedu_excel_comment_bank';
  const MAX_BANK_SIZE = 2000;

  /**
   * Lưu ngân hàng nhận xét vào chrome.storage
   */
  async function saveBankToStorage(items) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        // Giới hạn tối đa 2000 câu để tránh quota overflow
        const toSave = Array.isArray(items) ? items.slice(0, MAX_BANK_SIZE) : [];
        chrome.storage.local.set({ [STORAGE_KEY]: toSave }, () => {
          resolve(toSave.length);
        });
      } else {
        // Fallback: localStorage
        try {
          const toSave = Array.isArray(items) ? items.slice(0, MAX_BANK_SIZE) : [];
          localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
          resolve(toSave.length);
        } catch (e) {
          resolve(0);
        }
      }
    });
  }

  /**
   * Lấy ngân hàng nhận xét đã lưu từ chrome.storage
   */
  async function loadBankFromStorage() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get([STORAGE_KEY], (res) => {
          resolve(Array.isArray(res[STORAGE_KEY]) ? res[STORAGE_KEY] : []);
        });
      } else {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          resolve(raw ? JSON.parse(raw) : []);
        } catch (e) {
          resolve([]);
        }
      }
    });
  }

  /**
   * Xóa toàn bộ ngân hàng đã nhập từ Excel
   */
  async function clearBank() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.remove(STORAGE_KEY, resolve);
      } else {
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
        resolve();
      }
    });
  }

  // ============================================================
  // HÀM CHÍNH: NHẬP FILE VÀ ĐỒNG BỘ
  // ============================================================

  /**
   * Nhập file Excel làm ngân hàng lời nhận xét và đồng bộ vào dự án
   * @param {File} file - File Excel / CSV
   * @param {Object} opts - { offlineTemplates, storage }
   * @returns {Promise<{success: boolean, imported: number, skipped: number, error: string}>}
   */
  async function importFileAsBank(file, opts = {}) {
    try {
      const items = await readXlsxFile(file);

      if (!items || items.length === 0) {
        return { success: false, imported: 0, skipped: 0, error: 'File không có dữ liệu hợp lệ hoặc thiếu cột lời nhận xét.' };
      }

      // 1. Lưu vào storage
      await saveBankToStorage(items);

      // 2. Đồng bộ vào OfflineTemplates
      const { imported, skipped } = await syncToOfflineTemplates(items, opts.offlineTemplates, opts.storage);

      return { success: true, imported, skipped, total: items.length };
    } catch (err) {
      if (Logger) Logger.warn('[ExcelBankImporter] Lỗi nhập file: ' + err.message);
      return { success: false, imported: 0, skipped: 0, error: err.message };
    }
  }

  /**
   * Nạp ngân hàng đã lưu và áp dụng vào OfflineTemplates khi khởi động
   * @param {Object} offlineTemplates - Module VnEduOfflineTemplates
   */
  async function applyStoredBank(offlineTemplates) {
    try {
      const items = await loadBankFromStorage();
      if (!Array.isArray(items) || items.length === 0) return 0;

      let applied = 0;
      if (offlineTemplates && typeof offlineTemplates.addBankComment === 'function') {
        for (const item of items) {
          offlineTemplates.addBankComment(item);
          applied++;
        }
      } else if (offlineTemplates && typeof offlineTemplates.setBankComments === 'function') {
        offlineTemplates.setBankComments(items);
        applied = items.length;
      }

      if (Logger && applied > 0) Logger.info(`[ExcelBankImporter] Đã nạp ${applied} câu nhận xét từ ngân hàng Excel vào OfflineTemplates.`);
      return applied;
    } catch (e) {
      return 0;
    }
  }

  /**
   * Lấy câu nhận xét phù hợp từ ngân hàng Excel (tra cứu offline)
   * @param {Object} opts - { subject, rating, period, educationLevel }
   * @param {number} index - Chỉ số học sinh (tránh lặp)
   * @returns {string|null} - Câu nhận xét hoặc null
   */
  async function getCommentFromBank(opts = {}, index = 0) {
    const items = await loadBankFromStorage();
    if (!items || items.length === 0) return null;

    const { subject, rating, period, educationLevel } = opts;

    // Lọc các câu phù hợp
    let matches = items.filter(item => {
      const subjectOk = !item.subject || !subject || item.subject.toLowerCase() === String(subject).toLowerCase();
      const ratingOk  = !item.rating  || !rating  || item.rating.toUpperCase()  === String(rating).toUpperCase();
      const periodOk  = !item.period  || !period  || item.period.toUpperCase()  === String(period).toUpperCase();
      const levelOk   = !item.level   || !educationLevel || item.level === educationLevel;
      return subjectOk && ratingOk && periodOk && levelOk;
    });

    // Nới lỏng bộ lọc nếu không có kết quả
    if (matches.length === 0) {
      matches = items.filter(item => {
        const ratingOk = !item.rating || !rating || item.rating.toUpperCase() === String(rating).toUpperCase();
        return ratingOk;
      });
    }

    if (matches.length === 0) return null;

    // Luân phiên các câu để tránh lặp lại
    const pickIdx = index % matches.length;
    return matches[pickIdx].comment || null;
  }

  // ============================================================
  // XUẤT API
  // ============================================================
  return {
    readXlsxFile,
    parseSheetData,
    importFileAsBank,
    applyStoredBank,
    getCommentFromBank,
    saveBankToStorage,
    loadBankFromStorage,
    clearBank,
    parseCSVToRows,
    // Hằng số
    STORAGE_KEY,
    MAX_BANK_SIZE
  };
});
