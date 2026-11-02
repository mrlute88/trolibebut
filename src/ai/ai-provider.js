/**
 * AI Provider
 * Communicates directly with Google Gemini API or OpenAI API
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VnEduAIProvider = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  async function callGemini(apiKey, prompt, model = 'gemini-1.5-flash') {
    if (!apiKey) throw new Error('Chưa cấu hình Google Gemini API Key.');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 200
        }
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Gemini API lỗi (${response.status}): ${errBody.substring(0, 150)}`);
    }

    const data = await response.json();
    const candidate = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidate) {
      throw new Error('Gemini API không trả về nội dung nhận xét.');
    }

    return candidate.trim().replace(/^["']|["']$/g, '');
  }

  async function callOpenAI(apiKey, prompt, model = 'gpt-4o-mini') {
    if (!apiKey) throw new Error('Chưa cấu hình OpenAI API Key.');

    const url = 'https://api.openai.com/v1/chat/completions';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 200
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`OpenAI API lỗi (${response.status}): ${errBody.substring(0, 150)}`);
    }

    const data = await response.json();
    const candidate = data?.choices?.[0]?.message?.content;
    if (!candidate) {
      throw new Error('OpenAI API không trả về nội dung nhận xét.');
    }

    return candidate.trim().replace(/^["']|["']$/g, '');
  }

  return {
    callGemini,
    callOpenAI
  };
});
