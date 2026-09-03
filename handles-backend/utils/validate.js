// Small dependency-free validation helpers shared across routes.

function isNonEmptyString(v, maxLen = 500) {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= maxLen;
}

function isEmail(v) {
  if (typeof v !== 'string' || v.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function isUrl(v) {
  if (typeof v !== 'string' || v.length > 2048) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Firebase RTDB keys cannot contain . # $ [ ] / or control characters.
function sanitizeEmailKey(email) {
  return email
    .trim()
    .toLowerCase()
    .replace(/\./g, ',')
    .replace(/#/g, ';')
    .replace(/\$/g, ':')
    .replace(/\[/g, '{')
    .replace(/\]/g, '}')
    .replace(/\//g, '|');
}

// Strip/limit a dynamic submission payload so visitors can't send
// arbitrarily large or deeply nested junk into the database.
function sanitizeSubmissionFields(rawFields, allowedFieldNames) {
  const clean = {};
  if (!rawFields || typeof rawFields !== 'object') return clean;

  const allowed = new Set(allowedFieldNames);
  let count = 0;

  for (const key of Object.keys(rawFields)) {
    if (count >= 50) break; // hard cap on number of fields
    if (allowed.size > 0 && !allowed.has(key)) continue;

    const value = rawFields[key];
    if (typeof value === 'string') {
      clean[key] = value.slice(0, 5000);
      count++;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      clean[key] = value;
      count++;
    }
    // silently drop objects/arrays/functions - forms should be flat
  }
  return clean;
}

module.exports = {
  isNonEmptyString,
  isEmail,
  isUrl,
  sanitizeEmailKey,
  sanitizeSubmissionFields
};
