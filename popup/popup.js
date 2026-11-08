/**
 * Popup Script (Manifest V3 - Phiên bản v1.4.1)
 */
document.addEventListener('DOMContentLoaded', async () => {
  const statusTitle = document.getElementById('status-title');
  const statusDesc = document.getElementById('status-desc');
  const btnCheckVersion = document.getElementById('btn-check-version');
  const btnCheckIcon = document.getElementById('btn-check-icon');
  const btnCheckText = document.getElementById('btn-check-text');
  const btnActivate = document.getElementById('btn-activate-license');
  const footerVersion = document.getElementById('footer-version');

  // Version panel elements
  const versionPanel = document.getElementById('version-panel');
  const vpBadge = document.getElementById('vp-badge');
  const vpCurrentVer = document.getElementById('vp-current-ver');
  const vpRemoteVer = document.getElementById('vp-remote-ver');
  const vpDataVer = document.getElementById('vp-data-ver');
  const vpMsg = document.getElementById('vp-msg');
  const btnRunUpdater = document.getElementById('btn-run-updater');

  let activeTab = null;
  let currentAppVer = '1.4.1';

  // 1. Hiển thị phiên bản từ manifest tự động
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
      const mf = chrome.runtime.getManifest();
      if (mf && mf.version) {
        currentAppVer = mf.version;
        if (footerVersion) footerVersion.textContent = 'v' + mf.version;
        if (vpCurrentVer) vpCurrentVer.textContent = 'v' + mf.version;
      }
    }
  } catch (e) {}

  // 2. Kiểm tra tab hiện tại & bản quyền
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tab;

    const isVnEdu = tab?.url && /vnedu\.vn|localhost|127\.0\.0\.1|test-vnedu/.test(tab.url);

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
      if (btnCheckVersion) btnCheckVersion.style.display = 'flex';
      if (btnActivate) btnActivate.style.display = 'none';
    } else {
      // Khi chưa kích hoạt, vẫn cho phép kiểm tra phiên bản và hiện nút kích hoạt
      if (btnCheckVersion) btnCheckVersion.style.display = 'flex';
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
    if (statusTitle) {
      statusTitle.textContent = 'Trợ lý nhận xét vnEdu';
      statusDesc.textContent = 'Sẵn sàng kiểm tra phiên bản cập nhật.';
    }
  }

  // 3. Hàm thực hiện kiểm tra phiên bản
  async function performVersionCheck() {
    if (versionPanel) versionPanel.style.display = 'flex';
    if (vpBadge) {
      vpBadge.className = 'version-badge';
      vpBadge.textContent = 'Đang kiểm tra...';
    }
    if (vpRemoteVer) vpRemoteVer.textContent = 'Đang kết nối...';
    if (vpMsg) vpMsg.style.display = 'none';
    if (btnRunUpdater) btnRunUpdater.style.display = 'none';

    if (btnCheckText) btnCheckText.textContent = 'Đang kiểm tra...';
    if (btnCheckIcon) btnCheckIcon.textContent = '⏳';

    // Nếu đang ở tab vnEdu: gửi lệnh mở bảng kiểm tra cập nhật trên trang vnEdu
    if (activeTab?.id) {
      try {
        chrome.tabs.sendMessage(activeTab.id, { action: 'OPEN_UPDATE_PANEL' });
      } catch (e) {}
    }

    const cloudSync = window.VnEduCloudSync;
    if (cloudSync) {
      try {
        const res = await cloudSync.checkAndUpdate(true);
        if (btnCheckText) btnCheckText.textContent = 'Kiểm Tra Phiên Bản';
        if (btnCheckIcon) btnCheckIcon.textContent = '🔄';

        const info = await cloudSync.getSyncInfo().catch(() => null);
        if (info && info.currentVersion && vpDataVer) {
          vpDataVer.textContent = info.currentVersion;
        }

        if (res.error) {
          if (vpBadge) {
            vpBadge.className = 'version-badge';
            vpBadge.textContent = 'Ngoại tuyến';
          }
          if (vpRemoteVer) vpRemoteVer.textContent = 'Không có kết nối';
          if (vpMsg) {
            vpMsg.className = 'vp-msg warning';
            vpMsg.style.display = 'block';
            vpMsg.textContent = '⚠️ Không thể kết nối máy chủ GitHub. Tiện ích đang sử dụng dữ liệu nội bộ ổn định.';
          }
          return;
        }

        if (res.hasAppUpdate) {
          if (vpBadge) {
            vpBadge.className = 'version-badge has-update';
            vpBadge.textContent = 'Có bản mới!';
          }
          if (vpRemoteVer) {
            vpRemoteVer.style.color = '#F59E0B';
            vpRemoteVer.textContent = 'v' + res.remoteAppVersion;
          }
          if (vpMsg) {
            vpMsg.className = 'vp-msg warning';
            vpMsg.style.display = 'block';
            vpMsg.innerHTML = `🚀 <b>Có phiên bản mới (v${res.remoteAppVersion})!</b><br>Máy Thầy/Cô đang dùng v${res.localAppVersion || currentAppVer}. Bấm nút bên dưới để cập nhật nhanh:`;
          }
          if (btnRunUpdater) btnRunUpdater.style.display = 'block';
        } else {
          if (vpBadge) {
            vpBadge.className = 'version-badge is-latest';
            vpBadge.textContent = 'Bản mới nhất';
          }
          if (vpRemoteVer) {
            vpRemoteVer.style.color = '#10B981';
            vpRemoteVer.textContent = 'v' + (res.remoteAppVersion || res.localAppVersion || currentAppVer);
          }
          if (vpMsg) {
            vpMsg.className = 'vp-msg success';
            vpMsg.style.display = 'block';
            if (res.updated) {
              vpMsg.textContent = `✓ Đã tự động cập nhật ngân hàng dữ liệu mới (${res.currentVersion})! Tiện ích đang ở phiên bản mới nhất v${currentAppVer}.`;
            } else {
              vpMsg.textContent = `✓ Thầy/Cô đang sử dụng phiên bản mới nhất (v${currentAppVer})! Hệ thống vận hành ổn định.`;
            }
          }
        }
      } catch (err) {
        if (btnCheckText) btnCheckText.textContent = 'Kiểm Tra Phiên Bản';
        if (btnCheckIcon) btnCheckIcon.textContent = '🔄';
        if (vpMsg) {
          vpMsg.className = 'vp-msg error';
          vpMsg.style.display = 'block';
          vpMsg.textContent = '❌ Lỗi kiểm tra: ' + err.message;
        }
      }
    } else {
      if (btnCheckText) btnCheckText.textContent = 'Kiểm Tra Phiên Bản';
      if (btnCheckIcon) btnCheckIcon.textContent = '🔄';
      if (vpBadge) {
        vpBadge.className = 'version-badge is-latest';
        vpBadge.textContent = 'v' + currentAppVer;
      }
      if (vpMsg) {
        vpMsg.className = 'vp-msg success';
        vpMsg.style.display = 'block';
        vpMsg.textContent = `✓ Đang sử dụng phiên bản v${currentAppVer}.`;
      }
    }
  }

  // 4. Bắt sự kiện bấm nút Kiểm Tra Phiên Bản
  btnCheckVersion?.addEventListener('click', performVersionCheck);

  // 5. Nút kích hoạt file Cap-Nhat-Tien-Ich.bat
  btnRunUpdater?.addEventListener('click', () => {
    try {
      window.location.href = 'vnedu-updater://run';
    } catch (e) {}
  });

  // 6. Nút Kích hoạt bản quyền
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
