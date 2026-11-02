/**
 * Options Script
 */
document.addEventListener('DOMContentLoaded', async () => {
  const chkAnonymize = document.getElementById('chk-anonymize');
  const inpDelay = document.getElementById('inp-delay');
  const chkMultiPage = document.getElementById('chk-multipage');
  const chkStrictCheck = document.getElementById('chk-strict-check');
  const selProvider = document.getElementById('sel-provider');
  const inpGeminiKey = document.getElementById('inp-gemini-key');
  const inpOpenAIKey = document.getElementById('inp-openai-key');
  const groupGemini = document.getElementById('group-gemini');
  const groupOpenAI = document.getElementById('group-openai');
  const btnSave = document.getElementById('btn-save');
  const btnReset = document.getElementById('btn-reset');
  const saveStatus = document.getElementById('save-status');

  function updateProviderVisibility() {
    const val = selProvider.value;
    groupGemini.style.display = val === 'gemini' ? 'block' : 'none';
    groupOpenAI.style.display = val === 'openai' ? 'block' : 'none';
  }

  selProvider.addEventListener('change', updateProviderVisibility);

  // Load existing settings
  const { vnedu_settings = {} } = await chrome.storage.local.get('vnedu_settings');

  chkAnonymize.checked = vnedu_settings.anonymizeStudentNamesForAI !== false;
  inpDelay.value = vnedu_settings.fillDelayMs || 450;
  chkMultiPage.checked = !!vnedu_settings.enableMultiPage;
  chkStrictCheck.checked = vnedu_settings.strictRowNameCheck !== false;
  selProvider.value = vnedu_settings.aiProvider || 'offline';
  inpGeminiKey.value = vnedu_settings.geminiApiKey || '';
  inpOpenAIKey.value = vnedu_settings.openaiApiKey || '';

  updateProviderVisibility();

  // Save settings
  btnSave.addEventListener('click', async () => {
    const updated = {
      anonymizeStudentNamesForAI: chkAnonymize.checked,
      fillDelayMs: parseInt(inpDelay.value, 10) || 450,
      enableMultiPage: chkMultiPage.checked,
      strictRowNameCheck: chkStrictCheck.checked,
      aiProvider: selProvider.value,
      geminiApiKey: inpGeminiKey.value.trim(),
      openaiApiKey: inpOpenAIKey.value.trim()
    };

    await chrome.storage.local.set({ vnedu_settings: updated });

    saveStatus.textContent = '✓ Đã lưu cài đặt!';
    setTimeout(() => {
      saveStatus.textContent = '';
    }, 2500);
  });

  // Reset settings
  btnReset.addEventListener('click', async () => {
    if (!confirm('Khôi phục lại toàn bộ cài đặt về mặc định?')) return;

    const defaults = {
      anonymizeStudentNamesForAI: true,
      fillDelayMs: 450,
      enableMultiPage: false,
      strictRowNameCheck: true,
      aiProvider: 'offline',
      geminiApiKey: '',
      openaiApiKey: ''
    };

    await chrome.storage.local.set({ vnedu_settings: defaults });

    chkAnonymize.checked = true;
    inpDelay.value = 450;
    chkMultiPage.checked = false;
    chkStrictCheck.checked = true;
    selProvider.value = 'offline';
    inpGeminiKey.value = '';
    inpOpenAIKey.value = '';
    updateProviderVisibility();

    saveStatus.textContent = '✓ Đã khôi phục mặc định!';
    setTimeout(() => {
      saveStatus.textContent = '';
    }, 2500);
  });
});
