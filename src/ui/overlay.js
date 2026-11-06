/**
 * Overlay UI Component for vnEdu (Minimalist Edition with Level Selector)
 * - Nút "Điền Nhận Xét" tối giản, tự động quét và điền 1-Click
 * - Tích hợp bộ chọn Cấp học đang dạy: TH (Tiểu học: Lớp 1-5), THCS (Lớp 6-9), THPT (Lớp 10-12)
 * - Tự động tải ngân hàng nhận xét sư phạm chuẩn xác cho đúng từng cấp học, chống lẫn lộn
 * - Tuyệt đối không chứa thông tin tác giả, hotline hay thông tin cá nhân
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VnEduOverlay = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  let hostContainer = null;
  let shadowRoot = null;
  let activeDeps = null;
  let isLicensed = false;
  let currentLicenseRecord = null;
  let currentLicenseDetails = null;
  let isFillingActive = false;
  let currentAskResolve = null;
  let resetIdleTimer = () => {};

  function sleepInterruptible(ms) {
    return new Promise((resolve) => {
      const step = 40;
      let elapsed = 0;
      const interval = setInterval(() => {
        elapsed += step;
        if (!isFillingActive || elapsed >= ms) {
          clearInterval(interval);
          resolve(!isFillingActive);
        }
      }, step);
    });
  }

  function stopAllFilling(reason = 'Đã dừng điền nhận xét theo yêu cầu.') {
    isFillingActive = false;
    if (activeDeps?.FillEngine && typeof activeDeps.FillEngine.cancelFill === 'function') {
      try { activeDeps.FillEngine.cancelFill(); } catch (e) {}
    }

    if (typeof currentAskResolve === 'function') {
      currentAskResolve(false);
      currentAskResolve = null;
    }

    if (shadowRoot) {
      const confirmModal = shadowRoot.getElementById('vnedu-confirm-save-modal');
      if (confirmModal) confirmModal.style.display = 'none';

      const btnMain = shadowRoot.getElementById('vnedu-btn-main');
      if (btnMain) btnMain.classList.remove('disabled');
      updateMainButtonUI();
    }

    showToast(`🛑 ${reason}`, null, false, false);
    setTimeout(hideToast, 3500);
  }

  // Cấp học hiện tại: 'PRIMARY' (TH), 'SECONDARY' (THCS), 'HIGH_SCHOOL' (THPT)
  let currentEducationLevel = (function() {
    try {
      return localStorage.getItem('vnedu_selected_education_level') || 'PRIMARY';
    } catch (e) {
      return 'PRIMARY';
    }
  })();

  // Đợt đánh giá hiện tại: 'GK1' (Giữa HK1), 'CK1' (Cuối HK1), 'GK2' (Giữa HK2), 'CK2' (Cuối năm)
  let currentPeriod = (function() {
    try {
      return localStorage.getItem('vnedu_selected_period') || 'GK1';
    } catch (e) {
      return 'GK1';
    }
  })();

  function getLicenseManager() {
    return (typeof window !== 'undefined' && window.VnEduLicenseManager) || (activeDeps && activeDeps.LicenseManager);
  }

  let lastCheckLicenseTime = 0;
  let isCheckingLicense = false;

  function checkLicenseStatus(callback) {
    const LM = getLicenseManager();
    if (LM) {
      const now = Date.now();
      if (isCheckingLicense && now - lastCheckLicenseTime < 400) {
        if (callback) callback(isLicensed, currentLicenseRecord, '', currentLicenseDetails);
        return;
      }
      isCheckingLicense = true;
      lastCheckLicenseTime = now;

      LM.checkCurrentLicense({}, (licensed, record, reason, details) => {
        isCheckingLicense = false;
        isLicensed = licensed;
        currentLicenseRecord = record;
        currentLicenseDetails = details || null;
        updateMainButtonUI();
        if (callback) callback(isLicensed, record, reason, details);
      });
      return;
    }

    isLicensed = false;
    currentLicenseRecord = null;
    currentLicenseDetails = null;
    updateMainButtonUI();
    if (callback) callback(isLicensed, null, '', null);
  }

  function saveLicenseKey(key, teacher, school, callback) {
    const LM = getLicenseManager();
    if (LM) {
      const parsed = LM.parseLicenseKey(key);
      const targetTeacher = parsed ? (parsed.isMaster ? 'Quản trị viên' : parsed.teacher) : (teacher || '');
      const rec = {
        key: key.trim(),
        teacher: targetTeacher,
        school: parsed ? parsed.school : (school || ''),
        expiryDate: parsed ? parsed.expiryDate : '0',
        plan: parsed ? parsed.plan : 'custom',
        isMaster: parsed ? parsed.isMaster : false,
        activatedAt: new Date().toISOString()
      };
      LM.saveStoredRecord(rec, () => {
        checkLicenseStatus((licensed, verifiedRec, reason, details) => {
          if (callback) callback(licensed, verifiedRec, reason, details);
        });
      });
      return;
    }
    isLicensed = true;
    updateMainButtonUI();
    if (callback) callback(true);
  }

  function clearLicenseKey(callback) {
    const LM = getLicenseManager();
    if (LM) {
      const currentTeacher = currentLicenseDetails?.currentTeacher || currentLicenseRecord?.teacher || '';
      LM.clearStoredRecord(currentTeacher, () => {
        checkLicenseStatus(() => {
          if (callback) callback();
        });
      });
      return;
    }
    isLicensed = false;
    currentLicenseRecord = null;
    currentLicenseDetails = null;
    updateMainButtonUI();
    if (callback) callback();
  }

  function getRulesModule(deps) {
    return (deps && deps.Circular27Rules) || (typeof window !== 'undefined' && (window.VnEduAssessmentRules || window.VnEduCircular27Rules)) || null;
  }

  function updateLevelSelectorUI() {
    if (!shadowRoot) return;
    const btnTH = shadowRoot.getElementById('btn-lvl-primary');
    const btnTHCS = shadowRoot.getElementById('btn-lvl-secondary');
    const btnTHPT = shadowRoot.getElementById('btn-lvl-high');

    if (btnTH) btnTH.classList.toggle('active', currentEducationLevel === 'PRIMARY');
    if (btnTHCS) btnTHCS.classList.toggle('active', currentEducationLevel === 'SECONDARY');
    if (btnTHPT) btnTHPT.classList.toggle('active', currentEducationLevel === 'HIGH_SCHOOL');
  }

  function setEducationLevel(newLevel, showFeedback = true) {
    if (!['PRIMARY', 'SECONDARY', 'HIGH_SCHOOL'].includes(newLevel)) return;
    currentEducationLevel = newLevel;
    try {
      localStorage.setItem('vnedu_selected_education_level', newLevel);
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ vnedu_selected_education_level: newLevel });
      }
    } catch (e) {}

    updateLevelSelectorUI();
    updateMainButtonUI();

    if (showFeedback) {
      let desc = 'Tiểu học (Lớp 1 - 5) • Thông tư 27';
      if (newLevel === 'SECONDARY') desc = 'THCS (Lớp 6 - 9) • Thông tư 22';
      if (newLevel === 'HIGH_SCHOOL') desc = 'THPT (Lớp 10 - 12) • Thông tư 22';
      showToast(`✓ Đã chọn: Cấp ${desc}`, null, false, false);
      setTimeout(hideToast, 2400);
    }
  }

  function updatePeriodSelectorUI() {
    if (!shadowRoot) return;
    const btnGK1 = shadowRoot.getElementById('btn-prd-gk1');
    const btnCK1 = shadowRoot.getElementById('btn-prd-ck1');
    const btnGK2 = shadowRoot.getElementById('btn-prd-gk2');
    const btnCK2 = shadowRoot.getElementById('btn-prd-ck2');

    if (btnGK1) btnGK1.classList.toggle('active', currentPeriod === 'GK1');
    if (btnCK1) btnCK1.classList.toggle('active', currentPeriod === 'CK1');
    if (btnGK2) btnGK2.classList.toggle('active', currentPeriod === 'GK2');
    if (btnCK2) btnCK2.classList.toggle('active', currentPeriod === 'CK2');
  }

  function setPeriod(newPeriod, showFeedback = true) {
    if (!['GK1', 'CK1', 'GK2', 'CK2'].includes(newPeriod)) return;
    currentPeriod = newPeriod;
    try {
      localStorage.setItem('vnedu_selected_period', newPeriod);
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ vnedu_selected_period: newPeriod });
      }
    } catch (e) {}

    updatePeriodSelectorUI();
    updateMainButtonUI();

    if (showFeedback) {
      const names = {
        GK1: 'Giữa học kì 1 (GK1)',
        CK1: 'Cuối học kì 1 (CK1)',
        GK2: 'Giữa học kì 2 (GK2)',
        CK2: 'Cuối năm / Cả năm (CK2)'
      };
      showToast(`✓ Đã chọn đợt: ${names[newPeriod] || newPeriod}`, null, false, false);
      setTimeout(hideToast, 2200);
    }
  }

  function updateMainButtonUI() {
    if (!shadowRoot) return;
    const btnMain = shadowRoot.getElementById('vnedu-btn-main');
    const btnKey = shadowRoot.getElementById('vnedu-btn-key');
    const iconSpan = shadowRoot.getElementById('btn-main-icon');
    const textSpan = shadowRoot.getElementById('btn-main-text');
    const mascotSpeech = shadowRoot.getElementById('vnedu-mascot-speech');

    if (!btnMain || !iconSpan || !textSpan) return;

    if (!isLicensed) {
      btnMain.className = 'vnedu-btn-pill-3d vnedu-btn-unlicensed';
      const teacher = currentLicenseDetails?.currentTeacher;
      if (teacher) {
        const isGrade = currentLicenseDetails?.isGradebook;
        btnMain.title = isGrade
          ? `Sổ điểm do GV: ${teacher} phụ trách chưa kích hoạt bản quyền. Bấm để kích hoạt.`
          : `Tài khoản GV: ${teacher} chưa kích hoạt bản quyền. Bấm để kích hoạt.`;
        if (mascotSpeech) mascotSpeech.textContent = `Thầy/Cô ${teacher.split(' ').slice(-1)[0]} bấm kích hoạt nhé! 🔑`;
      } else {
        btnMain.title = 'Bấm để nhập mã kích hoạt bản quyền sử dụng';
        if (mascotSpeech) mascotSpeech.textContent = 'Bấm kích hoạt bản quyền nhé! 🔑';
      }
      iconSpan.textContent = '🔑';
      textSpan.textContent = 'Kích hoạt bản quyền';
      if (btnKey) btnKey.style.display = 'none';
    } else {
      btnMain.className = 'vnedu-btn-pill-3d';
      const teacher = currentLicenseRecord?.teacher || currentLicenseDetails?.currentTeacher || '';

      // 1. Kiểm tra xem có đang mở Bảng tổng hợp Năng lực - Phẩm chất hay không
      let isSummaryGrid = false;
      try {
        const gridAdapter = window.VnEduGridAdapter ? new window.VnEduGridAdapter() : null;
        if (gridAdapter && typeof gridAdapter.isCompetencySummaryGrid === 'function') {
          isSummaryGrid = gridAdapter.isCompetencySummaryGrid();
        }
      } catch (e) {}

      // 2. Kiểm tra xem có đang ở trong màn hình Sổ điểm / Sổ nhận xét hay không
      let isAssessmentPage = false;
      try {
        const pageDetector = (activeDeps && activeDeps.PageDetector) || (typeof window !== 'undefined' && window.VnEduPageDetector);
        if (pageDetector && typeof pageDetector.detectCurrentPage === 'function') {
          const pStatus = pageDetector.detectCurrentPage();
          if (pStatus && pStatus.isAssessmentPage) {
            isAssessmentPage = true;
          }
        }
        if (!isAssessmentPage) {
          isAssessmentPage = Boolean(document.querySelector('.x-grid3-row, tbody tr.x-grid-row, .x-grid3-body'));
        }
      } catch (e) {}

      if (isSummaryGrid) {
        btnMain.title = 'Tự động đọc điểm số các môn bên trái và suy luận xếp loại T/Đ/C cho Năng lực - Phẩm chất bên phải';
        iconSpan.textContent = '⚡';
        textSpan.textContent = 'Điền NL - PC (T, Đ, C)';
        if (mascotSpeech) {
          mascotSpeech.textContent = 'Em đã nhận diện Bảng tổng hợp NL-PC! Bấm để điền nhé ✨';
        }
      } else if (isAssessmentPage) {
        btnMain.title = teacher
          ? `Trợ lý nhận xét (Đã kích hoạt cho GV: ${teacher})`
          : 'Tự động nhận diện Khối lớp, Môn học và Kỳ kiểm tra trên vnEdu để điền nhận xét';
        iconSpan.textContent = '⚡';
        textSpan.textContent = 'Điền Nhận Xét';
        if (mascotSpeech) {
          const shortName = teacher ? teacher.split(' ').slice(-1)[0] : '';
          mascotSpeech.textContent = shortName ? `Chào Thầy/Cô ${shortName}! Sẵn sàng ✨` : 'Em sẵn sàng điền nhận xét! ✨';
        }
      } else {
        // 3. MÀN HÌNH BÀN LÀM VIỆC (DESKTOP) HOẶC NGOÀI SỔ ĐIỂM
        const shortName = teacher ? teacher.split(' ').slice(-1)[0] : '';
        btnMain.title = teacher
          ? `Tài khoản GV: ${teacher} (Bản quyền đã kích hoạt). Vui lòng mở sổ điểm để điền nhận xét.`
          : 'Bản quyền đã kích hoạt. Vui lòng mở sổ điểm để điền nhận xét.';
        iconSpan.textContent = '👋';
        textSpan.textContent = teacher ? `Xin chào ${teacher}` : 'Xin chào Thầy/Cô';
        if (mascotSpeech) {
          mascotSpeech.textContent = shortName
            ? `Em chào Thầy/Cô ${shortName}! Mở sổ điểm để em điền nhé! ✨`
            : 'Em chào Thầy/Cô! Mở sổ điểm để em điền nhé! ✨';
        }
      }
      if (btnKey) btnKey.style.display = 'inline-flex';
    }
  }

  function showToast(message, progressPercent = null, isError = false, showCancel = false) {
    if (!shadowRoot) return;
    const toast = shadowRoot.getElementById('vnedu-status-toast');
    const msgEl = shadowRoot.getElementById('toast-msg');
    const pBarBg = shadowRoot.getElementById('toast-progress-bar-bg');
    const pBarFill = shadowRoot.getElementById('toast-progress-bar-fill');
    const cancelBtn = shadowRoot.getElementById('toast-cancel-btn');
    const shellEl = shadowRoot.getElementById('vnedu-minimal-container');

    if (!toast || !msgEl) return;

    if (shellEl) shellEl.classList.add('has-active-toast');

    msgEl.textContent = message;
    msgEl.style.color = isError ? '#FCA5A5' : '#F8FAFC';

    if (progressPercent !== null && progressPercent >= 0) {
      if (pBarBg) pBarBg.style.display = 'block';
      if (pBarFill) pBarFill.style.width = `${Math.min(100, Math.max(0, progressPercent))}%`;
    } else {
      if (pBarBg) pBarBg.style.display = 'none';
    }

    if (cancelBtn) {
      cancelBtn.style.display = showCancel ? 'inline-block' : 'none';
    }

    toast.style.display = 'flex';
    if (typeof resetIdleTimer === 'function') resetIdleTimer();
  }

  function hideToast() {
    if (!shadowRoot) return;
    const toast = shadowRoot.getElementById('vnedu-status-toast');
    const shellEl = shadowRoot.getElementById('vnedu-minimal-container');
    if (shellEl) shellEl.classList.remove('has-active-toast');
    if (toast) toast.style.display = 'none';
    if (typeof resetIdleTimer === 'function') resetIdleTimer();
  }

  /**
   * Hiển thị hộp thoại hỏi giáo viên xác nhận sau khi điền xong một học sinh:
   * - Dòng 1: Tự động đếm ngược 3s tự động Lưu và chuyển sang học sinh tiếp theo (hoặc bấm ngay).
   * - Dòng 2: Lưu và dừng lại ngay lập tức.
   * - Dòng 3: Không lưu (Dừng lại).
   */
  function askTeacherToSave(studentName, currentIndex, totalStudents) {
    return new Promise((resolve) => {
      currentAskResolve = resolve;

      if (!shadowRoot) {
        const ok = confirm(`✓ Đã điền xong nhận xét phẩm chất - năng lực cho học sinh: ${studentName} (${currentIndex}/${totalStudents}).\n\n- Bấm OK để: LƯU VÀ TIẾP TỤC sang học sinh tiếp theo.\n- Bấm Cancel để: DỪNG LẠI.`);
        currentAskResolve = null;
        resolve(ok ? 'SAVE_AND_CONTINUE' : 'CANCEL');
        return;
      }

      const modal = shadowRoot.getElementById('vnedu-confirm-save-modal');
      const badgeEl = shadowRoot.getElementById('confirm-student-info');
      const countdownNumEl = shadowRoot.getElementById('confirm-countdown-num');
      const btnContinue = shadowRoot.getElementById('btn-confirm-save-continue') || shadowRoot.getElementById('btn-confirm-save-yes');
      const btnSaveExit = shadowRoot.getElementById('btn-confirm-save-exit');
      const btnCancel = shadowRoot.getElementById('btn-confirm-cancel') || shadowRoot.getElementById('btn-confirm-save-no');
      const btnClose = shadowRoot.getElementById('btn-close-confirm-save');

      if (!modal || !btnContinue) {
        const ok = confirm(`✓ Đã điền xong nhận xét phẩm chất - năng lực cho học sinh: ${studentName} (${currentIndex}/${totalStudents}).\n\n- Bấm OK để: LƯU VÀ TIẾP TỤC sang học sinh tiếp theo.\n- Bấm Cancel để: DỪNG LẠI.`);
        currentAskResolve = null;
        resolve(ok ? 'SAVE_AND_CONTINUE' : 'CANCEL');
        return;
      }

      if (badgeEl) {
        badgeEl.innerHTML = `👤 Học sinh: <b>${studentName}</b> <span class="badge-idx">STT: ${currentIndex}/${totalStudents}</span>`;
      }

      let secondsLeft = 3;
      let countdownTimer = null;
      let finished = false;

      function updateCountdownUI() {
        if (countdownNumEl) {
          countdownNumEl.textContent = `${secondsLeft}`;
        }
        if (btnContinue) {
          btnContinue.innerHTML = `✓ Tự động lưu &amp; chuyển tiếp <span class="countdown-badge">(${secondsLeft}s)</span> <span class="kbd-hint">[Enter]</span>`;
        }
      }

      function cleanup() {
        if (finished) return;
        finished = true;
        if (countdownTimer) {
          clearInterval(countdownTimer);
          countdownTimer = null;
        }
        currentAskResolve = null;
        modal.style.display = 'none';
        btnContinue.removeEventListener('click', onSaveContinue);
        btnSaveExit?.removeEventListener('click', onSaveExit);
        btnCancel?.removeEventListener('click', onCancel);
        btnClose?.removeEventListener('click', onCancel);
        modal.removeEventListener('click', onBackdrop);
        window.removeEventListener('keydown', onKey, true);
      }

      function onSaveContinue(e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        cleanup();
        resolve('SAVE_AND_CONTINUE');
      }

      function onSaveExit(e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        cleanup();
        resolve('SAVE_AND_EXIT');
      }

      function onCancel(e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        cleanup();
        resolve('CANCEL');
      }

      function onBackdrop(e) {
        if (e.target === modal) {
          onCancel(e);
        }
      }

      function onKey(e) {
        if (modal.style.display === 'none') return;
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey) {
            onSaveExit(e);
          } else {
            onSaveContinue(e);
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onCancel(e);
        }
      }

      updateCountdownUI();
      modal.style.display = 'flex';
      setTimeout(() => btnContinue.focus(), 60);

      // Tự động đếm ngược 3 giây để tự động lưu và chuyển sang học sinh tiếp theo
      countdownTimer = setInterval(() => {
        if (!isFillingActive) {
          cleanup();
          resolve('CANCEL');
          return;
        }
        secondsLeft--;
        if (secondsLeft > 0) {
          updateCountdownUI();
        } else {
          // Hết 3 giây: Tự động lưu và tiếp tục sang học sinh tiếp theo!
          onSaveContinue();
        }
      }, 1000);

      btnContinue.addEventListener('click', onSaveContinue);
      btnSaveExit?.addEventListener('click', onSaveExit);
      btnCancel?.addEventListener('click', onCancel);
      btnClose?.addEventListener('click', onCancel);
      modal.addEventListener('click', onBackdrop);
      window.addEventListener('keydown', onKey, true);
    });
  }

  function openLicenseModal(passedDetails = null) {
    if (!shadowRoot) return;
    const modal = shadowRoot.getElementById('vnedu-license-modal');
    const errorEl = shadowRoot.getElementById('vnedu-key-error');
    const inputEl = shadowRoot.getElementById('vnedu-key-input');
    const activeInfo = shadowRoot.getElementById('license-active-info');
    const accountBadge = shadowRoot.getElementById('vnedu-account-badge');
    const clearRow = shadowRoot.getElementById('license-clear-row');

    if (errorEl) errorEl.textContent = '';
    if (inputEl) inputEl.value = '';

    const LM = getLicenseManager();
    const detected = LM && LM.detectVnEduTeacherAndSchool ? LM.detectVnEduTeacherAndSchool() : { teacher: '', teachers: [], accountTeacher: '', school: '', schools: [] };
    const details = passedDetails || currentLicenseDetails;
    const currentTeacher = details?.currentTeacher || detected.teacher;
    const accountTeacher = details?.accountTeacher || detected.accountTeacher || currentTeacher;
    const currentSchool = details?.currentSchool || detected.school;
    const allTeachers = details?.teachers || detected.teachers || (currentTeacher ? [currentTeacher] : []);

    // 1. Hiển thị thông tin tài khoản vnEdu hiện tại (tài khoản đăng nhập hệ thống)
    if (accountBadge) {
      if (accountTeacher) {
        accountBadge.style.display = 'block';
        const displayTeacher = accountTeacher.replace(/^(?:gv\.?|thầy|cô)\s*/i, '').trim();
        accountBadge.innerHTML = `👤 Tài khoản vnEdu: <b>GV ${displayTeacher}</b>`;
      } else {
        accountBadge.style.display = 'block';
        accountBadge.innerHTML = `👤 Tài khoản vnEdu: <i>(Chưa xác định)</i>`;
      }
    }

    // 2. Hiển thị trạng thái bản quyền
    if (activeInfo) {
      if (isLicensed && currentLicenseRecord) {
        const exp = currentLicenseRecord.expiryDate && currentLicenseRecord.expiryDate !== '0'
          ? (LM?.formatDateVN ? LM.formatDateVN(currentLicenseRecord.expiryDate) : currentLicenseRecord.expiryDate)
          : 'Vĩnh viễn (Không thời hạn)';

        const normCurrent = LM?.cleanTeacherName ? LM.cleanTeacherName(currentLicenseRecord.teacher) : '';
        const otherTeachers = (details?.savedTeachers || []).filter(t => {
          const normT = LM?.cleanTeacherName ? LM.cleanTeacherName(t) : '';
          return normT && normT !== normCurrent;
        });

        const otherTeachersHtml = otherTeachers.length > 0
          ? `<div style="margin-top: 6px; padding-top: 5px; border-top: 1px dashed rgba(16, 185, 129, 0.35); font-size: 11px; color: #475569;">
               👥 <i>Máy tính này cũng đã lưu bản quyền của: <b>${otherTeachers.map(t => 'GV ' + t.replace(/^(?:gv\.?|thầy|cô)\s*/i, '')).join(', ')}</b></i>
             </div>`
          : '';

        activeInfo.className = 'modal-status-badge status-active';
        activeInfo.style.display = 'block';
        activeInfo.innerHTML = `
          ✓ <b>Đã kích hoạt bản quyền</b><br>
          • Giáo viên: <b>${currentLicenseRecord.teacher}</b><br>
          • Hạn dùng: <b>${exp}</b>
          ${otherTeachersHtml}
        `;
        if (clearRow) clearRow.style.display = 'block';
      } else if (details && details.status === 'TEACHER_MISMATCH') {
        activeInfo.className = 'modal-status-badge status-mismatch';
        activeInfo.style.display = 'block';

        const savedList = details.savedTeachers?.length > 0
          ? details.savedTeachers.map(t => 'GV ' + t.replace(/^(?:gv\.?|thầy|cô)\s*/i, '')).join(', ')
          : (details.licensedTeacher ? ('GV ' + details.licensedTeacher.replace(/^(?:gv\.?|thầy|cô)\s*/i, '')) : 'giáo viên khác');

        const roleLabel = details.isGradebook ? 'Giáo viên phụ trách sổ điểm:' : 'Tài khoản giáo viên:';

        activeInfo.innerHTML = `
          ⛔ <b>SỔ ĐIỂM CHƯA KÍCH HOẠT BẢN QUYỀN</b><br>
          • ${roleLabel} <b>GV ${currentTeacher}</b><br>
          • Máy tính đã lưu bản quyền của: <b>${savedList}</b><br>
          <div style="margin-top: 6px; padding: 6px 8px; background: rgba(59, 130, 246, 0.08); border-radius: 6px; font-size: 11.5px; line-height: 1.45; color: #1e3a8a;">
            💡 <i>Máy tính này hỗ trợ nhiều giáo viên dùng chung. Thầy/Cô chỉ cần dán mã bản quyền của <b>GV ${currentTeacher}</b> vào ô bên dưới và bấm <b>Kích hoạt</b>. Tiện ích sẽ ghi nhớ mà không làm mất key của các giáo viên khác!</i>
          </div>
        `;
        if (clearRow) clearRow.style.display = 'none';
      } else {
        if (currentTeacher) {
          activeInfo.className = 'modal-status-badge status-warning';
          activeInfo.style.display = 'block';
          activeInfo.innerHTML = `
            ⚠️ <b>Tài khoản GV ${currentTeacher} chưa được kích hoạt</b><br>
            <span style="font-size: 11.5px; opacity: 0.95;">Vui lòng dán mã bản quyền được cấp riêng cho Thầy/Cô để sử dụng.</span>
          `;
        } else {
          activeInfo.className = 'modal-status-badge status-warning';
          activeInfo.style.display = 'block';
          activeInfo.innerHTML = `
            🔒 <b>Chưa kích hoạt bản quyền</b><br>
            <span style="font-size: 11.5px; opacity: 0.95;">Vui lòng mở sổ điểm hoặc dán mã bản quyền để kích hoạt.</span>
          `;
        }
        if (clearRow) clearRow.style.display = 'none';
      }
    }

    if (modal) {
      modal.style.display = 'flex';
      setTimeout(() => inputEl?.focus(), 100);
      if (typeof resetIdleTimer === 'function') resetIdleTimer();
    }
  }

  function closeLicenseModal() {
    if (!shadowRoot) return;
    const modal = shadowRoot.getElementById('vnedu-license-modal');
    if (modal) modal.style.display = 'none';
    if (typeof resetIdleTimer === 'function') resetIdleTimer();
  }

  /**
   * Tự động quét trang, bóc tách dữ liệu, sinh nhận xét theo đúng Cấp học và điền vào bảng vnEdu
   */
  async function handleQuickFill(deps) {
    if (!isLicensed) {
      openLicenseModal();
      return;
    }

    if (isFillingActive) {
      return;
    }

    isFillingActive = true;
    const btnMain = shadowRoot.getElementById('vnedu-btn-main');
    const textSpan = shadowRoot.getElementById('btn-main-text');
    const iconSpan = shadowRoot.getElementById('btn-main-icon');

    if (btnMain) btnMain.classList.add('disabled');
    if (iconSpan) iconSpan.textContent = '⏳';
    if (textSpan) textSpan.textContent = 'Đang nhận diện...';

    showToast('🔍 Đang tự động nhận diện sổ điểm vnEdu...', 5, false, false);

    try {
      // 1. Quét cấu trúc DOM trang hiện tại
      let scanReport = null;
      if (deps.DOMScanner && typeof deps.DOMScanner.scan === 'function') {
        scanReport = await deps.DOMScanner.scan();
      } else if (deps.DOMScanner && typeof deps.DOMScanner.scanPage === 'function') {
        scanReport = await deps.DOMScanner.scanPage();
      }

      // KIỂM TRA CHẶT CHẼ: CHỈ ĐIỀN VÀO NHỮNG MỤC ĐÃ ĐƯỢC THIẾT LẬP SẴN
      // (Sổ nhận xét, Sổ theo dõi & đánh giá môn học, Đánh giá Phẩm chất - Năng lực của học sinh)
      // TUYỆT ĐỐI KHÔNG ĐƯỢC PHÉP ĐIỀN VÀO KẾ HOẠCH DẠY HỌC, THỜI KHÓA BIỂU, V.V.
      if (!scanReport || !scanReport.canOperate || !scanReport.isAssessmentPage) {
        isFillingActive = false;
        if (btnMain) btnMain.classList.remove('disabled');
        updateMainButtonUI();
        const msg = (scanReport && scanReport.pageMessage) ||
          '⚠️ Trang hiện tại không phải là Sổ nhận xét hay Đánh giá học sinh.\n\nTiện ích chỉ được phép điền vào những mục đã thiết lập sẵn:\n1. Sổ theo dõi và đánh giá học sinh / Sổ đánh giá môn học (đánh giá thường xuyên, định kỳ)\n2. Đánh giá Phẩm chất - Năng lực của học sinh (đánh giá định kỳ, ghi học bạ)\n\nNgoài ra tuyệt đối không nhập vào Kế hoạch dạy học hay các nội dung khác.';
        showToast(msg, null, true, false);
        setTimeout(hideToast, 6500);
        return;
      }

      if (!scanReport.students || scanReport.students.length === 0) {
        isFillingActive = false;
        if (btnMain) btnMain.classList.remove('disabled');
        updateMainButtonUI();
        showToast('⚠️ Không tìm thấy danh sách học sinh trên sổ nhận xét vnEdu hiện tại.\nThầy/Cô vui lòng mở đúng trang Sổ đánh giá môn học hoặc Phẩm chất - Năng lực.', null, true, false);
        setTimeout(hideToast, 4500);
        return;
      }

      // KIỂM TRA CHUYÊN BIỆT: BẢNG TỔNG HỢP ĐÁNH GIÁ GIÁO DỤC / NĂNG LỰC - PHẨM CHẤT
      const summaryAdapter = scanReport?.adapter || (deps.DOMScanner?.getAdapter ? deps.DOMScanner.getAdapter() : null) || (window.VnEduGridAdapter ? new window.VnEduGridAdapter() : null);
      if (summaryAdapter && typeof summaryAdapter.isCompetencySummaryGrid === 'function' && summaryAdapter.isCompetencySummaryGrid()) {
        showToast('🚀 Đang quét các cột môn học và chuẩn bị suy luận Năng lực - Phẩm chất...', 10, false, true);

        const result = await summaryAdapter.fillSummaryGridCompetencies({
          onProgress: ({ currentIndex, totalStudents, studentName }) => {
            const pct = Math.round((currentIndex / totalStudents) * 100);
            showToast(`⚡ Đang suy luận & điền NL-PC: ${studentName} (${currentIndex}/${totalStudents})...`, pct, false, true);
          },
          shouldCancel: () => !isFillingActive
        });

        isFillingActive = false;
        if (btnMain) btnMain.classList.remove('disabled');
        updateMainButtonUI();

        if (result && result.success) {
          const isStoreOk = result.storeBridge && result.storeBridge.success && (result.storeBridge.modifiedCount > 0 || result.storeBridge.updatedRows > 0);
          const modNote = isStoreOk
            ? `\n✓ Đã đồng bộ ${result.storeBridge.modifiedCount || result.storeBridge.updatedRows} bản ghi vào ExtJS Store của vnEdu.`
            : '';
          const skipNote = result.skipped > 0
            ? `\nℹ️ Bỏ qua ${result.skipped} học sinh chưa có đầy đủ điểm/xếp loại môn học.`
            : '';

          if (result.count === 0 && result.skipped > 0) {
            showToast(`⚠️ Không có học sinh nào được điền do toàn bộ ${result.skipped} học sinh chưa có đầy đủ điểm hoặc xếp loại các môn học.\nThầy/Cô vui lòng nhập đủ điểm/xếp loại môn học trước khi suy luận.`, null, true, false);
            setTimeout(hideToast, 6500);
          } else {
            showToast(`✓ Đã tự động suy luận & điền xong NL-PC cho ${result.count}/${result.total} học sinh!${skipNote}${modNote}\n🔒 Thầy/Cô bấm nút "Lưu" (hoặc biểu tượng đĩa mềm) trên vnEdu để hoàn tất.`, null, false, false);
            setTimeout(hideToast, 9500);
          }
        } else {
          showToast(`⚠️ ${result?.reason || 'Có lỗi khi phân tích dữ liệu trên bảng.'}`, null, true, false);
          setTimeout(hideToast, 5000);
        }
        return;
      }

      if (!scanReport.mapping || scanReport.mapping.length === 0) {
        isFillingActive = false;
        if (btnMain) btnMain.classList.remove('disabled');
        updateMainButtonUI();
        showToast('⚠️ Đã tìm thấy học sinh nhưng chưa xác định được cột ô nhận xét.\nVui lòng kiểm tra lại cấu trúc bảng vnEdu.', null, true, false);
        setTimeout(hideToast, 4500);
        return;
      }

      // 2. Phân tích cột qua adapter
      const adapter = scanReport.adapter || (deps.DOMScanner?.getAdapter ? deps.DOMScanner.getAdapter() : null);
      if (adapter && typeof adapter._analyzeHeaderColumns === 'function') {
        try { adapter._analyzeHeaderColumns(); } catch (e) {}
      }

      // 3. TỰ ĐỘNG NHẬN DIỆN 100% THEO TRANG vnEdu GIÁO VIÊN ĐANG MỞ:
      const c27 = getRulesModule(deps);

      // A. Nhận diện Khối lớp (Grade) và Tên lớp (Class)
      let grade = scanReport.grade || '1';
      if (!scanReport.grade && scanReport.className) {
        const gMatch = scanReport.className.match(/(?:1[0-2]|[1-9])/);
        if (gMatch) grade = gMatch[0];
      }
      if (c27 && typeof c27.normalizeGrade === 'function') {
        grade = c27.normalizeGrade(grade);
      }

      // B. Tự động suy luận Cấp học chính xác từ Khối lớp đang mở:
      // - Khối 1 đến 5: Cấp Tiểu học (PRIMARY) tuân thủ Thông tư 27/2020/TT-BGDĐT
      // - Khối 6 đến 9: Cấp THCS (SECONDARY) tuân thủ Thông tư 22/2021/TT-BGDĐT
      // - Khối 10 đến 12: Cấp THPT (HIGH_SCHOOL) tuân thủ Thông tư 22/2021/TT-BGDĐT
      const numGrade = parseInt(grade, 10) || 1;
      let detectedLevel = 'PRIMARY';
      if (numGrade >= 10) {
        detectedLevel = 'HIGH_SCHOOL';
      } else if (numGrade >= 6) {
        detectedLevel = 'SECONDARY';
      } else {
        detectedLevel = 'PRIMARY';
      }
      currentEducationLevel = detectedLevel;
      updateLevelSelectorUI();

      // C. Tự động nhận diện Môn học chính xác
      let subject = scanReport.subject || 'Toán';
      if (adapter && typeof adapter.detectSubject === 'function') {
        try {
          const subInfo = adapter.detectSubject();
          if (subInfo && subInfo.subject) subject = subInfo.subject;
        } catch (e) {}
      }
      if (c27 && typeof c27.normalizeSubjectName === 'function' && subject !== 'Năng lực và Phẩm chất') {
        subject = c27.normalizeSubjectName(subject, currentEducationLevel);
      }

      // D. Tự động nhận diện Kỳ kiểm tra / Đợt đánh giá (GK1, CK1, GK2, CK2)
      let detectedPeriodCode = 'GK1';
      const rawPeriod = (adapter && adapter.detectedPeriod) || (scanReport && scanReport.period) || (adapter && typeof adapter._detectPeriod === 'function' ? adapter._detectPeriod() : null);
      if (rawPeriod) {
        detectedPeriodCode = (deps.OfflineTemplates && typeof deps.OfflineTemplates.normalizePeriodCode === 'function')
          ? deps.OfflineTemplates.normalizePeriodCode(rawPeriod)
          : (c27 && typeof c27.normalizePeriod === 'function' ? c27.normalizePeriod(rawPeriod) : rawPeriod);
      }
      currentPeriod = detectedPeriodCode || 'GK1';

      const periodNames = { GK1: 'Giữa HK1', CK1: 'Cuối HK1', GK2: 'Giữa HK2', CK2: 'Cuối năm' };
      const periodLabel = periodNames[currentPeriod] || currentPeriod;
      const fillTag = `Khối ${grade} • ${subject} • ${periodLabel}`;

      const period = currentPeriod;
      const rule = (c27 && typeof c27.getAssessmentRule === 'function')
        ? c27.getAssessmentRule(grade, period, subject, currentEducationLevel)
        : {
            isScored: currentEducationLevel === 'PRIMARY'
              ? ((grade === '4' || grade === '5') && (subject === 'Toán' || subject === 'Tiếng Việt'))
              : true,
            educationLevel: currentEducationLevel
          };

      // 4. Bóc tách Xếp loại và Điểm số trực tiếp từ DOM của từng học sinh
      const itemsToFill = [];
      const unratedStudents = [];
      const totalStudents = scanReport.mapping.length;
      const isFormModal = adapter && (adapter.name === 'VNEDU_ADAPTER_FORM' || adapter.isCompetencyModal);

      // XỬ LÝ CHUYÊN BIỆT CHO GIAO DIỆN "PHẨM CHẤT - NĂNG LỰC GHI HỌC BẠ":
      // Điền nhận xét -> Hỏi giáo viên có đồng ý lưu không?
      // - Nếu có: Lưu trên vnEdu -> Chuyển sang học sinh tiếp theo -> Cho đến hết danh sách lớp học thì ngưng
      // - Nếu không: Dừng lại ngay lập tức
      if (isFormModal) {
        const allStudents = typeof adapter.getAllStudents === 'function'
          ? adapter.getAllStudents()
          : (typeof adapter.detectStudents === 'function' ? adapter.detectStudents() : []);

        if (allStudents.length === 0) {
          isFillingActive = false;
          if (btnMain) btnMain.classList.remove('disabled');
          updateMainButtonUI();
          showToast('⚠️ Không tìm thấy danh sách học sinh trong cửa sổ Phẩm chất - Năng lực.', null, true, false);
          setTimeout(hideToast, 4000);
          return;
        }

        // Khởi động lại session pool mẫu nhận xét chống trùng lặp
        if (deps.OfflineTemplates && typeof deps.OfflineTemplates.resetSessionPool === 'function') {
          deps.OfflineTemplates.resetSessionPool();
        }

        // Bắt đầu từ học sinh đang được chọn (nếu có), hoặc từ học sinh đầu tiên
        let startIndex = typeof adapter.getSelectedStudentIndex === 'function'
          ? adapter.getSelectedStudentIndex()
          : 0;
        if (startIndex < 0 || startIndex >= allStudents.length) {
          startIndex = 0;
        }

        const totalClassStudents = allStudents.length;
        let filledSuccessCount = 0;
        let stoppedByUser = false;
        let saveAndExitRequested = false;
        let lastSavedStudentName = '';

        showToast(
          `🚀 Bắt đầu điền nhận xét phẩm chất - năng lực từ học sinh: ${allStudents[startIndex].studentName} (${startIndex + 1}/${totalClassStudents})...`,
          Math.round(((startIndex + 1) / totalClassStudents) * 100),
          false,
          true
        );

        for (let i = startIndex; i < totalClassStudents; i++) {
          if (!isFillingActive) {
            stoppedByUser = true;
            break;
          }

          const currentStudent = allStudents[i];
          const sttNumber = i + 1;
          const studentName = currentStudent.studentName || `Học sinh ${sttNumber}`;

          // 1. Chuyển chọn dòng học sinh i trên giao diện vnEdu
          if (textSpan) textSpan.textContent = `Chọn: ${studentName}...`;
          showToast(
            `Đang chọn học sinh: ${studentName} (${sttNumber}/${totalClassStudents})...`,
            Math.round((sttNumber / totalClassStudents) * 100),
            false,
            true
          );

          if (typeof adapter.selectStudent === 'function') {
            await adapter.selectStudent(i);
          }

          if (!isFillingActive) {
            stoppedByUser = true;
            break;
          }

          // 2. Điền nhận xét phẩm chất - năng lực cho học sinh
          if (textSpan) textSpan.textContent = `Điền: ${studentName}...`;
          showToast(
            `Đang điền nhận xét cho: ${studentName} (${sttNumber}/${totalClassStudents})...`,
            Math.round((sttNumber / totalClassStudents) * 100),
            false,
            true
          );

          const mappingItem = {
            student: currentStudent,
            index: sttNumber,
            status: 'READY'
          };

          const fillResult = await adapter.fillComment(mappingItem, '', {
            period: currentPeriod,
            educationLevel: currentEducationLevel,
            offlineTemplates: deps.OfflineTemplates
          });

          if (!isFillingActive) {
            stoppedByUser = true;
            break;
          }

          const isSuccess = (typeof fillResult === 'object' && fillResult !== null) ? Boolean(fillResult.success) : Boolean(fillResult);
          const isUnrated = (typeof fillResult === 'object' && fillResult !== null) ? Boolean(fillResult.unrated) : (mappingItem.unrated === true);

          if (!isSuccess || isUnrated) {
            unratedStudents.push({
              student: currentStudent,
              index: sttNumber,
              name: studentName,
              reason: (fillResult && fillResult.message) || 'Chưa có xếp loại năng lực - phẩm chất (chưa có chữ màu đỏ T, Đ, C của GVCN).'
            });

            showToast(
              `⚠️ Bỏ qua học sinh: ${studentName} (${sttNumber}/${totalClassStudents})\nLý do: Chưa có xếp loại năng lực - phẩm chất (chưa có chữ màu đỏ T, Đ, C của GVCN). Giữ nguyên ô trống.`,
              Math.round((sttNumber / totalClassStudents) * 100),
              true,
              true // Luôn hiển thị nút [✕ Dừng] để Thầy/Cô dừng bất cứ lúc nào
            );

            const wasCancelled = await sleepInterruptible(900);
            if (!isFillingActive || wasCancelled) {
              stoppedByUser = true;
              break;
            }
            continue;
          }

          filledSuccessCount++;

          // 3. Mỗi lần điền xong một học sinh, hiện hộp thoại xác nhận: Lưu & tiếp tục hoặc Lưu & thoát
          if (textSpan) textSpan.textContent = `Chờ xác nhận: ${studentName}`;
          hideToast();

          const saveAction = await askTeacherToSave(studentName, sttNumber, totalClassStudents);

          if (!isFillingActive || !saveAction || saveAction === 'CANCEL' || saveAction === false) {
            // Trường hợp giáo viên chọn không lưu hoặc đã bấm hủy/dừng
            stoppedByUser = true;
            showToast(
              `🛑 Thầy/Cô đã chọn KHÔNG LƯU.\nĐã dừng tiến trình tại học sinh: ${studentName} (${sttNumber}/${totalClassStudents}).\nNội dung nhận xét trên màn hình được giữ nguyên để Thầy/Cô tùy ý điều chỉnh.`,
              null,
              false,
              false
            );
            break;
          }

          // Giáo viên đồng ý lưu (Cả "Lưu và tiếp tục" lẫn "Lưu và thoát" đều tự động bấm Lưu trên vnEdu)
          if (textSpan) textSpan.textContent = `Đang lưu: ${studentName}...`;
          showToast(
            `💾 Đang lưu nhận xét cho học sinh: ${studentName}...`,
            Math.round((sttNumber / totalClassStudents) * 100),
            false,
            true // Luôn hiển thị nút [✕ Dừng]
          );

          if (typeof adapter.clickSaveButton === 'function') {
            await adapter.clickSaveButton();
          }

          if (!isFillingActive) {
            stoppedByUser = true;
            break;
          }

          // Trường hợp giáo viên chọn: "Lưu và thoát"
          if (saveAction === 'SAVE_AND_EXIT') {
            saveAndExitRequested = true;
            lastSavedStudentName = studentName;
            break;
          }

          // Nếu đây là học sinh cuối cùng của danh sách lớp học thì ngưng
          if (i === totalClassStudents - 1) {
            break;
          }

          // Trường hợp giáo viên chọn: "Lưu và tiếp tục" -> thông báo và chuyển sang em tiếp theo
          showToast(
            `✓ Đã lưu thành công cho: ${studentName}.\nĐang chuyển sang học sinh tiếp theo...`,
            Math.round((sttNumber / totalClassStudents) * 100),
            false,
            true
          );

          const wasCancelledNext = await sleepInterruptible(400);
          if (!isFillingActive || wasCancelledNext) {
            stoppedByUser = true;
            break;
          }
        }

        // Kết thúc tiến trình cho modal Phẩm chất - Năng lực
        isFillingActive = false;
        if (btnMain) btnMain.classList.remove('disabled');

        if (saveAndExitRequested) {
          updateMainButtonUI();
          showToast(
            `💾 ĐÃ LƯU & DỪNG TIẾN TRÌNH!\n✓ Đã lưu nhận xét thành công cho học sinh: ${lastSavedStudentName || 'học sinh hiện tại'}.\n✓ Tổng số học sinh đã hoàn tất và lưu: ${filledSuccessCount}/${totalClassStudents} em.`,
            null,
            false,
            false
          );
          setTimeout(hideToast, 4500);
          return;
        } else if (stoppedByUser) {
          updateMainButtonUI();
          showToast(
            `🛑 ĐÃ DỪNG TIẾN TRÌNH!\nTiến trình đã được dừng lại theo yêu cầu của Thầy/Cô.${filledSuccessCount > 0 ? `\n✓ Đã điền và lưu được ${filledSuccessCount} học sinh.` : ''}`,
            null,
            false,
            false
          );
          setTimeout(hideToast, 4000);
          return;
        } else if (filledSuccessCount === 0 && unratedStudents.length > 0) {
          if (iconSpan) iconSpan.textContent = '⚠️';
          if (textSpan) textSpan.textContent = 'Chưa có xếp loại';
          showToast(
            `⚠️ Không có học sinh nào được điền nhận xét!\nToàn bộ ${unratedStudents.length} học sinh đều chưa có xếp loại năng lực - phẩm chất (chưa có chữ màu đỏ T, Đ, C của GVCN).\n🔒 Thầy/Cô vui lòng nhập xếp loại trên vnEdu trước khi bấm "Điền Nhận Xét" để đảm bảo đánh giá chính xác.`,
            null,
            true,
            false
          );
          setTimeout(() => {
            updateMainButtonUI();
            hideToast();
          }, 8000);
        } else if (unratedStudents.length > 0) {
          if (iconSpan) iconSpan.textContent = '✓';
          if (textSpan) textSpan.textContent = `Xong (${filledSuccessCount}/${totalClassStudents})`;
          showToast(
            `🎉 ĐÃ HOÀN TẤT TIẾN TRÌNH!\n✓ Đã điền và lưu nhận xét thành công cho ${filledSuccessCount} học sinh có xếp loại.\n⚠️ Đã bỏ qua ${unratedStudents.length} học sinh chưa có xếp loại (giữ nguyên ô trống).`,
            100,
            false,
            false
          );
          setTimeout(() => {
            updateMainButtonUI();
            hideToast();
          }, 8000);
        } else {
          if (iconSpan) iconSpan.textContent = '✓';
          if (textSpan) textSpan.textContent = `Hoàn tất (${filledSuccessCount}/${totalClassStudents})`;
          showToast(
            `🎉 ĐÃ HOÀN TẤT DANH SÁCH LỚP HỌC!\n✓ Đã điền và lưu nhận xét phẩm chất - năng lực thành công cho toàn bộ ${totalClassStudents} học sinh.`,
            100,
            false,
            false
          );
          setTimeout(() => {
            updateMainButtonUI();
            hideToast();
          }, 8000);
        }

        return;
      }

      // Khởi động lại hàng đợi nhận xét chống trùng lặp cho cả lớp
      if (deps.OfflineTemplates && typeof deps.OfflineTemplates.resetSessionPool === 'function') {
        deps.OfflineTemplates.resetSessionPool();
      }

      scanReport.mapping.forEach((m, idx) => {
        const fieldRow = m.commentField?.rowElement;
        let rating = null;
        let score = null;

        if (deps.BaseAdapter?.VnEduBaseAdapter?.extractRowRatingAndScore) {
          try {
            const extracted = deps.BaseAdapter.VnEduBaseAdapter.extractRowRatingAndScore(
              fieldRow,
              m.student?.rowElement || null,
              adapter?.ratingColumnIndex ?? -1,
              adapter?.scoreColumnIndex ?? -1,
              {
                isScored: rule.isScored,
                educationLevel: currentEducationLevel,
                ratingColClass: adapter?.ratingColClass,
                scoreColClass: adapter?.scoreColClass,
                scoreColumns: adapter?.scoreColumns || []
              }
            );
            if (extracted.rating) rating = extracted.rating;
            if (extracted.score !== null && extracted.score !== undefined) score = extracted.score;
          } catch (e) {}
        }

        // Fallback kiểm tra rating/score đã quét trước đó nếu extractRow không ra kết quả
        if (!rating && m.rating) rating = m.rating;
        if (score === null && m.score !== null && m.score !== undefined) score = m.score;

        // BẢO VỆ CHỐNG NHẦM STT THÀNH ĐIỂM SỐ (DOUBLE-LOCK VERIFICATION):
        // Chỉ áp dụng cho các môn tính điểm ở cấp THCS & THPT (nơi dùng thang điểm số 0 - 10):
        // Bắt buộc phải có ít nhất 1 ô điểm thực tế trong các cột điểm (TX, GK, CK, ĐTB) của dòng này.
        // Nếu toàn bộ các ô điểm trong dòng đều trống, TUYỆT ĐỐI KHÔNG coi là có điểm số!
        if (currentEducationLevel !== 'PRIMARY' && rule.isScored) {
          const scoreCols = adapter?.scoreColumns || [];
          let hasActualScoreInput = false;

          if (fieldRow && scoreCols.length > 0) {
            const rowCells = Array.from(fieldRow.querySelectorAll('td, [role="gridcell"], .x-grid3-cell'));
            const isFullRowWithStt = rowCells.length >= 4 && (
              /^\s*\d{1,3}\s*$/.test(rowCells[0]?.textContent || '') ||
              /^\s*\d{6,}\s*$/.test(rowCells[1]?.textContent || '') ||
              rowCells[0]?.className?.includes('numberer') ||
              rowCells[0]?.className?.includes('stt')
            );
            const expectedStt = String(m.student?.index || idx + 1);

            for (const sc of scoreCols) {
              // Bỏ qua cột điểm nếu sc.index nằm trong các cột định danh học sinh (0, 1, 2, 3)
              if (isFullRowWithStt && sc.index >= 0 && sc.index < 4) {
                continue;
              }

              let cellEl = null;
              if (sc.colClass) {
                cellEl = fieldRow.querySelector('.' + sc.colClass) ||
                         fieldRow.querySelector('.' + sc.colClass.replace('x-grid3-td-', 'x-grid3-col-'));
              }
              if (!cellEl && sc.index >= 0) {
                if (sc.index < rowCells.length) cellEl = rowCells[sc.index];
              }
              if (cellEl) {
                // Bỏ qua nếu ô là textarea nhận xét hoặc nằm trong bảng khóa
                if (cellEl.querySelector('textarea') || cellEl.tagName === 'TEXTAREA' || cellEl.closest?.('.x-grid3-locked, [class*="-locked"]')) {
                  continue;
                }
                // Bỏ qua nếu là cột STT hoặc thông tin học sinh
                if (isFullRowWithStt && (cellEl === rowCells[0] || cellEl === rowCells[1] || cellEl === rowCells[2] || cellEl === rowCells[3] || cellEl.cellIndex <= 3)) {
                  continue;
                }
                const cls = ((cellEl.className || '') + ' ' + (cellEl.parentElement?.className || '')).toLowerCase();
                if (/\b(?:numberer|stt|so_tt|ma_hs|mahs|ho_ten|hoten|ten|ngay_sinh|ngaysinh|sms|lien_lac|lienlac)\b/.test(cls)) {
                  continue;
                }

                const inp = cellEl.querySelector('input, select');
                const raw = (inp ? (inp.value || '') : (cellEl.textContent || '')).replace(/\u00a0/g, ' ').replace(/&nbsp;/g, ' ').trim();
                if (raw) {
                  // BẢO VỆ CHỐNG NHẦM STT: Nếu giá trị ô trùng với STT học sinh và ô nằm ở đầu bảng -> Bỏ qua
                  if (raw === expectedStt && (cellEl.cellIndex === 0 || sc.index <= 0)) {
                    continue;
                  }
                  const clean = raw.replace(',', '.');
                  const num = parseFloat(clean);
                  if (!isNaN(num) && num >= 0 && num <= 10 && /^(?:10|[0-9](?:\.[0-9]+)?)$/.test(clean)) {
                    hasActualScoreInput = true;
                    break;
                  }
                }
              }
            }
          } else if (score !== null) {
            // Không có cột điểm nào xác định được trong bảng nhưng lại có score -> Khả năng nhầm STT, hủy bỏ
            hasActualScoreInput = false;
          }

          if (!hasActualScoreInput) {
            score = null;
            rating = null;
          }
        }

        // Nếu là môn tính điểm ở THCS/THPT nhưng học sinh chưa có điểm số con, bắt buộc xóa rating để không bị nhận xét nhầm
        if (currentEducationLevel !== 'PRIMARY' && rule.isScored && (score === null || score === undefined || isNaN(score))) {
          score = null;
          rating = null;
        }

        // KIỂM TRA ĐIỀU KIỆN XẾP LOẠI (Áp dụng cho bảng/grid điểm và sổ nhận xét vnEdu):
        // Chỉ điền nhận xét cho học sinh CÓ ĐỦ ĐIỂM SỐ CON (nếu là môn tính điểm THCS/THPT) hoặc CÓ XẾP LOẠI HỢP LỆ
        if (!isFormModal) {
          let hasEvaluation = false;
          if (currentEducationLevel === 'PRIMARY') {
            // CẤP TIỂU HỌC (Thông tư 27):
            // Đánh giá dựa trên Xếp loại Mức đạt được (T, H, C hoặc số 2, 1, 0) trong Sổ nhận xét!
            // Hoặc có điểm số con từ 0 đến 10 nếu bảng điểm có điểm số.
            hasEvaluation = Boolean(
              (rating && /^(?:T|H|C|Đ|CĐ|K)$/i.test(rating)) ||
              (score !== null && score !== undefined && !isNaN(score) && score >= 0 && score <= 10)
            );
          } else if (rule.isScored) {
            // CẤP THCS & THPT - Môn tính điểm (Thông tư 22):
            // BẮT BUỘC học sinh phải có điểm số hợp lệ từ 0 đến 10 (hoặc có xếp loại hợp lệ)
            hasEvaluation = Boolean(
              (score !== null && score !== undefined && !isNaN(score) && score >= 0 && score <= 10) ||
              (rating && /^(?:T|H|C|Đ|CĐ|K)$/i.test(rating))
            );
          } else {
            // CẤP THCS & THPT - Môn đánh giá bằng nhận xét (Thông tư 22):
            // BẮT BUỘC phải có kết quả đánh giá (Đ, CĐ hoặc T, H, C)
            hasEvaluation = Boolean(rating && /^(?:Đ|CĐ|T|H|C|K)$/i.test(rating));
          }

          if (!hasEvaluation) {
            unratedStudents.push({
              student: m.student,
              commentField: m.commentField,
              index: m.student?.index || (idx + 1),
              name: m.student?.studentName || `Học sinh ${idx + 1}`
            });
            return; // BỎ QUA HỌC SINH NÀY! Tuyệt đối không tự ý gán mức 'H' hay điền nhận xét!
          }
        }

        // Sinh nội dung nhận xét tương ứng với Cấp học & Kỳ kiểm tra (GK1, CK1, GK2, CK2)
        let commentText = '';
        if (deps.OfflineTemplates) {
          const commentVars = {
            period: currentPeriod,
            educationLevel: currentEducationLevel,
            grade: grade,
            maxLength: 80
          };

          if (currentEducationLevel !== 'PRIMARY' && rule.isScored && score !== null) {
            commentText = deps.OfflineTemplates.getCommentByScore(subject, score, idx, currentEducationLevel, commentVars);
          } else if (score !== null && !rating && rule.isScored) {
            commentText = deps.OfflineTemplates.getCommentByScore(subject, score, idx, currentEducationLevel, commentVars);
          } else {
            const defaultLevel = currentEducationLevel !== 'PRIMARY' && !rule.isScored ? 'Đ' : 'H';
            const lvl = rating || defaultLevel;
            commentText = deps.OfflineTemplates.getCommentForStudent(subject, lvl, idx, currentEducationLevel, commentVars);
          }
        }

        const effectiveLevel = rating || (currentEducationLevel !== 'PRIMARY' && !rule.isScored ? 'Đ' : 'H');

        if (!commentText || !commentText.trim()) {
          const isComp = (currentPeriod === 'CK1' || currentPeriod === 'CK2');
          if (effectiveLevel === 'C' || effectiveLevel === 'CĐ') {
            commentText = isComp
              ? 'Tiến bộ còn chậm trong học tập và rèn luyện, cần cố gắng nhiều hơn.'
              : 'Cần chú ý lắng nghe giáo viên và tích cực rèn luyện thêm trong giờ học.';
          } else if (effectiveLevel === 'T') {
            commentText = isComp
              ? (currentPeriod === 'CK1'
                  ? 'Hoàn thành xuất sắc mục tiêu học kì 1, tự giác và tích cực rèn luyện.'
                  : 'Hoàn thành xuất sắc mục tiêu môn học cả năm, tự giác và có nhiều tiến bộ.')
              : 'Tiếp thu bài rất tốt, chăm chỉ và chủ động trong giờ học.';
          } else {
            commentText = isComp
              ? (currentPeriod === 'CK1'
                  ? 'Hoàn thành tốt các yêu cầu học kì 1, chăm chỉ và có ý thức rèn luyện tốt.'
                  : 'Hoàn thành tốt các yêu cầu của năm học, chăm chỉ và có ý thức rèn luyện tốt.')
              : 'Tự giác học tập, tiếp thu bài nhanh và chăm chỉ trong giờ học.';
          }
        }

        // Đảm bảo giới hạn nghiêm ngặt <= 80-85 ký tự theo quy định hệ thống vnEdu (dưới 100 ký tự tránh tràn học bạ)
        if (commentText.length > 80) {
          if (deps.OfflineTemplates && typeof deps.OfflineTemplates.clampToMaxLength === 'function') {
            commentText = deps.OfflineTemplates.clampToMaxLength(commentText, 80);
          } else {
            let sub = commentText.trim().slice(0, 80);
            const lastSpace = sub.lastIndexOf(' ');
            if (lastSpace > 45) sub = sub.slice(0, lastSpace);
            sub = sub.replace(/[,;:\-\s]+$/, '');
            if (!/[.!?]$/.test(sub)) sub += '.';
            commentText = sub;
          }
        }
        if (commentText.length >= 95) {
          commentText = commentText.slice(0, 80).replace(/[,;:\-\s]+$/, '') + '.';
        }

        itemsToFill.push({
          student: m.student,
          commentField: m.commentField,
          fields: m.fields,
          comment: commentText,
          level: effectiveLevel,
          score: score,
          selected: true,
          status: 'READY'
        });
      });

      // KIỂM TRA ĐIỀU KIỆN TRƯỚC KHI THỰC HIỆN ĐIỀN:
      if (!isFormModal) {
        // Trường hợp 1: Trống toàn bộ cột xếp loại / điểm số (0 học sinh có đánh giá)
        if (itemsToFill.length === 0) {
          isFillingActive = false;
          if (btnMain) btnMain.classList.remove('disabled');
          updateMainButtonUI();

          if (currentEducationLevel === 'PRIMARY') {
            showToast(
              '⚠️ Cột xếp loại đang để trống!\nThầy/Cô vui lòng nhập xếp loại (ví dụ: T, H, C hoặc 2, 1, 0) trước khi bấm "Điền Nhận Xét".',
              null,
              true,
              false
            );
          } else if (rule.isScored) {
            const hasDtbCol = adapter?.scoreColumns?.some(sc => (sc.type || sc.group) === 'DTB');
            if (hasDtbCol) {
              showToast(
                `⚠️ Chưa có điểm ĐTBmhk (Điểm trung bình môn học kỳ)!\nTrên sổ điểm học kỳ, việc nhận xét học sinh phải dựa vào cột "ĐTBmhk".\n🔒 Thầy/Cô vui lòng hoàn thành điểm kiểm tra học kỳ để vnEdu tính điểm ĐTBmhk trước khi bấm "Điền Nhận Xét".`,
                null,
                true,
                false
              );
            } else {
              showToast(
                `⚠️ Chưa có điểm số của học sinh!\nỞ cấp ${currentEducationLevel === 'SECONDARY' ? 'THCS' : 'THPT'}, môn ${subject} xếp loại dựa vào điểm số (thang điểm 0 - 10).\n🔒 Thầy/Cô vui lòng nhập điểm số trên vnEdu trước khi bấm "Điền Nhận Xét".`,
                null,
                true,
                false
              );
            }
          } else {
            const hasDtbCol = adapter?.scoreColumns?.some(sc => (sc.type || sc.group) === 'DTB');
            if (hasDtbCol) {
              showToast(
                `⚠️ Cột kết quả ĐTBmhk đang để trống!\nTrên sổ điểm học kỳ, việc nhận xét môn ${subject} dựa vào kết quả tổng kết ĐTBmhk (Đ hoặc CĐ).\n🔒 Thầy/Cô vui lòng nhập kết quả tổng kết trên vnEdu trước khi bấm "Điền Nhận Xét".`,
                null,
                true,
                false
              );
            } else {
              showToast(
                `⚠️ Cột kết quả đánh giá đang để trống!\nỞ cấp ${currentEducationLevel === 'SECONDARY' ? 'THCS' : 'THPT'}, môn ${subject} đánh giá bằng nhận xét theo 2 mức Đạt (Đ) hoặc Chưa đạt (CĐ).\n🔒 Thầy/Cô vui lòng nhập kết quả (Đ hoặc CĐ) trên vnEdu trước khi bấm "Điền Nhận Xét".`,
                null,
                true,
                false
              );
            }
          }
          setTimeout(hideToast, 7000);
          return;
        }

        // Trường hợp 2: Chưa đủ xếp loại / điểm số (có học sinh chưa có điểm)
        if (unratedStudents.length > 0) {
          if (currentEducationLevel === 'PRIMARY') {
            showToast(
              `⚠️ Danh sách chưa đủ xếp loại: Có ${unratedStudents.length}/${totalStudents} học sinh chưa có xếp loại.\nExtension sẽ chỉ điền nhận xét cho ${itemsToFill.length} học sinh đã có xếp loại (T, H, C)...`,
              null,
              false,
              false
            );
          } else if (rule.isScored) {
            const hasDtbCol = adapter?.scoreColumns?.some(sc => (sc.type || sc.group) === 'DTB');
            const scoreLabel = hasDtbCol ? 'điểm ĐTBmhk' : 'điểm số';
            showToast(
              `⚠️ Danh sách chưa đủ ${scoreLabel}: Có ${unratedStudents.length}/${totalStudents} học sinh chưa có ${scoreLabel}.\nExtension sẽ chỉ điền nhận xét cho ${itemsToFill.length} học sinh đã có ${scoreLabel} (thang điểm 0 - 10)...`,
              null,
              false,
              false
            );
          } else {
            const hasDtbCol = adapter?.scoreColumns?.some(sc => (sc.type || sc.group) === 'DTB');
            const resultLabel = hasDtbCol ? 'kết quả ĐTBmhk' : 'kết quả (Đ/CĐ)';
            showToast(
              `⚠️ Danh sách chưa đủ ${resultLabel}: Có ${unratedStudents.length}/${totalStudents} học sinh chưa có ${resultLabel}.\nExtension sẽ chỉ điền nhận xét cho ${itemsToFill.length} học sinh đã có kết quả...`,
              null,
              false,
              false
            );
          }
          await new Promise(res => setTimeout(res, 2200));
        }
      }

      // 5. Bắt đầu điền dữ liệu vào vnEdu
      const targetFillCount = itemsToFill.length;
      const targetStudentName = isFormModal && itemsToFill[0]?.student?.studentName
        ? itemsToFill[0].student.studentName
        : 'học sinh đang chọn';

      if (isFormModal) {
        if (textSpan) textSpan.textContent = `Đang điền: ${targetStudentName}...`;
        showToast(`Đang điền nhận xét phẩm chất - năng lực cho học sinh: ${targetStudentName}...`, 50, false, false);
      } else {
        if (textSpan) textSpan.textContent = `Đang điền (0/${targetFillCount})...`;
        showToast(`Đang điền nhận xét [${fillTag}]... 0/${targetFillCount} (0%)`, 0, false, true);
      }

      const fillSettings = (deps.Storage && typeof deps.Storage.getSettings === 'function')
        ? await deps.Storage.getSettings()
        : {};

      const fillResult = await deps.FillEngine.executeBatchFill(
        itemsToFill,
        {
          delayMs: fillSettings?.fillDelayMs || 350,
          strictRowNameCheck: !isFormModal && fillSettings?.strictRowNameCheck !== false,
          fillRating: false, // TUYỆT ĐỐI không ghi đè cột xếp loại khi giáo viên bấm "Điền Nhận Xét"! Chỉ điền nhận xét!
          adapter: adapter,
          period: currentPeriod,
          educationLevel: currentEducationLevel,
          offlineTemplates: deps.OfflineTemplates
        },
        (p) => {
          if (isFormModal) {
            if (textSpan) textSpan.textContent = `Đang điền: ${targetStudentName}...`;
            showToast(`Đang điền nhận xét phẩm chất - năng lực cho học sinh: ${targetStudentName}...`, p.percent, false, false);
          } else {
            if (textSpan) textSpan.textContent = `Đang điền (${p.current}/${p.total})...`;
            showToast(`Đang điền nhận xét [${fillTag}] (${p.current}/${p.total}) - ${p.percent}%`, p.percent, false, true);
          }
        }
      );

      // 6. Hoàn tất quá trình điền
      isFillingActive = false;
      if (btnMain) btnMain.classList.remove('disabled');

      if (isFormModal) {
        if (iconSpan) iconSpan.textContent = '✓';
        if (textSpan) textSpan.textContent = 'Điền học sinh tiếp theo';
        if (btnMain) btnMain.title = 'Bấm để điền nhận xét cho học sinh được chọn tiếp theo';

        showToast(
          `✓ Đã điền xong nhận xét phẩm chất - năng lực cho học sinh: ${targetStudentName}!\n💾 Thầy/Cô vui lòng bấm nút "Lưu" trên vnEdu để lưu lại, sau đó chọn học sinh tiếp theo để tiếp tục thực hiện.`,
          100,
          false,
          false
        );

        setTimeout(() => {
          updateMainButtonUI();
          hideToast();
        }, 8500);
      } else {
        if (iconSpan) iconSpan.textContent = '✓';
        if (textSpan) textSpan.textContent = `Xong (${fillResult.successCount}/${targetFillCount})`;

        if (unratedStudents.length > 0) {
          const evalUnit = (currentEducationLevel !== 'PRIMARY' && rule.isScored)
            ? 'có điểm số'
            : ((currentEducationLevel !== 'PRIMARY' && !rule.isScored) ? 'có kết quả (Đ/CĐ)' : 'có xếp loại');
          const unratedUnit = (currentEducationLevel !== 'PRIMARY' && rule.isScored)
            ? 'chưa có điểm số'
            : ((currentEducationLevel !== 'PRIMARY' && !rule.isScored) ? 'chưa có kết quả' : 'chưa có xếp loại');

          showToast(
            `✓ Đã điền xong nhận xét cho ${fillResult.successCount}/${targetFillCount} học sinh ${evalUnit}!\n⚠️ Đã bỏ qua ${unratedStudents.length} học sinh ${unratedUnit} (giữ nguyên ô trống).\n🔒 Thầy/Cô vui lòng rà soát lại và tự bấm nút "Lưu" hoặc "Ghi" trên vnEdu.`,
            100,
            false,
            false
          );

          setTimeout(() => {
            updateMainButtonUI();
            hideToast();
          }, 7000);
        } else {
          showToast(
            `✓ Đã điền xong nhận xét [${fillTag}] cho ${fillResult.successCount}/${totalStudents} học sinh!\n🔒 Thầy/Cô vui lòng rà soát lại và tự bấm nút "Lưu" hoặc "Ghi" trên vnEdu.`,
            100,
            false,
            false
          );

          setTimeout(() => {
            updateMainButtonUI();
            hideToast();
          }, 5500);
        }
      }

    } catch (err) {
      isFillingActive = false;
      if (btnMain) btnMain.classList.remove('disabled');
      updateMainButtonUI();
      showToast(`❌ Lỗi khi điền nhận xét: ${err.message}`, null, true, false);
      setTimeout(hideToast, 4500);
    }
  }

  function bindEvents(deps) {
    const btnMain = shadowRoot.getElementById('vnedu-btn-main');
    const btnKey = shadowRoot.getElementById('vnedu-btn-key');
    const btnCloseModal = shadowRoot.getElementById('btn-close-license-modal');
    const btnSubmitKey = shadowRoot.getElementById('vnedu-key-submit');
    const inputKey = shadowRoot.getElementById('vnedu-key-input');
    const errorEl = shadowRoot.getElementById('vnedu-key-error');
    const toastCancelBtn = shadowRoot.getElementById('toast-cancel-btn');
    const modalBackdrop = shadowRoot.getElementById('vnedu-license-modal');


    btnMain?.addEventListener('click', () => {
      // Nếu đang trong tiến trình điền nhận xét, bấm nút chính sẽ DỪNG NGAY LẬP TỨC
      if (isFillingActive) {
        stopAllFilling('Thầy/Cô đã bấm dừng tiến trình.');
        return;
      }

      checkLicenseStatus((licensed, record, reason, details) => {
        if (!licensed) {
          openLicenseModal(details);
        } else {
          // Kiểm tra xem có đang ở trong màn hình Sổ điểm / Sổ nhận xét hay không
          const pageDetector = (deps && deps.PageDetector) || (typeof window !== 'undefined' && window.VnEduPageDetector);
          let isAssess = false;
          if (pageDetector && typeof pageDetector.detectCurrentPage === 'function') {
            const p = pageDetector.detectCurrentPage();
            isAssess = p && p.isAssessmentPage;
          }
          if (!isAssess) {
            isAssess = Boolean(document.querySelector('.x-grid3-row, tbody tr.x-grid-row, .x-grid3-body'));
          }

          if (!isAssess) {
            const teacherName = record?.teacher || details?.currentTeacher || '';
            const helloMsg = teacherName ? `👋 Xin chào Thầy/Cô ${teacherName}!` : '👋 Xin chào Thầy/Cô!';
            showToast(`${helloMsg}\n✓ Bản quyền tiện ích đã được kích hoạt thành công trên máy này.\nThầy/Cô vui lòng mở "Sổ theo dõi và đánh giá học sinh" hoặc "Đánh giá Phẩm chất - Năng lực" để bắt đầu điền nhận xét nhé!`, null, false, false);
            setTimeout(hideToast, 5500);
            return;
          }

          handleQuickFill(deps);
        }
      });
    });

    btnKey?.addEventListener('click', () => {
      checkLicenseStatus((licensed, record, reason, details) => {
        openLicenseModal(details);
      });
    });

    btnCloseModal?.addEventListener('click', () => {
      closeLicenseModal();
    });

    modalBackdrop?.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) {
        closeLicenseModal();
      }
    });

    toastCancelBtn?.addEventListener('click', (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      stopAllFilling('Thầy/Cô đã bấm dừng tiến trình.');
    });

    // Kéo thả di chuyển vị trí widget trợ lý AI
    const mascotContainer = shadowRoot.getElementById('vnedu-mascot-container');
    const shellEl = shadowRoot.getElementById('vnedu-minimal-container');

    if (mascotContainer && shellEl) {
      let isDragging = false;
      let startX = 0;
      let startY = 0;
      let initialRight = 28;
      let initialBottom = 110;
      const dragThreshold = 5;
      let hasDragged = false;

      mascotContainer.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        
        isDragging = true;
        hasDragged = false;
        startX = e.clientX;
        startY = e.clientY;

        const rect = shellEl.getBoundingClientRect();
        initialRight = window.innerWidth - rect.right;
        initialBottom = window.innerHeight - rect.bottom;

        mascotContainer.style.cursor = 'grabbing';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });

      function onMouseMove(e) {
        if (!isDragging) return;
        if (typeof resetIdleTimer === 'function') resetIdleTimer();
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold) {
          hasDragged = true;
        }

        if (hasDragged) {
          let newRight = initialRight - dx;
          let newBottom = initialBottom - dy;

          const maxRight = Math.max(10, window.innerWidth - 220);
          const maxBottom = Math.max(10, window.innerHeight - 160);

          newRight = Math.min(Math.max(10, newRight), maxRight);
          newBottom = Math.min(Math.max(10, newBottom), maxBottom);

          shellEl.style.right = `${newRight}px`;
          shellEl.style.bottom = `${newBottom}px`;
        }
      }

      function onMouseUp(e) {
        if (!isDragging) return;
        isDragging = false;
        mascotContainer.style.cursor = 'grab';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        if (typeof resetIdleTimer === 'function') resetIdleTimer();

        if (hasDragged) {
          const rect = shellEl.getBoundingClientRect();
          const currentRight = Math.round(window.innerWidth - rect.right);
          const currentBottom = Math.round(window.innerHeight - rect.bottom);
          try {
            localStorage.setItem('vnedu_assistant_pos_v2', JSON.stringify({
              right: currentRight,
              bottom: currentBottom
            }));
          } catch (err) {}
        }
      }

      // Nhấp đúp vào bé mascot để đặt lại vị trí mặc định
      mascotContainer.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        shellEl.style.right = '28px';
        shellEl.style.bottom = '110px';
        try {
          localStorage.removeItem('vnedu_assistant_pos_v2');
        } catch (err) {}
        showToast('✓ Đã khôi phục vị trí mặc định cho Trợ lý AI!', null, false, false);
        setTimeout(hideToast, 2000);
      });
    }

    // =========================================================================
    // ⏱️ CƠ CHẾ TỰ ĐỘNG THU GỌN VÀO MÉP PHẢI SAU 15 GIÂY (PEEKING DOCK)
    // =========================================================================
    const peekingDockEl = shadowRoot.getElementById('vnedu-peeking-dock');
    const mascotWrapper = shadowRoot.getElementById('vnedu-mascot-widget-wrapper');
    const licenseModal = shadowRoot.getElementById('vnedu-license-modal');
    
    let isPeeking = false;
    let idleTimer = null;
    const IDLE_TIMEOUT_MS = 15000; // 15 giây tự động thu gọn nếu không tương tác

    function setPeekingState(peeking) {
      isPeeking = !!peeking;
      if (isPeeking) {
        if (mascotWrapper) mascotWrapper.classList.add('is-peeking-docked');
        if (peekingDockEl) {
          if (shellEl && shellEl.style.bottom) {
            peekingDockEl.style.bottom = shellEl.style.bottom;
          } else {
            peekingDockEl.style.bottom = '110px';
          }
          peekingDockEl.style.display = 'block';
        }
      } else {
        if (mascotWrapper) mascotWrapper.classList.remove('is-peeking-docked');
        if (peekingDockEl) {
          peekingDockEl.style.display = 'none';
        }
      }
    }

    function isModalOrProgressActive() {
      if (isFillingActive) return true;
      if (licenseModal && licenseModal.style.display !== 'none') return true;
      const confirmSaveModal = shadowRoot.getElementById('vnedu-confirm-save-modal');
      if (confirmSaveModal && confirmSaveModal.style.display !== 'none') return true;
      const toast = shadowRoot.getElementById('vnedu-status-toast');
      if (toast && toast.style.display !== 'none') return true;
      return false;
    }

    resetIdleTimer = function() {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }

      // Nếu đang ở trạng thái peeking, khi có hoạt động người dùng thì mở lại toàn bộ UI
      if (isPeeking) {
        setPeekingState(false);
      }

      // Không tự ẩn nếu đang điền điểm, mở modal hoặc toast đang hiển thị
      if (isModalOrProgressActive()) return;

      idleTimer = setTimeout(() => {
        if (!isModalOrProgressActive()) {
          setPeekingState(true);
        }
      }, IDLE_TIMEOUT_MS);
    };

    // Sự kiện đánh thức khi chạm hoặc rê chuột vào quả cầu Bé Bút ở mép phải
    if (peekingDockEl) {
      peekingDockEl.addEventListener('mouseenter', () => {
        resetIdleTimer();
      });
      peekingDockEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        resetIdleTimer();
      });
    }

    // Lắng nghe tương tác chuột trên widget để reset đồng hồ 15s
    if (mascotWrapper) {
      mascotWrapper.addEventListener('mouseenter', resetIdleTimer);
      mascotWrapper.addEventListener('mousemove', resetIdleTimer);
      mascotWrapper.addEventListener('mousedown', resetIdleTimer);
    }

    // Dọn dẹp trạng thái lưu thu gọn cũ (nếu có từ phiên bản trước)
    try {
      localStorage.removeItem('vnedu_ui_collapsed');
    } catch (e) {}

    // Bắt đầu đếm ngược 15 giây ngay khi nạp giao diện
    resetIdleTimer();

    function submitLicense() {
      const enteredKey = (inputKey?.value || '').trim();
      if (!enteredKey) {
        if (errorEl) errorEl.textContent = '❌ Vui lòng dán mã kích hoạt vào ô trên!';
        inputKey?.focus();
        return;
      }

      const LM = getLicenseManager();
      if (LM) {
        const detected = LM.detectVnEduTeacherAndSchool ? LM.detectVnEduTeacherAndSchool() : { teacher: '', teachers: [], school: '', schools: [] };
        const verifyRes = LM.verifyLicense(enteredKey, {
          currentTeacher: detected.teacher,
          teachers: detected.teachers,
          currentSchool: detected.school,
          schools: (detected.schools && detected.schools.length > 0) ? detected.schools : (detected.school ? [detected.school] : [])
        });

        if (verifyRes.isValid) {
          const teacherToSave = verifyRes.licenseInfo?.teacher || detected.teacher;
          const schoolToSave = verifyRes.licenseInfo?.school || detected.school;
          saveLicenseKey(enteredKey, teacherToSave, schoolToSave, () => {
            closeLicenseModal();
            updateMainButtonUI();
            alert(`✓ Kích hoạt bản quyền thành công!\nChào mừng Thầy/Cô ${teacherToSave || ''} sử dụng Trợ lý nhận xét.`);
          });
        } else {
          if (errorEl) errorEl.textContent = verifyRes.reason;
          inputKey?.focus();
        }
        return;
      }

      // Fallback
      isLicensed = true;
      closeLicenseModal();
      updateMainButtonUI();
      alert('✓ Kích hoạt bản quyền thành công!');
    }

    btnSubmitKey?.addEventListener('click', submitLicense);
    inputKey?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitLicense();
    });

    const btnClearLicense = shadowRoot.getElementById('btn-clear-license');
    btnClearLicense?.addEventListener('click', (e) => {
      e.preventDefault();
      const teacherName = currentLicenseRecord?.teacher || currentLicenseDetails?.currentTeacher || '';
      const promptMsg = teacherName
        ? `Thầy/Cô có chắc chắn muốn hủy kích hoạt mã bản quyền của GV ${teacherName} trên máy tính này không?\n(Bản quyền của các giáo viên khác đã lưu trên máy vẫn được giữ nguyên)`
        : 'Thầy/Cô có chắc chắn muốn hủy kích hoạt mã bản quyền này trên máy không?';
      if (confirm(promptMsg)) {
        clearLicenseKey(() => {
          openLicenseModal();
        });
      }
    });

    // Hotkeys: Ctrl+Shift+R or Ctrl+Shift+F triggers fill
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey && e.shiftKey && e.code === 'KeyR') || (e.ctrlKey && e.shiftKey && e.code === 'KeyF')) {
        e.preventDefault();
        checkLicenseStatus((licensed, record, reason, details) => {
          if (!licensed) openLicenseModal(details);
          else handleQuickFill(deps);
        });
      }
    });

    // Tự động quét lại trạng thái khi người dùng thao tác bấm vào menu/taskbar trên vnEdu
    let docClickRecheckTimer = null;
    document.addEventListener('click', (e) => {
      if (e.target && (e.target.closest?.('#vnedu-assistant-host') || e.target.id === 'vnedu-assistant-host')) {
        return;
      }
      if (docClickRecheckTimer) clearTimeout(docClickRecheckTimer);
      docClickRecheckTimer = setTimeout(() => {
        if (!isFillingActive) {
          checkLicenseStatus();
        }
      }, 350);
    }, { passive: true });

    // Xử lý nút Kiểm tra & Đồng bộ đám mây GitHub
    const btnTriggerSync = shadowRoot.getElementById('btn-trigger-cloud-sync');
    const cloudSyncMsg = shadowRoot.getElementById('cloud-sync-msg');
    const cloudSyncVerNum = shadowRoot.getElementById('cloud-sync-ver-num');
    const cloudSyncBadge = shadowRoot.getElementById('cloud-sync-status-badge');

    const cloudSync = (deps && deps.CloudSync) || (typeof self !== 'undefined' && self.VnEduCloudSync) || (typeof window !== 'undefined' && window.VnEduCloudSync);

    if (cloudSync) {
      cloudSync.getSyncInfo().then(info => {
        if (cloudSyncVerNum && info && info.currentVersion) {
          cloudSyncVerNum.textContent = info.currentVersion;
        }
        const cloudSyncAppVer = shadowRoot.getElementById('cloud-sync-app-ver');
        if (cloudSyncAppVer && info && info.localAppVersion) {
          cloudSyncAppVer.textContent = 'v' + info.localAppVersion;
        }
      }).catch(() => {});
    }

    btnTriggerSync?.addEventListener('click', async () => {
      if (!cloudSync) return;
      btnTriggerSync.disabled = true;
      btnTriggerSync.textContent = '⏳ Đang kích hoạt cập nhật...';
      if (cloudSyncMsg) {
        cloudSyncMsg.style.display = 'block';
        cloudSyncMsg.style.color = '#38BDF8';
        cloudSyncMsg.textContent = 'Đang tự động chạy Cap-Nhat-Tien-Ich.bat và kiểm tra dữ liệu...';
      }

      // Tự động gọi chạy file Cap-Nhat-Tien-Ich.bat qua giao thức vnedu-updater
      try {
        window.location.href = 'vnedu-updater://run';
      } catch (e) {}

      try {
        const res = await cloudSync.checkAndUpdate(true);
        btnTriggerSync.disabled = false;
        btnTriggerSync.textContent = '🔄 Kiểm tra & Đồng bộ dữ liệu mới';

        if (res.error) {
          if (cloudSyncMsg) {
            cloudSyncMsg.style.display = 'block';
            cloudSyncMsg.style.color = '#F87171';
            cloudSyncMsg.textContent = '⚠️ Không thể kết nối GitHub (vui lòng kiểm tra mạng). Đang sử dụng dữ liệu nội bộ an toàn.';
          }
        } else {
          if (cloudSyncVerNum && res.currentVersion) cloudSyncVerNum.textContent = res.currentVersion;

          // Nếu có bản nâng cấp tính năng tiện ích mới trên GitHub
          if (res.hasAppUpdate) {
            if (cloudSyncBadge) {
              cloudSyncBadge.textContent = 'Có bản mới!';
              cloudSyncBadge.style.background = 'rgba(245, 158, 11, 0.25)';
              cloudSyncBadge.style.color = '#FBBF24';
            }
            if (cloudSyncMsg) {
              cloudSyncMsg.style.display = 'block';
              cloudSyncMsg.innerHTML = `
                <div style="margin-top: 6px; padding: 8px 10px; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 8px; color: #FEF08A; font-size: 11px; line-height: 1.45; text-align: left;">
                  <b style="color: #FBBF24; display: block; margin-bottom: 4px; font-size: 11.5px;">🚀 ĐANG KÍCH HOẠT CẬP NHẬT TÍNH NĂNG MỚI (v${res.remoteAppVersion})!</b>
                  Máy Thầy/Cô đang dùng bản <b>v${res.localAppVersion}</b>.<br/>
                  ⚡ File <b>Cap-Nhat-Tien-Ich.bat</b> đang được tự động mở...<br/>
                  👉 Nếu trình duyệt hỏi <i>"Open Cap-Nhat-Tien-Ich.bat?"</i>, Thầy/Cô hãy tích chọn <b>Always allow</b> và bấm <b>Open</b> để hoàn tất.<br/>
                  <div style="margin-top: 6px;">
                    <a href="vnedu-updater://run" style="display: inline-block; padding: 4px 10px; background: #0284C7; color: white; border-radius: 4px; text-decoration: none; font-weight: 700; font-size: 11px;">⚡ Bấm vào đây nếu chưa thấy file tự mở</a>
                  </div>
                </div>
              `;
            }
            const mascotSpeech = shadowRoot.getElementById('vnedu-mascot-speech');
            if (mascotSpeech) {
              mascotSpeech.textContent = `🚀 Đang chạy Cap-Nhat-Tien-Ich.bat để lên v${res.remoteAppVersion}!`;
              mascotSpeech.style.opacity = '1';
              setTimeout(() => { mascotSpeech.style.opacity = ''; }, 8000);
            }
          } else if (res.updated) {
            if (cloudSyncBadge) {
              cloudSyncBadge.textContent = 'Đã cập nhật!';
              cloudSyncBadge.style.background = 'rgba(16, 185, 129, 0.3)';
              cloudSyncBadge.style.color = '#10B981';
            }
            if (cloudSyncMsg) {
              cloudSyncMsg.style.display = 'block';
              cloudSyncMsg.style.color = '#34D399';
              cloudSyncMsg.innerHTML = `
                <div>
                  ✓ Đã cập nhật thành công ngân hàng nhận xét mới (Bản: ${res.currentVersion})!<br/>
                  <span style="font-size: 10.5px; color: #94A3B8;">Đang kích hoạt Cap-Nhat-Tien-Ich.bat để đồng bộ toàn diện.</span>
                </div>
              `;
            }
            const mascotSpeech = shadowRoot.getElementById('vnedu-mascot-speech');
            if (mascotSpeech) {
              mascotSpeech.textContent = 'Đã cập nhật dữ liệu nhận xét mới! ✨';
              mascotSpeech.style.opacity = '1';
              setTimeout(() => { mascotSpeech.style.opacity = ''; }, 6000);
            }
          } else {
            if (cloudSyncBadge) {
              cloudSyncBadge.textContent = 'Sẵn sàng';
              cloudSyncBadge.style.background = 'rgba(16, 185, 129, 0.2)';
              cloudSyncBadge.style.color = '#34D399';
            }
            if (cloudSyncMsg) {
              cloudSyncMsg.style.display = 'block';
              cloudSyncMsg.style.color = '#34D399';
              cloudSyncMsg.innerHTML = `
                <div>
                  ✓ Tiện ích và dữ liệu hiện tại đã là phiên bản mới nhất (${res.currentVersion})!<br/>
                  <span style="font-size: 10.5px; color: #94A3B8;">Đang kích hoạt Cap-Nhat-Tien-Ich.bat để đồng bộ lại mã nguồn.</span>
                </div>
              `;
            }
          }
        }
      } catch (err) {
        btnTriggerSync.disabled = false;
        btnTriggerSync.textContent = '🔄 Kiểm tra & Đồng bộ dữ liệu mới';
        if (cloudSyncMsg) {
          cloudSyncMsg.style.display = 'block';
          cloudSyncMsg.style.color = '#F87171';
          cloudSyncMsg.textContent = '⚠️ Lỗi kiểm tra: ' + err.message;
        }
      }
    });

    const btnReloadExtension = shadowRoot.getElementById('btn-reload-extension');
    btnReloadExtension?.addEventListener('click', () => {
      btnReloadExtension.disabled = true;
      btnReloadExtension.textContent = '⏳ Đang nạp lại tiện ích...';
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ action: 'RELOAD_EXTENSION' }, () => {
          setTimeout(() => {
            window.location.reload();
          }, 300);
        });
      } else {
        window.location.reload();
      }
    });
  }

  function initOverlay(deps) {
    if (document.getElementById('vnedu-assistant-root')) {
      return;
    }

    activeDeps = deps;
    hostContainer = document.createElement('div');
    hostContainer.id = 'vnedu-assistant-root';
    document.body.appendChild(hostContainer);

    shadowRoot = hostContainer.attachShadow({ mode: 'open' });

    // Tiêm CSS Scoped
    const styleEl = document.createElement('style');
    styleEl.textContent = deps.cssContent;
    shadowRoot.appendChild(styleEl);

    const mascotUrl = deps.mascotUrl || ((typeof chrome !== 'undefined' && chrome.runtime?.getURL) ? chrome.runtime.getURL('icons/ai-mascot.png') : '');
    const peekingMascotUrl = deps.peekingMascotUrl || ((typeof chrome !== 'undefined' && chrome.runtime?.getURL) ? chrome.runtime.getURL('icons/tro-li-but.png') : mascotUrl);

    // Tiêm cấu trúc HTML 3D & Mascot
    const shellEl = document.createElement('div');
    shellEl.id = 'vnedu-minimal-container';
    shellEl.className = 'vnedu-minimal-container';

    // Khôi phục vị trí lưu tùy chỉnh nếu có
    try {
      const savedPos = localStorage.getItem('vnedu_assistant_pos_v2');
      if (savedPos) {
        const parsed = JSON.parse(savedPos);
        if (parsed && typeof parsed.bottom === 'number' && typeof parsed.right === 'number') {
          const maxBottom = Math.max(20, window.innerHeight - 150);
          const maxRight = Math.max(20, window.innerWidth - 220);
          const b = Math.min(Math.max(20, parsed.bottom), maxBottom);
          const r = Math.min(Math.max(20, parsed.right), maxRight);
          shellEl.style.bottom = `${b}px`;
          shellEl.style.right = `${r}px`;
        }
      }
    } catch (e) {}

    shellEl.innerHTML = `
      <!-- Thanh tiến trình / Thông báo trạng thái -->
      <div class="vnedu-status-toast" id="vnedu-status-toast" style="display: none;">
        <div class="toast-header-row">
          <span class="toast-msg" id="toast-msg">Đang chuẩn bị...</span>
          <button class="toast-cancel-btn" id="toast-cancel-btn" style="display: none;">✕ Dừng</button>
        </div>
        <div class="toast-progress-bar-bg" id="toast-progress-bar-bg" style="display: none;">
          <div class="toast-progress-bar-fill" id="toast-progress-bar-fill"></div>
        </div>
        <div class="toast-footer-note" id="toast-footer-note">
          <span>🔒 Tự bấm Lưu/Ghi trên vnEdu khi hoàn tất</span>
        </div>
      </div>

      <!-- Widget trợ lý AI & Nhóm nút bấm 3D cao cấp -->
      <div class="vnedu-mascot-widget-wrapper" id="vnedu-mascot-widget-wrapper">
        <div class="vnedu-main-interactive-group" id="vnedu-main-interactive-group">
          <!-- Chibi AI Mascot floating above button (có thể kéo thả) -->
          <div class="vnedu-mascot-container" id="vnedu-mascot-container" title="Trợ lý AI vnEdu (Giữ chuột để kéo thả di chuyển vị trí, nhấp đúp để đặt lại)">
            <div class="vnedu-mascot-speech" id="vnedu-mascot-speech">Em sẵn sàng điền nhận xét! ✨</div>
            <div class="vnedu-mascot-glow"></div>
            <img class="vnedu-mascot-img" id="vnedu-mascot-img" src="${mascotUrl}" alt="Trợ lý AI" />
          </div>

          <div class="vnedu-action-group">
            <!-- 3D Pill Button with Outer Bezel and Inner Glowing Pill -->
            <button class="vnedu-btn-pill-3d" id="vnedu-btn-main" title="Tự động điền nhận xét theo cấp học và kỳ kiểm tra">
              <span class="btn-pill-outer-bezel">
                <span class="btn-pill-inner-core">
                  <span class="btn-pill-highlight"></span>
                  <span class="btn-pill-content">
                    <span class="btn-pill-icon" id="btn-main-icon">⚡</span>
                    <span class="btn-pill-text-wrap">
                      <span class="btn-pill-text" id="btn-main-text">Điền Nhận Xét</span>
                      <span class="btn-pill-sparkle-line">✦ ━━━━ ✦</span>
                    </span>
                  </span>
                </span>
              </span>
            </button>
            
            <button class="vnedu-btn-key-3d" id="vnedu-btn-key" title="Bản quyền phần mềm">
              <span class="btn-key-outer-bezel">
                <span class="btn-key-inner-core">
                  <span class="btn-key-emoji">🔑</span>
                </span>
              </span>
            </button>
          </div>
        </div>

        <!-- Quả Cầu Bé Bút Thò Mặt Tự Động Ẩn Sau 15s (Peeking Dock Chuẩn Ảnh 2) -->
        <div class="vnedu-peeking-dock" id="vnedu-peeking-dock" title="Bé Bút đang chờ Thầy/Cô! Bấm hoặc rê chuột vào để mở lại" style="display: none;">
          <div class="peeking-dock-bubble">
            <img class="peeking-dock-img" id="peeking-dock-img" src="${peekingMascotUrl}" alt="Bé Bút AI" />
          </div>
        </div>
      </div>

      <!-- Cửa sổ kích hoạt bản quyền -->
      <div class="vnedu-modal-backdrop" id="vnedu-license-modal" style="display: none;">
        <div class="vnedu-modal-box">
          <div class="vnedu-modal-header">
            <div class="modal-title">
              <img src="${mascotUrl}" class="modal-title-mascot" alt="" />
              <span>🔑 KÍCH HOẠT BẢN QUYỀN</span>
            </div>
            <button class="btn-modal-close" id="btn-close-license-modal">✕</button>
          </div>
          <div class="vnedu-modal-body">
            <div id="vnedu-account-badge" class="modal-account-badge" style="display: none;"></div>
            <div id="license-active-info" class="modal-status-badge" style="display: none;"></div>
            <label class="modal-label" for="vnedu-key-input">Mã kích hoạt bản quyền:</label>
            <input type="text" id="vnedu-key-input" placeholder="Dán mã bản quyền vào đây..." class="modal-input" />
            <div id="vnedu-key-error" class="modal-error"></div>
            <button id="vnedu-key-submit" class="modal-submit-btn-3d">
              <span>Kích hoạt ngay</span>
              <span>✨</span>
            </button>
            <div id="license-clear-row" style="margin-top: 6px; text-align: center; display: none;">
              <button type="button" id="btn-clear-license" class="modal-secondary-link">Đổi mã bản quyền / Hủy kích hoạt</button>
            </div>

            <!-- Đồng bộ dữ liệu nhận xét trực tuyến qua GitHub -->
            <div class="modal-cloud-sync-card" id="modal-cloud-sync-card" style="margin-top: 14px; padding: 10px 12px; background: rgba(30, 41, 59, 0.75); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 12px; text-align: left;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span style="font-size: 11.5px; font-weight: 700; color: #38BDF8;">🌐 ĐỒNG BỘ DỮ LIỆU ĐÁM MÂY (GITHUB)</span>
                <span id="cloud-sync-status-badge" style="font-size: 10.5px; padding: 2px 7px; border-radius: 6px; background: rgba(16, 185, 129, 0.2); color: #34D399; font-weight: 600;">Sẵn sàng</span>
              </div>
              <div id="cloud-sync-version-info" style="font-size: 11px; color: #94A3B8; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                <span>Dữ liệu: <b style="color: #F8FAFC;" id="cloud-sync-ver-num">2026.11.04.3</b></span>
                <span>Tiện ích: <b style="color: #38BDF8;" id="cloud-sync-app-ver">v1.2.7</b></span>
              </div>
              <button type="button" id="btn-trigger-cloud-sync" style="width: 100%; padding: 7px 10px; font-size: 12px; font-weight: 700; color: #F8FAFC; background: linear-gradient(135deg, #0284C7 0%, #0369A1 100%); border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 8px; cursor: pointer; transition: all 0.2s ease;">
                🔄 Kiểm tra &amp; Đồng bộ dữ liệu mới
              </button>
              <button type="button" id="btn-reload-extension" style="width: 100%; margin-top: 6px; padding: 5px 8px; font-size: 11px; font-weight: 600; color: #94A3B8; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 6px; cursor: pointer; transition: all 0.2s ease;">
                ⚡ Nạp lại tiện ích ngay (Sau khi chạy cập nhật)
              </button>
              <div id="cloud-sync-msg" style="font-size: 11px; color: #FCD34D; margin-top: 6px; display: none; line-height: 1.4;"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Hộp thoại xác nhận sau khi điền nhận xét phẩm chất - năng lực từng học sinh -->
      <div class="vnedu-modal-backdrop" id="vnedu-confirm-save-modal" style="display: none;">
        <div class="vnedu-modal-box vnedu-confirm-box">
          <div class="vnedu-modal-header confirm-header">
            <div class="modal-title">💾 XÁC NHẬN LƯU NHẬN XÉT PHẨM CHẤT - NĂNG LỰC</div>
            <button class="btn-modal-close" id="btn-close-confirm-save" title="Đóng [Esc]">✕</button>
          </div>
          <div class="vnedu-modal-body confirm-body">
            <div class="confirm-student-badge" id="confirm-student-info"></div>
            <div class="confirm-prompt-msg">
              Đã điền xong nhận xét phẩm chất - năng lực cho học sinh.<br>
              Tự động lưu và chuyển sang học sinh tiếp theo sau: <b id="confirm-countdown-num" style="color: #38BDF8; font-size: 16px;">3</b> giây:
            </div>
            <div class="confirm-actions-row">
              <button type="button" id="btn-confirm-save-continue" class="btn-confirm-save-primary" title="Tự động đếm 3s lưu và chuyển sang học sinh tiếp theo (hoặc bấm ngay)">
                ✓ Tự động lưu &amp; chuyển tiếp <span class="countdown-badge">(3s)</span> <span class="kbd-hint">[Enter]</span>
              </button>
              <button type="button" id="btn-confirm-save-exit" class="btn-confirm-save-success" title="Lưu nhận xét cho học sinh này trên vnEdu và dừng lại ngay lập tức">
                💾 Lưu và dừng lại <span class="kbd-hint">[Shift+Enter]</span>
              </button>
              <button type="button" id="btn-confirm-cancel" class="btn-confirm-save-secondary" title="Dừng lại và không lưu học sinh này trên vnEdu">
                ✕ Không lưu (Dừng lại) <span class="kbd-hint">[Esc]</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    shadowRoot.appendChild(shellEl);

    bindEvents(deps);

    // Đồng bộ cấp học và đợt đánh giá từ chrome.storage nếu có
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['vnedu_selected_education_level', 'vnedu_selected_period']).then(res => {
        if (res && res.vnedu_selected_education_level) {
          currentEducationLevel = res.vnedu_selected_education_level;
          updateLevelSelectorUI();
        }
        if (res && res.vnedu_selected_period) {
          currentPeriod = res.vnedu_selected_period;
          updatePeriodSelectorUI();
        }
        updateMainButtonUI();
      }).catch(() => {});
    }

    // Kiểm tra bản quyền ngay khi khởi tạo và tự động kiểm tra định kỳ trong vài giây đầu để đồng bộ từ ExtJS Desktop
    checkLicenseStatus((activated) => {
      updateMainButtonUI();
    });

    window.addEventListener('VNEDU_USER_DETECTED', () => {
      if (!isFillingActive) {
        checkLicenseStatus(() => updateMainButtonUI());
      }
    });

    [600, 2000].forEach(delay => {
      setTimeout(() => {
        if (!isFillingActive) {
          checkLicenseStatus(() => updateMainButtonUI());
        }
      }, delay);
    });

    // Tự động kiểm tra bản quyền định kỳ mỗi 1.5s để cập nhật ngay khi Thầy/Cô mở hoặc chuyển sổ điểm
    setInterval(() => {
      if (!isFillingActive) {
        checkLicenseStatus(() => updateMainButtonUI());
      }
    }, 1500);

    // Tự động nạp dữ liệu đám mây đã lưu và kiểm tra bản cập nhật mới từ xa (GitHub)
    const cloudSync = (deps && deps.CloudSync) || (typeof self !== 'undefined' && self.VnEduCloudSync) || (typeof window !== 'undefined' && window.VnEduCloudSync);
    if (cloudSync) {
      cloudSync.loadStoredData().then(() => {
        cloudSync.checkAndUpdate(false).then(res => {
          if (res && res.hasAppUpdate) {
            const mascotSpeech = shadowRoot.getElementById('vnedu-mascot-speech');
            if (mascotSpeech) {
              mascotSpeech.textContent = `🚀 Có bản nâng cấp v${res.remoteAppVersion}! Hãy chạy Cap-Nhat-Tien-Ich.bat`;
              mascotSpeech.style.opacity = '1';
              setTimeout(() => { mascotSpeech.style.opacity = ''; }, 8000);
            }
          } else if (res && res.updated && res.remoteData) {
            const mascotSpeech = shadowRoot.getElementById('vnedu-mascot-speech');
            if (mascotSpeech) {
              mascotSpeech.textContent = 'Đã cập nhật dữ liệu nhận xét mới! ✨';
              mascotSpeech.style.opacity = '1';
              setTimeout(() => { mascotSpeech.style.opacity = ''; }, 6000);
            }
          }
        }).catch(() => {});
      }).catch(() => {});
    }
  }

  return {
    initOverlay,
    triggerScan: (deps) => {
      if (!isFillingActive) {
        checkLicenseStatus();
      }
    },
    triggerFill: (deps) => {
      handleQuickFill(deps || activeDeps);
    },
    setEducationLevel,
    getEducationLevel: () => currentEducationLevel,
    setPeriod,
    getPeriod: () => currentPeriod,
    openLicenseModal,
    ensureLockScreenIfUnlicensed: () => {
      checkLicenseStatus((activated, record, reason, details) => {
        if (!activated) openLicenseModal(details);
      });
    },
    checkLicenseStatus,
    saveLicenseKey,
    clearLicenseKey
  };
});