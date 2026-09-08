const { isEmail, sanitizeSubmissionFields } = require('./validate');

function getConfiguredFields(formFields) {
  if (Array.isArray(formFields)) return formFields.filter(Boolean);
  if (formFields && typeof formFields === 'object') return Object.values(formFields).filter(Boolean);
  return [];
}

function comparableFieldName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function mapIncomingFieldNames(rawFields, fields) {
  if (!rawFields || typeof rawFields !== 'object' || Array.isArray(rawFields)) return {};

  const aliases = new Map();
  fields.forEach((field) => {
    if (!field || !field.name) return;
    aliases.set(comparableFieldName(field.name), field.name);
    if (field.label) aliases.set(comparableFieldName(field.label), field.name);
  });

  const mapped = {};
  Object.keys(rawFields).forEach((key) => {
    if (key === 'handles_hp') return;
    const target = fields.some((field) => field && field.name === key)
      ? key
      : aliases.get(comparableFieldName(key));
    if (target && mapped[target] === undefined) mapped[target] = rawFields[key];
  });
  return mapped;
}

function isEmptyValue(value) {
  return value === undefined || value === null ||
    (typeof value === 'string' && value.trim() === '');
}

function validateConfiguredSubmission(rawFields, fieldDefinitions, options = {}) {
  const strictTypes = options.strictTypes === true;
  const data = sanitizeSubmissionFields(
    mapIncomingFieldNames(rawFields, fieldDefinitions),
    fieldDefinitions.map((field) => field && field.name).filter(Boolean)
  );

  const requiredMissing = fieldDefinitions
    .filter((field) => field.required)
    .filter((field) => isEmptyValue(data[field.name]));
  if (requiredMissing.length) {
    return {
      error: `Missing required field(s): ${requiredMissing.map((field) => field.label).join(', ')}`
    };
  }

  for (const field of fieldDefinitions) {
    const value = data[field.name];
    if (isEmptyValue(value)) continue;

    if (strictTypes && field.type === 'email' && !isEmail(String(value))) {
      return { error: `${field.label || field.name} must be a valid email address.` };
    }
    if (strictTypes && field.type === 'number' && (typeof value === 'boolean' || value === '' || !Number.isFinite(Number(value)))) {
      return { error: `${field.label || field.name} must be a number.` };
    }
    if (strictTypes && field.type === 'checkbox' && typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
      return { error: `${field.label || field.name} must be true or false.` };
    }
  }

  if (Object.keys(data).length === 0) {
    return { error: 'Submission contained no valid fields.' };
  }
  return { data };
}

function publicSubmission(id, submission) {
  const { userId, ip, ...safe } = submission;
  return { id, ...safe };
}

module.exports = {
  getConfiguredFields,
  mapIncomingFieldNames,
  validateConfiguredSubmission,
  publicSubmission
};