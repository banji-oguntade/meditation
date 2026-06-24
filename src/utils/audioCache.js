const DB_NAME = "VerseAudioCacheDB";
const STORE_NAME = "audio_cache";
const DB_VERSION = 1;

/**
 * Open the IndexedDB database
 */
function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not supported in this environment."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error || new Error("Failed to open IndexedDB"));
    };
  });
}

/**
 * Retrieve a cached audio Blob from IndexedDB
 * @param {string} userEmail
 * @param {string} text
 * @returns {Promise<Blob|null>}
 */
export async function getCachedAudio(userEmail, text) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      // Key format: email::text
      const key = `${userEmail || "guest"}::${text.trim()}`;
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = (event) => {
        console.error("[AudioCache] Error reading from cache:", event.target.error);
        resolve(null);
      };
    });
  } catch (error) {
    console.warn("[AudioCache] IndexedDB read bypassed:", error.message);
    return null;
  }
}

/**
 * Save an audio Blob to IndexedDB cache
 * @param {string} userEmail
 * @param {string} text
 * @param {Blob} blob
 * @returns {Promise<boolean>} Resolves to true if cached successfully, false otherwise
 */
export async function cacheAudio(userEmail, text, blob) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const key = `${userEmail || "guest"}::${text.trim()}`;
      
      const request = store.put(blob, key);

      request.onsuccess = () => {
        console.log(`[AudioCache] Successfully cached audio for key: ${key}`);
        resolve(true);
      };

      request.onerror = (event) => {
        console.error("[AudioCache] Failed to write to cache:", event.target.error);
        resolve(false);
      };
    });
  } catch (error) {
    console.warn("[AudioCache] IndexedDB write bypassed:", error.message);
    return false;
  }
}
