/**
 * Content Script Entry Point for vnEdu
 */
(async function () {
  // Prevent double injection
  if (window.__VNEDU_ASSISTANT_INITIALIZED__) {
    return;
  }
  window.__VNEDU_ASSISTANT_INITIALIZED__ = true;

  // Grab dependencies from window / global scope
  const Logger = window.VnEduLogger;
  const Storage = window.VnEduStorage;
  const VietnameseNameDetector = window.VietnameseNameDetector;
  const Confidence = window.VnEduConfidence;
  const DOMUtils = window.VnEduDOMUtils;
  const QualityChecker = window.VnEduQualityChecker;
  const Circular27Rules = window.VnEduCircular27Rules;
  const CompetencyInference = window.VnEduCompetencyInference;
  const BaseAdapter = window.VnEduBaseAdapter;
  const TableAdapter = window.VnEduTableAdapter;
  const GridAdapter = window.VnEduGridAdapter;
  const FormAdapter = window.VnEduFormAdapter;
  const PageDetector = window.VnEduPageDetector;
  const DOMScanner = window.VnEduDOMScanner;
  const SelectorMemory = window.VnEduSelectorMemory;
  const DOMInspector = window.VnEduDOMInspector;
  const MutationObserver = window.VnEduMutationObserver;
  const FillEngine = window.VnEduFillEngine;
  const OfflineTemplates = window.VnEduOfflineTemplates;
  const PromptBuilder = window.VnEduPromptBuilder;
  const AIProvider = window.VnEduAIProvider;
  const CommentGenerator = window.VnEduCommentGenerator;
  const ExcelHandler = window.VnEduExcelHandler;
  const SampleTemplate = window.VnEduSampleTemplate;
  const ExcelBankImporter = window.VnEduExcelBankImporter;
  const LicenseManager = window.VnEduLicenseManager;
  const CloudSync = window.VnEduCloudSync;
  const Overlay = window.VnEduOverlay;

  if (Logger) Logger.info('Khởi động Trợ lý nhận xét học sinh vnEdu (Lớp 1 - 12)...');

  // Fetch overlay CSS
  let cssContent = '';
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      const cssUrl = chrome.runtime.getURL('src/ui/overlay.css');
      const resp = await fetch(cssUrl);
      if (resp.ok) {
        cssContent = await resp.text();
      }
    }
  } catch (e) {
    if (Logger) Logger.warn('Không thể nạp file overlay.css qua chrome.runtime, sử dụng fallback CSS');
  }

  // Fallback CSS if fetch failed
  if (!cssContent) {
    cssContent = `
      :host { font-family: sans-serif; color: #1e293b; }
      .vnedu-fab { position: fixed; bottom: 20px; right: 20px; background: #2563eb; color: #fff; padding: 10px 16px; border-radius: 20px; border: none; font-weight: bold; cursor: pointer; z-index: 2147483640; }
      .vnedu-panel { position: fixed; bottom: 20px; right: 20px; width: 460px; height: 600px; background: #fff; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); z-index: 2147483641; display: flex; flex-direction: column; }
    `;
  }

  // Dependency container for Overlay
  const deps = {
    cssContent,
    Logger,
    Storage,
    VietnameseNameDetector,
    Confidence,
    DOMUtils,
    QualityChecker,
    Circular27Rules,
    CompetencyInference,
    BaseAdapter,
    PageDetector,
    DOMScanner,
    SelectorMemory,
    DOMInspector,
    FillEngine,
    OfflineTemplates,
    PromptBuilder,
    AIProvider,
    CommentGenerator,
    ExcelHandler,
    SampleTemplate,
    ExcelBankImporter,
    LicenseManager,
    CloudSync,
    mascotUrl: (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) ? chrome.runtime.getURL('icons/ai-mascot.png') : '',
    peekingMascotUrl: (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) ? chrome.runtime.getURL('icons/tro-li-but.png') : ''
  };

  // Check page type: If strict login page, do NOT inject
  const pageCheck = PageDetector.detectCurrentPage();
  if (pageCheck.type === 'LOGIN') {
    if (Logger) Logger.info('Phát hiện trang đăng nhập: Tạm dừng tiêm UI để bảo đảm an toàn thông tin.');
    return;
  }

  // Nạp các câu nhận xét tùy chỉnh / thay thế của Giáo Viên vào OfflineTemplates
  try {
    if (Storage && OfflineTemplates && typeof Storage.getCustomReplacements === 'function' && typeof OfflineTemplates.applyCustomReplacements === 'function') {
      const customReps = await Storage.getCustomReplacements();
      if (Array.isArray(customReps) && customReps.length > 0) {
        OfflineTemplates.applyCustomReplacements(customReps);
        if (Logger) Logger.info('Đã nạp ' + customReps.length + ' câu nhận xét tùy chỉnh của Thầy/Cô vào ngân hàng.');
      }
    }
  } catch (e) {}

  // Nạp ngân hàng lời nhận xét từ file Excel (nếu Thầy/Cô đã nhập trước đó)
  try {
    if (ExcelBankImporter && OfflineTemplates) {
      const appliedCount = await ExcelBankImporter.applyStoredBank(OfflineTemplates);
      if (appliedCount > 0 && Logger) {
        Logger.info(`Đã nạp ${appliedCount} câu nhận xét từ ngân hàng Excel vào OfflineTemplates.`);
      }
    }
  } catch (e) {}

  // Initialize UI Overlay
  Overlay.initOverlay(deps);

  // Setup DOM Mutation Observer
  if (MutationObserver) {
    MutationObserver.initObserver(() => {
      if (Logger) Logger.info('DOM thay đổi, tiến hành quét lại trang...');
      Overlay.triggerScan(deps);
    });
    MutationObserver.start();
  }

  // Listen to messages from background service worker / popup
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      (async () => {
        if (request.action === 'SET_EDUCATION_LEVEL') {
          Overlay.setEducationLevel?.(request.level, true);
          sendResponse({ success: true, level: request.level });
        } else if (request.action === 'GET_EDUCATION_LEVEL') {
          const level = Overlay.getEducationLevel?.() || 'PRIMARY';
          sendResponse({ success: true, level });
        } else if (request.action === 'SET_PERIOD') {
          Overlay.setPeriod?.(request.period, true);
          sendResponse({ success: true, period: request.period });
        } else if (request.action === 'GET_PERIOD') {
          const period = Overlay.getPeriod?.() || 'GK1';
          sendResponse({ success: true, period });
        } else if (request.action === 'FILL_COMMENTS') {
          Overlay.triggerFill(deps);
          sendResponse({ success: true });
        } else if (request.action === 'CHECK_LICENSE') {
          Overlay.checkLicenseStatus?.((licensed, record, reason, details) => {
            sendResponse({ success: true, licensed, record, reason, details });
          });
        } else if (request.action === 'OPEN_LICENSE') {
          Overlay.openLicenseModal?.();
          sendResponse({ success: true });
        } else if (request.action === 'OPEN_UPDATE_PANEL' || request.action === 'CHECK_VERSION') {
          if (typeof Overlay.openUpdateModal === 'function') {
            Overlay.openUpdateModal();
          } else {
            Overlay.openLicenseModal?.();
          }
          sendResponse({ success: true });
        } else if (request.action === 'OPEN_PANEL') {
          Overlay.triggerFill(deps);
          sendResponse({ success: true });
        } else if (request.action === 'SCAN_PAGE') {
          const report = await DOMScanner.scanPage();
          sendResponse({ success: true, report });
        } else if (request.action === 'GET_PAGE_STATUS') {
          const pageType = PageDetector.detectCurrentPage();
          sendResponse({ success: true, pageType });
        } else {
          sendResponse({ success: false, reason: 'Lệnh không xác định' });
        }
      })();
      return true; // Keep channel open for async sendResponse
    });
  }
})();
