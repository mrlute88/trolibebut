/**
 * Comment Generator
 * Orchestrates AI API and Offline Templates with automatic fallback and quality validation.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./prompt-builder'),
      require('./ai-provider'),
      require('./offline-templates'),
      require('../utils/quality-checker'),
      require('../utils/logger')
    );
  } else {
    root.VnEduCommentGenerator = factory(
      root.VnEduPromptBuilder,
      root.VnEduAIProvider,
      root.VnEduOfflineTemplates,
      root.VnEduQualityChecker,
      root.VnEduLogger
    );
  }
})(typeof self !== 'undefined' ? self : this, function (
  PromptBuilder,
  AIProvider,
  OfflineTemplates,
  QualityChecker,
  Logger
) {
  async function generateSingleComment(studentData, config = {}) {
    const {
      aiProvider = 'offline',
      geminiApiKey = '',
      openaiApiKey = '',
      aiModel = 'gemini-1.5-flash',
      anonymizeStudentNamesForAI = true,
      studentIndex = 0
    } = config;

    let comment = '';
    let source = 'offline';

    if (aiProvider === 'gemini' && geminiApiKey) {
      try {
        const prompt = PromptBuilder.buildPrompt(studentData, { anonymize: anonymizeStudentNamesForAI });
        comment = await AIProvider.callGemini(geminiApiKey, prompt, aiModel);
        source = 'gemini';
      } catch (e) {
        if (Logger) Logger.warn('Gemini API thất bại, chuyển sang mẫu Offline:', e.message);
      }
    } else if (aiProvider === 'openai' && openaiApiKey) {
      try {
        const prompt = PromptBuilder.buildPrompt(studentData, { anonymize: anonymizeStudentNamesForAI });
        comment = await AIProvider.callOpenAI(openaiApiKey, prompt, aiModel);
        source = 'openai';
      } catch (e) {
        if (Logger) Logger.warn('OpenAI API thất bại, chuyển sang mẫu Offline:', e.message);
      }
    }

    // Offline fallback or primary mode
    if (!comment) {
      comment = OfflineTemplates.getCommentForStudent(
        studentData.subject,
        studentData.achievement || 'H',
        studentIndex,
        {
          period: config.period || studentData.period || 'GK1',
          educationLevel: config.educationLevel || studentData.educationLevel || 'PRIMARY',
          grade: config.grade || studentData.grade || '',
          strength: studentData.strength || '',
          progress: studentData.progress || '',
          improvement: studentData.weakness || ''
        }
      );
      source = 'offline';
    }

    if (comment && comment.length > 90 && OfflineTemplates && typeof OfflineTemplates.clampToMaxLength === 'function') {
      comment = OfflineTemplates.clampToMaxLength(comment, 90);
    }

    // Quality check
    let quality = { valid: true, errors: [] };
    if (QualityChecker) {
      quality = QualityChecker.validateComment(comment);
    }

    return {
      comment,
      source,
      valid: quality.valid,
      errors: quality.errors
    };
  }

  async function generateBatchComments(students = [], config = {}, onProgress = null) {
    if (OfflineTemplates && typeof OfflineTemplates.resetSessionPool === 'function') {
      OfflineTemplates.resetSessionPool();
    }

    const results = [];
    const total = students.length;

    for (let i = 0; i < total; i++) {
      const student = students[i];
      const res = await generateSingleComment(student, { ...config, studentIndex: i });

      results.push({
        studentId: student.studentId || `hs_${i + 1}`,
        studentName: student.studentName || `Học sinh ${i + 1}`,
        ...res
      });

      if (typeof onProgress === 'function') {
        onProgress({ current: i + 1, total, percent: Math.round(((i + 1) / total) * 100) });
      }
    }

    return results;
  }

  return {
    generateSingleComment,
    generateBatchComments
  };
});
