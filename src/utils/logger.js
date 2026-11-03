/**
 * Safe Logger for vnEdu Assistant
 * Never logs sensitive credentials, passwords, tokens, or cookies.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VnEduLogger = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const LOG_PREFIX = '[vnEdu AI Assistant]';
  let debugMode = false;
  const logHistory = [];
  const MAX_HISTORY = 200;

  function sanitize(data) {
    if (!data) return data;
    if (typeof data === 'string') {
      return data
        .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer ***')
        .replace(/(password|token|otp|captcha|cookie)=[^&;\s]+/gi, '$1=***');
    }
    if (typeof data === 'object') {
      try {
        const copy = JSON.parse(JSON.stringify(data));
        const sanitizeObj = (obj) => {
          for (const k in obj) {
            if (/password|token|otp|captcha|cookie|secret/i.test(k)) {
              obj[k] = '***';
            } else if (typeof obj[k] === 'object' && obj[k] !== null) {
              sanitizeObj(obj[k]);
            }
          }
        };
        sanitizeObj(copy);
        return copy;
      } catch (e) {
        return '[Object]';
      }
    }
    return data;
  }

  function addHistory(level, message, detail) {
    const entry = {
      time: new Date().toLocaleTimeString('vi-VN'),
      level,
      message,
      detail: sanitize(detail)
    };
    logHistory.push(entry);
    if (logHistory.length > MAX_HISTORY) {
      logHistory.shift();
    }
  }

  return {
    setDebug: function (enabled) {
      debugMode = !!enabled;
    },
    isDebug: function () {
      return debugMode;
    },
    info: function (message, detail) {
      addHistory('INFO', message, detail);
      if (debugMode) {
        console.log(`${LOG_PREFIX} ℹ️ ${message}`, detail !== undefined ? sanitize(detail) : '');
      }
    },
    warn: function (message, detail) {
      addHistory('WARN', message, detail);
      if (debugMode) {
        console.log(`${LOG_PREFIX} ⚠️ ${message}`, detail !== undefined ? sanitize(detail) : '');
      }
    },
    error: function (message, error) {
      addHistory('ERROR', message, error ? error.message || error : '');
      // Dùng console.log để tránh Edge/Chrome ghi nhận thành Error trong trang quản trị tiện ích
      if (debugMode) {
        console.log(`${LOG_PREFIX} [Lỗi] ${message}`, error);
      }
    },
    success: function (message, detail) {
      addHistory('SUCCESS', message, detail);
      console.log(`${LOG_PREFIX} ✅ ${message}`, detail !== undefined ? sanitize(detail) : '');
    },
    getHistory: function () {
      return [...logHistory];
    },
    clearHistory: function () {
      logHistory.length = 0;
    }
  };
});
