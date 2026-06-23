/**
 * Format filenames to beautiful collection titles
 * e.g., "divine-direction-scriptures.json" → "Divine Direction Scriptures"
 */
export function formatFileNameToCollection(fileName) {
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
  const spaced = nameWithoutExt.replace(/[-_]/g, " ");
  return spaced
    .split(" ")
    .filter(word => word.length > 0)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Generate a unique ID for collections
 */
export function generateCollectionId(prefix = "col") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Generate a unique ID for cards
 */
export function generateCardId(prefix = "card") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Sanitize email for use as localStorage key
 */
export function sanitizeEmailForKey(email) {
  return email.replace(/[^a-zA-Z0-9]/g, "_");
}
