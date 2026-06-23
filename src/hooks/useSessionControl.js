import { useEffect, useRef, useCallback } from "react";

/**
 * Hook: Manage slideshow timer and card advancement
 */
export function useSessionTimer(activeSession, setActiveSession, collections, cards) {
  const timerRef = useRef(null);

  // Memoized update function to prevent unnecessary re-creates
  const handleTimerTick = useCallback(() => {
    setActiveSession(prev => {
      if (!prev) return null;
      if (prev.timeRemaining <= 1) {
        // Time's up! Advance to next card
        const colCards = cards.filter(c => c.collectionId === prev.collectionId);
        const nextIndex = prev.currentCardIndex + 1;

        if (nextIndex < colCards.length) {
          const nextCard = colCards[nextIndex];
          const col = collections.find(c => c.id === prev.collectionId);
          const limit = nextCard.timeout || col.defaultTimeout || 30;
          return {
            ...prev,
            currentCardIndex: nextIndex,
            timeRemaining: limit,
            maxTime: limit
          };
        } else {
          // End of collection reached!
          clearInterval(timerRef.current);
          return {
            ...prev,
            isComplete: true,
            isPlaying: false
          };
        }
      } else {
        return {
          ...prev,
          timeRemaining: prev.timeRemaining - 1
        };
      }
    });
  }, [collections, cards]);

  useEffect(() => {
    if (!activeSession || !activeSession.isPlaying || activeSession.isComplete) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(handleTimerTick, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeSession?.isPlaying, activeSession?.isComplete, handleTimerTick]);
}

/**
 * Helper: Get SVG stroke-dashoffset for circular timer
 */
export function getDashOffset(activeSession) {
  if (!activeSession) return 0;
  const circumference = 220; // 2 * pi * r (r=35)
  const percentage = (activeSession.timeRemaining / activeSession.maxTime) * 100;
  return circumference - (percentage * circumference) / 100;
}
