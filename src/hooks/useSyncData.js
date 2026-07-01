import { useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db, isCloudEnabled } from "../utils/firebase";
import {
  getStoredCollections,
  getStoredCards,
  saveStoredCollections,
  saveStoredCards
} from "../utils/storage";
import { sanitizeEmailForKey } from "../utils/helpers";

/**
 * Hook: Sync collections and cards from Firebase or localStorage
 * Returns: { collections, setCollections, cards, setCards }
 */
export function useSyncCollectionsAndCards(user, collections, setCollections, cards, setCards) {
  // Load/sync collections and cards on user change
  useEffect(() => {
    if (!user) {
      setCollections([]);
      setCards([]);
      return;
    }

    if (isCloudEnabled(user)) {
      // Real-time Firestore Sync
      const collectionsRef = collection(db, "users", user.email, "collections");
      const cardsRef = collection(db, "users", user.email, "cards");

      const unsubCollections = onSnapshot(collectionsRef, (snapshot) => {
        const list = [];
        snapshot.forEach((doc) => {
          list.push({ ...doc.data(), id: doc.id });
        });
        setCollections(list);
      }, (err) => {
        console.error("Firestore collections subscription error:", err);
      });

      const unsubCards = onSnapshot(cardsRef, (snapshot) => {
        const list = [];
        snapshot.forEach((doc) => {
          list.push({ ...doc.data(), id: doc.id });
        });
        setCards(list);
      }, (err) => {
        console.error("Firestore cards subscription error:", err);
      });

      return () => {
        unsubCollections();
        unsubCards();
      };
    } else {
      // LocalStorage Fallback
      const emailSuffix = sanitizeEmailForKey(user.email);
      const storedCollections = getStoredCollections(emailSuffix);
      const storedCards = getStoredCards(emailSuffix);
      setCollections(storedCollections);
      setCards(storedCards);
    }
  }, [user, setCollections, setCards]);

  // Persist collections locally when they change (only in local mode)
  useEffect(() => {
    if (user && !isCloudEnabled(user)) {
      const emailSuffix = sanitizeEmailForKey(user.email);
      saveStoredCollections(emailSuffix, collections);
    }
  }, [collections, user]);

  // Persist cards locally when they change (only in local mode)
  useEffect(() => {
    if (user && !isCloudEnabled(user)) {
      const emailSuffix = sanitizeEmailForKey(user.email);
      saveStoredCards(emailSuffix, cards);
    }
  }, [cards, user]);
}

/**
 * Hook: Parse Google OAuth redirect credentials on mount
 */
export function useParseOAuthRedirect(user, setUser) {
  useEffect(() => {
    if (user) return;

    const hash = window.location.hash.substring(1);
    if (!hash) return;

    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");

    if (accessToken) {
      // Clear hash parameters immediately from path
      window.history.replaceState({}, document.title, window.location.pathname);

      fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` }
      })
        .then(res => {
          if (!res.ok) throw new Error("Failed to retrieve profile information");
          return res.json();
        })
        .then(data => {
          const newUser = {
            name: data.name || data.email.split('@')[0],
            email: data.email,
            picture: data.picture || ""
          };
          localStorage.setItem("logos_meditate_user", JSON.stringify(newUser));
          setUser(newUser);
        })
        .catch(err => {
          console.error("OAuth profile fetch failed:", err);
          alert("❌ Failed to login via Google. Please verify your internet connection or Google Client ID.");
        });
    }
  }, [user, setUser]);
}
