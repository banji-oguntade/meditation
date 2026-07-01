import { useEffect, useCallback } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db, isCloudEnabled } from "../utils/firebase";

/**
 * Hook: Persist session notes to Firestore or sync state
 */
export function useNotePersistence(currentCardId, sessionNotes, cards, setCards, user) {
  // Function to persist notes (memoized to prevent re-creation)
  const persistNotes = useCallback(async (cardId, updatedNotes) => {
    setCards(prevCards => prevCards.map(c => c.id === cardId ? { ...c, notes: updatedNotes } : c));

    if (isCloudEnabled(user)) {
      try {
        const cardRef = doc(db, "users", user.email, "cards", cardId);
        await setDoc(cardRef, { notes: updatedNotes }, { merge: true });
      } catch (err) {
        console.error("Error updating notes in Firestore:", err);
      }
    }
  }, [user, setCards]);

  // Debounced auto-save effect for notes
  useEffect(() => {
    if (!currentCardId) return;

    const targetCard = cards.find(c => c.id === currentCardId);
    if (!targetCard || targetCard.notes === sessionNotes) return;

    const timer = setTimeout(() => {
      persistNotes(currentCardId, sessionNotes);
    }, 1000);

    return () => clearTimeout(timer);
  }, [sessionNotes, currentCardId, cards, persistNotes]);
}

/**
 * Sync sessionNotes when changing cards
 */
export function useSyncSessionNotes(currentCard, setSessionNotes) {
  useEffect(() => {
    if (currentCard) {
      setSessionNotes(currentCard.notes || "");
    } else {
      setSessionNotes("");
    }
  }, [currentCard, setSessionNotes]);
}
