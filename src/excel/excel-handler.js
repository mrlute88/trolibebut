/**
 * Excel / CSV Handler for Student Evaluation Data
 * Compatible with Microsoft Excel UTF-8 with BOM.
 * Matches by studentId or studentName + row context, safely handles duplicates.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../utils/vietnamese-name'),
      require('../utils/logger')
    );
  } else {
    root.VnEduExcelHandler = factory(
      root.VietnameseNameDetector,
      root.VnEduLogger
    );
  }
})(typeof self !== 'undefined' ? self : this, function (VietnameseNameDetector, Logger) {
  // Column aliases mapping
  const COLUMN_MAPPINGS = {
    stt: ['stt', 'no', 'số tt', 'thứ tự'],
    studentId: ['mã học sinh', 'mã hs', 'mahs', 'student id', 'id', 'mã định danh'],
    studentName: ['họ và tên', 'họ tên', 'tên học sinh', 'học sinh', 'full name', 'tên'],
    subject: ['môn học', 'môn', 'subject'],
    achievement: ['mức độ hoàn thành', 'mức độ', 'hoàn thành', 'đánh giá', 'xếp loại', 'level'],
    strength: ['điểm mạnh', 'ưu điểm', 'mạnh', 'strength'],
    weakness: ['nội dung cần rèn luyện', 'cần rèn luyện', 'cố gắng', 'khắc phục', 'weakness'],
    progress: ['mức độ tiến bộ', 'tiến bộ', 'tiến bộ học tập', 'progress'],
    qualities: ['phẩm chất', 'phẩm chất nổi bật', 'qualities'],
    competencies: ['năng lực', 'năng lực cốt lõi', 'competencies'],
    customTeacherNote: ['ghi chú', 'lưu ý', 'note'],
    comment: ['nhận xét', 'nhận xét của gv', 'lời nhận xét', 'comment']
  };

  function parseCSV(text) {
    if (!text || typeof text !== 'string') return [];

    const lines = text.split(/\r\n|\n|\r/).filter(l => l.trim().length > 0);
    if (lines.length === 0) return [];

    // Detect delimiter: comma or semicolon or tab
    const firstLine = lines[0];
    let delimiter = ',';
    if (firstLine.includes('\t')) delimiter = '\t';
    else if (firstLine.includes(';') && (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length) {
      delimiter = ';';
    }

    const rows = [];
    for (const line of lines) {
      const row = [];
      let inQuotes = false;
      let field = '';

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === delimiter && !inQuotes) {
          row.push(field.trim());
          field = '';
        } else {
          field += char;
        }
      }
      row.push(field.trim());
      rows.push(row);
    }

    if (rows.length < 2) return [];

    // Header matching
    const rawHeaders = rows[0].map(h => h.toLowerCase().trim());
    const headerIndexMap = {};

    // Header matching: Pass 1 (Exact match)
    for (const [key, aliases] of Object.entries(COLUMN_MAPPINGS)) {
      for (let colIdx = 0; colIdx < rawHeaders.length; colIdx++) {
        const h = rawHeaders[colIdx];
        if (aliases.some(alias => h === alias)) {
          headerIndexMap[key] = colIdx;
          break;
        }
      }
    }

    // Header matching: Pass 2 (Fuzzy / Partial match for unassigned columns)
    for (const [key, aliases] of Object.entries(COLUMN_MAPPINGS)) {
      if (headerIndexMap[key] !== undefined) continue;

      for (let colIdx = 0; colIdx < rawHeaders.length; colIdx++) {
        // Skip columns already assigned
        if (Object.values(headerIndexMap).includes(colIdx)) continue;

        const h = rawHeaders[colIdx];
        if (key === 'studentName' && (h.includes('mã') || h.includes('id'))) {
          continue; // Do not match 'mã học sinh' as studentName
        }

        if (aliases.some(alias => h.includes(alias))) {
          headerIndexMap[key] = colIdx;
          break;
        }
      }
    }

    const parsedData = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (row.length === 0 || row.every(c => c === '')) continue;

      const studentNameRaw = (headerIndexMap.studentName !== undefined ? row[headerIndexMap.studentName] : '').trim();

      // Skip if this row is a repeated header row (e.g. "Họ và tên", "STT")
      if (VietnameseNameDetector.isHeaderOrLabel(studentNameRaw)) {
        continue;
      }

      const item = {
        stt: headerIndexMap.stt !== undefined ? row[headerIndexMap.stt] : String(r),
        studentId: headerIndexMap.studentId !== undefined ? row[headerIndexMap.studentId] : '',
        studentName: studentNameRaw,
        subject: headerIndexMap.subject !== undefined ? row[headerIndexMap.subject] : '',
        achievement: headerIndexMap.achievement !== undefined ? row[headerIndexMap.achievement] : 'H',
        strength: headerIndexMap.strength !== undefined ? row[headerIndexMap.strength] : '',
        weakness: headerIndexMap.weakness !== undefined ? row[headerIndexMap.weakness] : '',
        progress: headerIndexMap.progress !== undefined ? row[headerIndexMap.progress] : '',
        qualities: headerIndexMap.qualities !== undefined ? row[headerIndexMap.qualities] : '',
        competencies: headerIndexMap.competencies !== undefined ? row[headerIndexMap.competencies] : '',
        customTeacherNote: headerIndexMap.customTeacherNote !== undefined ? row[headerIndexMap.customTeacherNote] : '',
        comment: headerIndexMap.comment !== undefined ? row[headerIndexMap.comment] : ''
      };

      // Normalize achievement level
      const ach = item.achievement.toUpperCase();
      if (ach.includes('TỐT') || ach === 'T') item.achievement = 'T';
      else if (ach.includes('CHƯA') || ach.includes('CỐ GẮNG') || ach === 'C') item.achievement = 'C';
      else item.achievement = 'H';

      parsedData.push(item);
    }

    return parsedData;
  }

  /**
   * Match imported Excel data with detected students on the page
   */
  function matchExcelToStudents(excelRows = [], detectedStudents = []) {
    const matched = [];
    const unmatchedExcel = [];
    const duplicateFlags = [];

    // Check for duplicate names in detected students
    const duplicateCheck = VietnameseNameDetector.detectDuplicates(detectedStudents);

    // Indexed lookup for detected students
    const detectedByName = new Map();
    const detectedById = new Map();

    detectedStudents.forEach((st, idx) => {
      if (st.studentId) detectedById.set(st.studentId.trim(), { student: st, index: idx });
      const normName = (st.studentName || '').toLowerCase().trim();
      if (!detectedByName.has(normName)) {
        detectedByName.set(normName, []);
      }
      detectedByName.get(normName).push({ student: st, index: idx });
    });

    excelRows.forEach((excelRow, eIdx) => {
      let match = null;

      // 1. Priority 1: Match by studentId
      if (excelRow.studentId && detectedById.has(excelRow.studentId.trim())) {
        match = detectedById.get(excelRow.studentId.trim());
      }

      // 2. Priority 2: Match by studentName
      if (!match && excelRow.studentName) {
        const normName = excelRow.studentName.toLowerCase().trim();
        const matches = detectedByName.get(normName) || [];

        if (matches.length === 1) {
          match = matches[0];
        } else if (matches.length > 1) {
          // Ambiguous duplicate names!
          // Try matching by STT / row index if available
          const sttNum = parseInt(excelRow.stt, 10);
          const sttMatch = matches.find(m => (m.index + 1) === sttNum || m.student.index === sttNum);
          if (sttMatch) {
            match = sttMatch;
          } else {
            duplicateFlags.push({
              studentName: excelRow.studentName,
              excelIndex: eIdx,
              candidates: matches.map(m => ({ index: m.index, id: m.student.studentId }))
            });
          }
        }
      }

      // 3. Priority 3: Match by row index / STT if names are close or missing
      if (!match && excelRow.stt) {
        const sttNum = parseInt(excelRow.stt, 10);
        if (!isNaN(sttNum) && sttNum >= 1 && sttNum <= detectedStudents.length) {
          const cand = detectedStudents[sttNum - 1];
          // Double check if name is somewhat compatible
          if (!excelRow.studentName || cand.studentName.toLowerCase().includes(excelRow.studentName.toLowerCase())) {
            match = { student: cand, index: sttNum - 1 };
          }
        }
      }

      if (match) {
        matched.push({
          excelData: excelRow,
          student: match.student,
          studentIndex: match.index
        });
      } else {
        unmatchedExcel.push(excelRow);
      }
    });

    return {
      matched,
      unmatchedExcel,
      duplicateFlags,
      hasDuplicateWarning: duplicateFlags.length > 0 || duplicateCheck.hasDuplicates
    };
  }

  /**
   * Export comments to CSV format with UTF-8 BOM for Excel compatibility
   */
  function exportToCSV(dataRows) {
    const BOM = '\uFEFF';
    const headers = [
      'STT', 'Mã học sinh', 'Họ và tên', 'Môn học',
      'Mức độ hoàn thành', 'Nhận xét', 'Trạng thái điền'
    ];

    const escapeField = (field) => {
      const str = String(field || '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvLines = [headers.map(escapeField).join(',')];

    dataRows.forEach((r, idx) => {
      const line = [
        r.stt || String(idx + 1),
        r.studentId || '',
        r.studentName || '',
        r.subject || '',
        r.achievement || 'H',
        r.comment || '',
        r.status || 'Chưa điền'
      ].map(escapeField).join(',');
      csvLines.push(line);
    });

    return BOM + csvLines.join('\r\n');
  }

  return {
    parseCSV,
    matchExcelToStudents,
    exportToCSV
  };
});
