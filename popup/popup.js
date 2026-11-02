/**
 * Popup Script (Manifest V3 - Minimalist with Level Selector)
 */
document.addEventListener('DOMContentLoaded', async () => {
  const statusTitle = document.getElementById('status-title');
  const statusDesc = document.getElementById('status-desc');
  const btnFill = document.getElementById('btn-quick-fill');
  const btnActivate = document.getElementById('btn-activate-license');
  let activeTab = null;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tab;

    if (!tab || !tab.url) {
      statusTitle.textContent = 'Không có quyền đọc tab';
      statusDesc.textContent = 'Vui lòng mở trang web để sử dụng.';
      return;
    }

    const isVnEdu = /vnedu\.vn|localhost|127\.0\.0\.1|test-vnedu/.test(tab.url);

    let isLic = false;
    let licenseDetails = null;

    if (isVnEdu && tab.id) {
      try {
        const resp = await chrome.tabs.sendMessage(tab.id, { action: 'CHECK_LICENSE' });
        if (resp && resp.success) {
          isLic = !!resp.licensed;
          licenseDetails = resp.details || null;
        }
      } catch (e) {
        // Tab chưa nạp xong content script
      }
    }

    if (!licenseDetails) {
      try {
        const licData = await chrome.storage.local.get(['vnedu_activated_license_record_v2']);
        const lic = licData?.vnedu_activated_license_record_v2;
        if (lic && lic.key && lic.isMaster) {
          isLic = true;
        }
      } catch (e) {}
    }

    if (isLic) {
      if (btnFill) btnFill.style.display = 'flex';
      if (btnActivate) btnActivate.style.display = 'none';
    } else {
      if (btnFill) btnFill.style.display = 'none';
      if (btnActivate) btnActivate.style.display = 'flex';
    }

    if (isVnEdu) {
      const teacher = licenseDetails?.currentTeacher;
      if (isLic) {
        statusTitle.textContent = teacher ? `✓ vnEdu • GV ${teacher}` : '✓ Đang ở hệ thống vnEdu';
        statusTitle.style.color = '#10B981';
        statusDesc.textContent = 'Bản quyền hợp lệ. Sẵn sàng tự động điền nhận xét học sinh.';
      } else {
        if (licenseDetails && licenseDetails.status === 'TEACHER_MISMATCH') {
          statusTitle.textContent = `🔑 Kích hoạt cho: GV ${teacher}`;
          statusTitle.style.color = '#3B82F6';
          const prev = licenseDetails.savedTeachers?.length > 0
            ? licenseDetails.savedTeachers.map(t => 'GV ' + t.replace(/^(?:gv\.?|thầy|cô)\s*/i, '')).join(', ')
            : (licenseDetails.licensedTeacher ? ('GV ' + licenseDetails.licensedTeacher.replace(/^(?:gv\.?|thầy|cô)\s*/i, '')) : 'khác');
          statusDesc.textContent = `Máy đã lưu bản quyền của ${prev}. Bấm nút bên dưới để kích hoạt cho Thầy/Cô ${teacher}.`;
        } else if (teacher) {
          statusTitle.textContent = `🔑 Chưa kích hoạt: GV ${teacher}`;
          statusTitle.style.color = '#EF4444';
          statusDesc.textContent = `Tài khoản GV ${teacher} chưa được kích hoạt bản quyền. Vui lòng bấm kích hoạt.`;
        } else {
          statusTitle.textContent = '🔑 Chưa kích hoạt bản quyền';
          statusTitle.style.color = '#EF4444';
          statusDesc.textContent = 'Vui lòng mở sổ điểm hoặc bấm Kích hoạt bản quyền.';
        }
      }
    } else {
      statusTitle.textContent = 'ℹ️ Chưa phải trang vnEdu';
      statusTitle.style.color = '#F59E0B';
      statusDesc.textContent = 'Vui lòng đăng nhập và mở sổ đánh giá học sinh trên vnEdu.';
    }
  } catch (err) {
    statusTitle.textContent = 'Lỗi kết nối';
    statusDesc.textContent = err.message;
  }

  btnFill?.addEventListener('click', async () => {
    if (!activeTab?.id) return;
    try {
      await chrome.tabs.sendMessage(activeTab.id, { action: 'FILL_COMMENTS' });
      window.close();
    } catch (e) {
      alert('Không thể kết nối đến trang vnEdu. Hãy tải lại trang (F5) và thử lại.');
    }
  });

  btnActivate?.addEventListener('click', async () => {
    if (!activeTab?.id) return;
    try {
      await chrome.tabs.sendMessage(activeTab.id, { action: 'OPEN_LICENSE' });
      window.close();
    } catch (e) {
      alert('Không thể kết nối đến trang vnEdu. Hãy tải lại trang (F5) và thử lại.');
    }
  });
});
