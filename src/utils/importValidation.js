/**
 * Validate a single meditation card item from JSON
 * Returns array of error strings (empty if valid)
 */
export function validateCardItem(item, index) {
  const errors = [];
  const label = `Item #${index + 1}`;

  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    errors.push(`${label} is not a valid JSON object.`);
    return errors;
  }

  const title = item.title !== undefined ? item.title : item.verse;
  const message = item.message !== undefined ? item.message : item.content;

  // Validate title/verse
  if (title === undefined) {
    errors.push(`${label} is missing the required field 'title' (or 'verse').`);
  } else if (typeof title !== "string" || title.trim() === "") {
    errors.push(`${label} has an invalid 'title' (or 'verse') field: must be a non-empty string.`);
  }

  // Validate message/content
  if (message === undefined) {
    errors.push(`${label} is missing the required field 'message' (or 'content').`);
  } else if (typeof message !== "string" || message.trim() === "") {
    errors.push(`${label} has an invalid 'message' (or 'content') field: must be a non-empty string.`);
  }

  // Validate timeout if provided
  if (item.timeout !== undefined) {
    const timeoutNum = parseInt(item.timeout, 10);
    if (isNaN(timeoutNum) || timeoutNum <= 0) {
      errors.push(`${label} has an invalid 'timeout' field: must be a positive number.`);
    }
  }

  // Validate notes if provided
  if (item.notes !== undefined && typeof item.notes !== "string") {
    errors.push(`${label} has an invalid 'notes' field: must be a string.`);
  }

  return errors;
}

/**
 * Validate entire JSON import file
 * Returns { isValid: bool, errors: string[] }
 */
export function validateJsonFile(fileName, parsed) {
  const errors = [];

  if (!Array.isArray(parsed)) {
    errors.push(`[${fileName}] Root of the JSON file must be a JSON array (list of meditation cards).`);
  } else if (parsed.length === 0) {
    errors.push(`[${fileName}] The JSON file must contain at least one meditation card object.`);
  } else {
    parsed.forEach((item, index) => {
      const itemErrors = validateCardItem(item, index);
      itemErrors.forEach(err => {
        errors.push(`[${fileName}] ${err}`);
      });
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Normalize a card item to internal format
 */
export function normalizeCardItem(item) {
  const verse = (item.title || item.verse || "").trim();
  const content = (item.message || item.content || "").trim();
  const timeout = item.timeout ? parseInt(item.timeout, 10) : null;
  const notes = (item.notes || "").trim();

  return {
    verse,
    content,
    timeout: isNaN(timeout) ? null : timeout,
    notes
  };
}
