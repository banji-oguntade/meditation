/**
 * Safe JSON parsing with fallback
 */
export function parseJsonOrDefault(json, defaultValue = null) {
  try {
    return JSON.parse(json);
  } catch (err) {
    console.error("Failed to parse JSON:", err);
    return defaultValue;
  }
}

/**
 * Get collections from localStorage safely
 */
export function getStoredCollections(emailSuffix) {
  const key = `logos_meditate_collections_v2_${emailSuffix}`;
  const stored = localStorage.getItem(key);
  return parseJsonOrDefault(stored, []);
}

/**
 * Get cards from localStorage safely
 */
export function getStoredCards(emailSuffix) {
  const key = `logos_meditate_cards_v2_${emailSuffix}`;
  const stored = localStorage.getItem(key);
  return parseJsonOrDefault(stored, []);
}

/**
 * Save collections to localStorage
 */
export function saveStoredCollections(emailSuffix, collections) {
  const key = `logos_meditate_collections_v2_${emailSuffix}`;
  localStorage.setItem(key, JSON.stringify(collections));
}

/**
 * Save cards to localStorage
 */
export function saveStoredCards(emailSuffix, cards) {
  const key = `logos_meditate_cards_v2_${emailSuffix}`;
  localStorage.setItem(key, JSON.stringify(cards));
}

/**
 * Get user from localStorage safely
 */
export function getStoredUser() {
  const stored = localStorage.getItem("logos_meditate_user");
  return parseJsonOrDefault(stored, null);
}

/**
 * Save user to localStorage
 */
export function saveStoredUser(user) {
  localStorage.setItem("logos_meditate_user", JSON.stringify(user));
}

/**
 * Get Google Client ID from localStorage
 */
export function getStoredGoogleClientId() {
  return localStorage.getItem("logos_meditate_client_id") || "";
}

/**
 * Save Google Client ID to localStorage
 */
export function saveStoredGoogleClientId(clientId) {
  localStorage.setItem("logos_meditate_client_id", clientId);
}
