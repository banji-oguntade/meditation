import { useState, useRef, useEffect } from "react";
import "./App.css"; // Meditate App Main Component
import { db, isCloudEnabled } from "./utils/firebase";
import { doc, setDoc, deleteDoc } from "firebase/firestore";

// Import utilities
import { formatFileNameToCollection, generateCollectionId, generateCardId } from "./utils/helpers";
import { getStoredUser, saveStoredUser, getStoredGoogleClientId, saveStoredGoogleClientId } from "./utils/storage";
import { validateJsonFile, normalizeCardItem } from "./utils/importValidation";
import { getCachedAudio, cacheAudio, saveCollectionMusic, getCollectionMusic, deleteCollectionMusic } from "./utils/audioCache";

// Import hooks
// eslint-disable-next-line no-unused-vars
import { useSyncCollectionsAndCards, useParseOAuthRedirect } from "./hooks/useSyncData";
import { useSyncSessionNotes, useNotePersistence } from "./hooks/useNoteSync";
import { useSessionTimer } from "./hooks/useSessionControl";
import { useVerseAudio } from "./hooks/useVerseAudio";

// Import icons
import {
  PlayIcon,
  PauseIcon,
  SkipNextIcon,
  SkipBackIcon,
  CloseIcon,
  PlusIcon,
  TrashIcon,
  EditIcon,
  SpeakerIcon
} from "./components/Icons";

const ClockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const RepeatIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

export default function App() {
  // --- AUTHENTICATION STATE ---
  const [user, setUser] = useState(() => {
    return getStoredUser();
  });

  const [googleClientId, setGoogleClientId] = useState(() => {
    return getStoredGoogleClientId() || import.meta.env.VITE_GOOGLE_CLIENT_ID || "785518740308-2qjekf5uqg11ivb99d37dt7otm1big1n.apps.googleusercontent.com";
  });

  const [disableCountdown, setDisableCountdown] = useState(() => {
    return localStorage.getItem("logos_meditate_disable_countdown") === "true";
  });

  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  // --- STORAGE & SYNC INITIALIZATION ---
  const [collections, setCollections] = useState([]);
  const [cards, setCards] = useState([]);

  // Sync collections/cards from Firebase or localStorage
  useSyncCollectionsAndCards(user, collections, setCollections, cards, setCards);

  // Parse Google OAuth redirect on mount
  useParseOAuthRedirect(user, setUser);

  const handleGoogleOAuth = () => {
    const defaultClientId = "785518740308-2qjekf5uqg11ivb99d37dt7otm1big1n.apps.googleusercontent.com";
    const clientId = googleClientId.trim() || import.meta.env.VITE_GOOGLE_CLIENT_ID || defaultClientId;
    if (!clientId || clientId === "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com") {
      alert("⚠️ Please configure a valid Google Client ID under 'Google Client ID Settings' first.");
      return;
    }

    const redirectUri = window.location.origin + window.location.pathname;
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=token` +
      `&scope=${encodeURIComponent("profile email")}` +
      `&prompt=consent`;

    window.location.href = authUrl;
  };

  const handleDevLogin = () => {
    const devUser = {
      name: "Developer Guest",
      email: "guest@example.com",
      picture: ""
    };
    saveStoredUser(devUser);
    setUser(devUser);
  };

  const handleSignOut = () => {
    localStorage.removeItem("logos_meditate_user");
    setUser(null);
    setProfileDropdownOpen(false);
  };

  // --- UI VIEW STATE ---
  const [currentModal, setCurrentModal] = useState(null); // null | { type: 'create_col'|'edit_col'|'manage_cards', id?: string }
  const [cardFormMode, setCardFormMode] = useState("list"); // 'list' | 'add' | 'edit'
  const [selectedCardId, setSelectedCardId] = useState(null);

  // Form Fields State
  const [colForm, setColForm] = useState({ name: "", description: "", colorTheme: "general", defaultTimeout: 30 });
  const [cardForm, setCardForm] = useState({ verse: "", content: "", timeout: "", notes: "", collectionId: "" });

  // --- MEDITATION SESSION ACTIVE STATE ---
  const [activeSession, setActiveSession] = useState(null);
  // structure: { collectionId, currentCardIndex, isPlaying, timeRemaining, maxTime, isComplete, notesOpen }

  const [sessionNotes, setSessionNotes] = useState("");
  const [batchLoadingState, setBatchLoadingState] = useState({});
  const [autoPlayVoice, setAutoPlayVoice] = useState(() => {
    return localStorage.getItem("logos_meditate_autoplay_voice") === "true";
  });
  const [loopCollection, setLoopCollection] = useState(() => {
    return localStorage.getItem("logos_meditate_loop_collection") === "true";
  });
  const [musicVolume, setMusicVolume] = useState(() => {
    const saved = localStorage.getItem("logos_meditate_bg_music_volume");
    return saved !== null ? parseFloat(saved) : 0.2;
  });
  const [collectionMusicMap, setCollectionMusicMap] = useState({});
  const activeColCards = activeSession ? cards.filter(c => c.collectionId === activeSession.collectionId) : [];
  const currentCard = activeSession ? activeColCards[activeSession.currentCardIndex] : null;
  const currentCardId = currentCard?.id;

  // Sync sessionNotes when changing cards and persist notes
  useSyncSessionNotes(currentCard, setSessionNotes);
  useNotePersistence(currentCardId, sessionNotes, cards, setCards, user);

  const importFileRef = useRef(null);

  // Use session control hooks
  useSessionTimer(activeSession, setActiveSession, collections, cards, disableCountdown, loopCollection);
  const { speak, stop, isSpeaking, isLoading } = useVerseAudio(user);
  const lastPlayedCardIdRef = useRef(null);
  const autoPlayTimerRef = useRef(null);
  const bgMusicRef = useRef(null);

  // Load background music files from IndexedDB on mount / collections load
  useEffect(() => {
    const loadMusic = async () => {
      const newMap = {};
      for (const col of collections) {
        try {
          const data = await getCollectionMusic(col.id);
          if (data && data.blob) {
            const url = URL.createObjectURL(data.blob);
            newMap[col.id] = { name: data.name, url };
          }
        } catch (err) {
          console.error("Failed to load music for collection:", col.id, err);
        }
      }
      setCollectionMusicMap(newMap);
    };

    if (collections.length > 0) {
      loadMusic();
    }

    return () => {
      setCollectionMusicMap(prev => {
        Object.values(prev).forEach(item => {
          if (item?.url) {
            URL.revokeObjectURL(item.url);
          }
        });
        return {};
      });
    };
  }, [collections]);

  // Manage background music playback
  useEffect(() => {
    if (activeSession && !activeSession.isComplete) {
      const musicFile = collectionMusicMap[activeSession.collectionId];
      const trackUrl = musicFile?.url || "";

      if (trackUrl) {
        if (!bgMusicRef.current || bgMusicRef.current.src !== trackUrl) {
          if (bgMusicRef.current) {
            bgMusicRef.current.pause();
          }
          bgMusicRef.current = new Audio(trackUrl);
          bgMusicRef.current.loop = true;
        }
        
        bgMusicRef.current.volume = musicVolume;
        
        bgMusicRef.current.play().catch(err => {
          console.warn("Background music autoplay blocked or failed:", err);
        });
      } else {
        if (bgMusicRef.current) {
          bgMusicRef.current.pause();
        }
      }
    } else {
      if (bgMusicRef.current) {
        bgMusicRef.current.pause();
      }
    }
  }, [activeSession, collectionMusicMap, musicVolume]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
      }
    };
  }, []);

  // Auto-play audio on card transition if enabled
  useEffect(() => {
    if (activeSession && !activeSession.isComplete && autoPlayVoice) {
      const col = collections.find(c => c.id === activeSession.collectionId);
      if (col) {
        const colCards = cards.filter(c => c.collectionId === col.id);
        const activeCard = colCards[activeSession.currentCardIndex];
        
        if (activeCard && activeCard.id !== lastPlayedCardIdRef.current) {
          lastPlayedCardIdRef.current = activeCard.id;
          // Stop any currently playing audio immediately on card transition
          stop();
          
          if (autoPlayTimerRef.current) {
            clearTimeout(autoPlayTimerRef.current);
          }
          
          autoPlayTimerRef.current = setTimeout(() => {
            speak(activeCard.content);
            autoPlayTimerRef.current = null;
          }, 2000);
        }
      }
    } else if (!activeSession) {
      lastPlayedCardIdRef.current = null;
      stop();
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
        autoPlayTimerRef.current = null;
      }
    }
  }, [activeSession?.currentCardIndex, activeSession?.isComplete, activeSession?.collectionId, autoPlayVoice, speak, stop, cards, collections]);

  // --- ACTIONS ---

  const handleBatchAudioConvert = async (collectionId) => {
    const col = collections.find(c => c.id === collectionId);
    if (!col) return;
    const colCards = cards.filter(c => c.collectionId === collectionId);
    if (colCards.length === 0) {
      alert("This collection has no cards to convert.");
      return;
    }

    const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY || "";
    if (!ELEVENLABS_API_KEY) {
      alert("ElevenLabs API key is not configured. The app will use the browser's built-in text-to-speech, which is instant and does not require pre-generation.");
      return;
    }

    const userEmail = user?.email || "guest";

    // Check which cards are already cached
    let uncachedCards = [];
    for (const card of colCards) {
      const cached = await getCachedAudio(userEmail, card.content);
      if (!cached) {
        uncachedCards.push(card);
      }
    }

    if (uncachedCards.length === 0) {
      // All cards are already cached!
      alert("Audio already synced");
      setBatchLoadingState(prev => ({
        ...prev,
        [collectionId]: "✓ Ready"
      }));
      // Reset status after 3 seconds
      setTimeout(() => {
        setBatchLoadingState(prev => {
          const next = { ...prev };
          delete next[collectionId];
          return next;
        });
      }, 3000);
      return;
    }

    setBatchLoadingState(prev => ({ ...prev, [collectionId]: "0%" }));
    const ELEVENLABS_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

    let successCount = colCards.length - uncachedCards.length;
    let errorCount = 0;

    for (let i = 0; i < uncachedCards.length; i++) {
      const card = uncachedCards[i];
      const text = card.content;

      try {
        const response = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "xi-api-key": ELEVENLABS_API_KEY,
            },
            body: JSON.stringify({
              text: text,
              model_id: "eleven_v3",
              output_format: "mp3_44100_128",
            }),
          }
        );

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const blob = await response.blob();
        await cacheAudio(userEmail, text, blob);
        successCount++;
      } catch (err) {
        console.error(`Error converting card:`, err);
        errorCount++;
      }

      const percent = Math.round((successCount / colCards.length) * 100);
      setBatchLoadingState(prev => ({
        ...prev,
        [collectionId]: `${percent}%`
      }));

      await new Promise(resolve => setTimeout(resolve, 300));
    }

    if (errorCount > 0) {
      setBatchLoadingState(prev => ({
        ...prev,
        [collectionId]: `Done (${errorCount} failed)`
      }));
      alert(`Batch conversion complete. ${successCount} succeeded, ${errorCount} failed.`);
    } else {
      setBatchLoadingState(prev => ({
        ...prev,
        [collectionId]: "✓ Ready"
      }));
    }

    setTimeout(() => {
      setBatchLoadingState(prev => {
        const next = { ...prev };
        delete next[collectionId];
        return next;
      });
    }, 3000);
  };

  // Collections CRUD
  const handleOpenCreateCol = () => {
    setColForm({ name: "", description: "", colorTheme: "general", defaultTimeout: 30 });
    setCurrentModal({ type: "create_col" });
  };

  const handleOpenEditCol = (col) => {
    setColForm({ ...col });
    setCurrentModal({ type: "edit_col", id: col.id });
  };

  const saveCollection = async (e) => {
    e.preventDefault();
    if (!colForm.name.trim()) return;

    let targetColId = currentModal.id;
    let updatedCol;

    if (currentModal.type === "create_col") {
      targetColId = generateCollectionId();
      updatedCol = {
        ...colForm,
        id: targetColId
      };
    } else {
      const existing = collections.find(c => c.id === targetColId);
      updatedCol = {
        ...existing,
        ...colForm
      };
    }

    if (isCloudEnabled(user)) {
      try {
        const docRef = doc(db, "users", user.email, "collections", targetColId);
        await setDoc(docRef, updatedCol);
      } catch (err) {
        console.error("Error saving collection to Firestore:", err);
        alert("❌ Failed to save collection to the cloud.");
      }
    } else {
      if (currentModal.type === "create_col") {
        setCollections([...collections, updatedCol]);
      } else {
        setCollections(collections.map(c => c.id === targetColId ? updatedCol : c));
      }
    }
    setCurrentModal(null);
  };

  const deleteCollection = async (colId) => {
    if (window.confirm("Are you sure you want to delete this collection and all of its cards?")) {
      // Optimistically update state so collections disappear instantly
      setCollections(prev => prev.filter(c => c.id !== colId));
      setCards(prev => prev.filter(c => c.collectionId !== colId));

      if (isCloudEnabled(user)) {
        try {
          const colDocRef = doc(db, "users", user.email, "collections", colId);
          await deleteDoc(colDocRef);

          const colCards = cards.filter(c => c.collectionId === colId);
          await Promise.all(
            colCards.map(card => deleteDoc(doc(db, "users", user.email, "cards", card.id)))
          );
        } catch (err) {
          console.error("Error deleting collection from Firestore:", err);
          alert("❌ Failed to delete collection from the cloud.");
        }
      }
      setCurrentModal(null);
    }
  };

  const saveCard = async (e) => {
    e.preventDefault();
    if (!cardForm.verse.trim() || !cardForm.content.trim()) return;

    const formattedTimeout = cardForm.timeout ? parseInt(cardForm.timeout, 10) : null;
    let targetCardId = selectedCardId;
    let updatedCard;

    if (cardFormMode === "add") {
      targetCardId = generateCardId();
      updatedCard = {
        ...cardForm,
        id: targetCardId,
        timeout: formattedTimeout
      };
    } else {
      const existing = cards.find(c => c.id === targetCardId);
      updatedCard = {
        ...existing,
        ...cardForm,
        timeout: formattedTimeout
      };
    }

    if (isCloudEnabled(user)) {
      try {
        const docRef = doc(db, "users", user.email, "cards", targetCardId);
        await setDoc(docRef, updatedCard);
      } catch (err) {
        console.error("Error saving card to Firestore:", err);
        alert("❌ Failed to save card to the cloud.");
      }
    } else {
      if (cardFormMode === "add") {
        setCards([...cards, updatedCard]);
      } else {
        setCards(cards.map(c => c.id === targetCardId ? updatedCard : c));
      }
    }
    setCardFormMode("list");
  };

  const deleteCard = async (cardId) => {
    if (window.confirm("Delete this meditation card?")) {
      // Optimistically update state so card disappears instantly
      setCards(prev => prev.filter(c => c.id !== cardId));

      if (isCloudEnabled(user)) {
        try {
          const docRef = doc(db, "users", user.email, "cards", cardId);
          await deleteDoc(docRef);
        } catch (err) {
          console.error("Error deleting card from Firestore:", err);
          alert("❌ Failed to delete card from the cloud.");
        }
      }
    }
  };

  // --- JSON IMPORT ---
  const handleImportJSON = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    try {
      const fileContents = await Promise.all(
        files.map(file => {
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (evt) => {
              try {
                const parsed = JSON.parse(evt.target.result);
                resolve({ fileName: file.name, parsed });
              } catch (err) {
                reject({ fileName: file.name, error: err });
              }
            };
            reader.onerror = () => reject({ fileName: file.name, error: new Error("File read error") });
            reader.readAsText(file);
          });
        })
      );

      // Validate all files
      const allValidationErrors = [];
      const validItemsPerFile = [];

      fileContents.forEach(({ fileName, parsed }) => {
        const validation = validateJsonFile(fileName, parsed);
        if (!validation.isValid) {
          allValidationErrors.push(...validation.errors);
        } else {
          validItemsPerFile.push({ fileName, parsed });
        }
      });

      if (allValidationErrors.length > 0) {
        setCurrentModal({
          type: "import_errors",
          errors: allValidationErrors
        });
        return;
      }

      // If all files are valid, proceed with importing all in bulk
      let totalImportedCount = 0;

      if (isCloudEnabled(user)) {
        try {
          const uploadPromises = [];
          let tempCollections = [...collections];

          validItemsPerFile.forEach(({ fileName, parsed }) => {
            const collectionName = formatFileNameToCollection(fileName);
            let col = tempCollections.find(
              (c) => c.name.toLowerCase() === collectionName.toLowerCase()
            );

            let colId;
            if (!col) {
              colId = generateCollectionId("col-import");
              col = {
                id: colId,
                name: collectionName,
                description: `Imported collection: ${collectionName}`,
                colorTheme: "general",
                defaultTimeout: 30
              };
              tempCollections.push(col);
              const colDocRef = doc(db, "users", user.email, "collections", colId);
              uploadPromises.push(setDoc(colDocRef, col));
            } else {
              colId = col.id;
            }

            parsed.forEach((item) => {
              const normalized = normalizeCardItem(item);
              const cardId = generateCardId("card-import");
              const card = {
                id: cardId,
                collectionId: colId,
                ...normalized
              };
              const cardDocRef = doc(db, "users", user.email, "cards", cardId);
              uploadPromises.push(setDoc(cardDocRef, card));
              totalImportedCount++;
            });
          });

          await Promise.all(uploadPromises);
        } catch (err) {
          console.error("Error importing to Firestore:", err);
          alert("❌ Failed to import items to the cloud database.");
          return;
        }
      } else {
        let newCollections = [...collections];
        let newCards = [...cards];

        validItemsPerFile.forEach(({ fileName, parsed }) => {
          const collectionName = formatFileNameToCollection(fileName);
          let col = newCollections.find(
            (c) => c.name.toLowerCase() === collectionName.toLowerCase()
          );

          if (!col) {
            col = {
              id: generateCollectionId("col-import"),
              name: collectionName,
              description: `Imported collection: ${collectionName}`,
              colorTheme: "general",
              defaultTimeout: 30,
            };
            newCollections = [...newCollections, col];
          }

          parsed.forEach((item) => {
            const normalized = normalizeCardItem(item);
            newCards = [
              ...newCards,
              {
                id: generateCardId("card-import"),
                collectionId: col.id,
                ...normalized
              },
            ];
            totalImportedCount++;
          });
        });

        setCollections(newCollections);
        setCards(newCards);
      }

      const msg = `✅ Successfully imported ${totalImportedCount} meditation card(s) from ${files.length} file(s)!`;
      alert(msg);
    } catch (errObj) {
      setCurrentModal({
        type: "import_errors",
        errors: [`[${errObj.fileName}] JSON Syntax Error: Failed to parse. (${errObj.error.message})`]
      });
    } finally {
      e.target.value = "";
    }
  };

  const handleOpenAddCardGlobal = () => {
    const defaultColId = collections.length > 0 ? collections[0].id : "";
    setCardForm({ verse: "", content: "", timeout: "", notes: "", collectionId: defaultColId });
    setCurrentModal({ type: "add_card_global" });
  };

  const saveCardGlobal = async (e) => {
    e.preventDefault();
    if (!cardForm.verse.trim() || !cardForm.content.trim() || !cardForm.collectionId) return;

    const formattedTimeout = cardForm.timeout ? parseInt(cardForm.timeout, 10) : null;
    const targetCardId = generateCardId();
    const newCard = {
      ...cardForm,
      id: targetCardId,
      timeout: formattedTimeout
    };

    if (isCloudEnabled(user)) {
      try {
        const docRef = doc(db, "users", user.email, "cards", targetCardId);
        await setDoc(docRef, newCard);
      } catch (err) {
        console.error("Error saving card to Firestore:", err);
        alert("❌ Failed to save card to the cloud.");
      }
    } else {
      setCards([...cards, newCard]);
    }
    setCurrentModal(null);
  };

  const startPlayAllCollections = () => {
    if (collections.length === 0) return;
    
    // Get all collections that have at least one card
    const validCols = collections.filter(col => {
      const colCards = cards.filter(c => c.collectionId === col.id);
      return colCards.length > 0;
    });
    
    if (validCols.length === 0) {
      alert("Please add some scriptures to your collections before meditating!");
      return;
    }
    
    const firstCol = validCols[0];
    const firstColCards = cards.filter(c => c.collectionId === firstCol.id);
    const firstCard = firstColCards[0];
    const initialTime = firstCard.timeout || firstCol.defaultTimeout || 30;
    
    // The remaining collections will be played one after another
    const remainingIds = validCols.slice(1).map(col => col.id);
    
    setActiveSession({
      collectionId: firstCol.id,
      currentCardIndex: 0,
      isPlaying: !disableCountdown,
      timeRemaining: initialTime,
      maxTime: initialTime,
      isComplete: false,
      notesOpen: true,
      remainingCollectionIds: remainingIds
    });
  };

  const startSession = (collectionId) => {
    const colCards = cards.filter(c => c.collectionId === collectionId);
    if (colCards.length === 0) {
      alert("Please add some scriptures to this collection before meditating!");
      return;
    }

    const col = collections.find(c => c.id === collectionId);
    const firstCard = colCards[0];
    const initialTime = firstCard.timeout || col.defaultTimeout || 30;

    setActiveSession({
      collectionId,
      currentCardIndex: 0,
      isPlaying: !disableCountdown,
      timeRemaining: initialTime,
      maxTime: initialTime,
      isComplete: false,
      notesOpen: true
    });
  };

  const skipNext = () => {
    if (!activeSession) return;
    const colCards = cards.filter(c => c.collectionId === activeSession.collectionId);
    const nextIndex = activeSession.currentCardIndex + 1;

    if (nextIndex < colCards.length) {
      const nextCard = colCards[nextIndex];
      const col = collections.find(c => c.id === activeSession.collectionId);
      const limit = nextCard.timeout || col.defaultTimeout || 30;
      setActiveSession(prev => ({
        ...prev,
        currentCardIndex: nextIndex,
        timeRemaining: limit,
        maxTime: limit
      }));
    } else {
      // If Loop Collection is enabled, loop back to index 0
      if (loopCollection) {
        const firstCard = colCards[0];
        const col = collections.find(c => c.id === activeSession.collectionId);
        const limit = firstCard.timeout || col.defaultTimeout || 30;
        setActiveSession(prev => ({
          ...prev,
          currentCardIndex: 0,
          timeRemaining: limit,
          maxTime: limit
        }));
        return;
      }

      // Check if there are remaining collections in Play All mode
      if (activeSession.remainingCollectionIds && activeSession.remainingCollectionIds.length > 0) {
        const nextColId = activeSession.remainingCollectionIds[0];
        const nextCol = collections.find(c => c.id === nextColId);
        const nextColCards = cards.filter(c => c.collectionId === nextColId);
        
        if (nextCol && nextColCards.length > 0) {
          const firstCard = nextColCards[0];
          const limit = firstCard.timeout || nextCol.defaultTimeout || 30;
          
          setActiveSession(prev => ({
            ...prev,
            collectionId: nextColId,
            currentCardIndex: 0,
            timeRemaining: limit,
            maxTime: limit,
            remainingCollectionIds: prev.remainingCollectionIds.slice(1)
          }));
          return;
        }
      }

      setActiveSession(prev => ({ ...prev, isComplete: true, isPlaying: false }));
    }
  };

  const skipBack = () => {
    if (!activeSession) return;
    const colCards = cards.filter(c => c.collectionId === activeSession.collectionId);
    const prevIndex = activeSession.currentCardIndex - 1;

    if (prevIndex >= 0) {
      const prevCard = colCards[prevIndex];
      const col = collections.find(c => c.id === activeSession.collectionId);
      const limit = prevCard.timeout || col.defaultTimeout || 30;
      setActiveSession(prev => ({
        ...prev,
        currentCardIndex: prevIndex,
        timeRemaining: limit,
        maxTime: limit
      }));
    }
  };

  const closeSession = () => {
    setActiveSession(null);
  };

  const handleUploadMusic = async (collectionId, file) => {
    if (!file) return;
    try {
      await saveCollectionMusic(collectionId, file, file.name);
      const url = URL.createObjectURL(file);
      
      if (collectionMusicMap[collectionId]?.url) {
        URL.revokeObjectURL(collectionMusicMap[collectionId].url);
      }
      
      setCollectionMusicMap(prev => ({
        ...prev,
        [collectionId]: { name: file.name, url }
      }));
    } catch (err) {
      console.error("Failed to save background music:", err);
      alert("Failed to save background music. Please try again.");
    }
  };

  const handleDeleteMusic = async (collectionId) => {
    try {
      await deleteCollectionMusic(collectionId);
      if (collectionMusicMap[collectionId]?.url) {
        URL.revokeObjectURL(collectionMusicMap[collectionId].url);
      }
      setCollectionMusicMap(prev => {
        const next = { ...prev };
        delete next[collectionId];
        return next;
      });
    } catch (err) {
      console.error("Failed to delete background music:", err);
    }
  };

  // Help calculate SVG radial dash offset
  const getDashOffset = () => {
    if (!activeSession) return 0;
    const circumference = 220; // 2 * pi * r (r=35)
    const percentage = (activeSession.timeRemaining / activeSession.maxTime) * 100;
    return circumference - (percentage * circumference) / 100;
  };

  if (!user) {
    return (
      <div className="auth-portal-container animate-fade-up">
        <div className="auth-portal-glow" />
        <div className="glass-panel auth-portal-card">
          <div className="auth-portal-header">
            <span className="title-sub">Sanctuary Entrance</span>
            <h1 className="title-display" style={{ fontSize: "2.4rem", margin: "10px 0" }}>Logos Meditation</h1>
            <p className="auth-portal-subtitle">
              Enter your private space to reflect, customize, and dwell in scripture.
            </p>
          </div>

          {/* Settings Section for Client ID */}
          <div className="auth-portal-settings-panel">
            <details style={{ width: "100%" }}>
              <summary style={{ cursor: "pointer", color: "var(--gold)", fontSize: "12px", outline: "none", marginBottom: "8px" }}>
                ⚙️ Google Client ID Settings
              </summary>
              <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                  OAuth 2.0 Web Client ID:
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    className="input-field"
                    style={{ fontSize: "12px", padding: "8px 12px", flexGrow: 1 }}
                    placeholder="xxxx-xxxx.apps.googleusercontent.com"
                    value={googleClientId}
                    onChange={(e) => {
                      saveStoredGoogleClientId(e.target.value);
                      setGoogleClientId(e.target.value);
                    }}
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: "8px 12px", fontSize: "11px" }}
                    onClick={() => {
                      const defaultId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "785518740308-2qjekf5uqg11ivb99d37dt7otm1big1n.apps.googleusercontent.com";
                      saveStoredGoogleClientId(defaultId);
                      setGoogleClientId(defaultId);
                    }}
                  >
                    Reset
                  </button>
                </div>

                <div style={{ marginTop: "8px", padding: "8px", background: "rgba(0,0,0,0.3)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ display: "block", fontSize: "10px", color: "var(--gold)", fontWeight: "600", marginBottom: "4px" }}>
                    Authorized Redirect URI:
                  </span>
                  <code style={{ fontSize: "11px", color: "#a5d6ff", wordBreak: "break-all" }}>
                    {window.location.origin + window.location.pathname}
                  </code>
                  <span style={{ display: "block", fontSize: "9px", color: "var(--text-muted)", marginTop: "4px" }}>
                    Copy this exact value and add it to your Google Cloud Console **Authorized Redirect URIs** list.
                  </span>
                </div>

                <p style={{ fontSize: "10px", color: "var(--text-muted)", lineHeight: "1.4" }}>
                  To authenticate with Google, create a Client ID in the Google Cloud Console for web app origins targeting <strong>http://localhost:5173</strong>.
                </p>
              </div>
            </details>
          </div>

          {/* Social Sign-In actions */}
          <div className="auth-portal-actions">
            <button
              className="btn-primary"
              style={{ width: "100%", textTransform: "none", border: "1px solid var(--glass-border-hover)", display: "flex", gap: "10px", justifyContent: "center", alignItems: "center" }}
              onClick={handleGoogleOAuth}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" style={{ verticalAlign: "middle" }}>
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
              </svg>
              Sign in with Google
            </button>

            <div className="auth-divider">
              <span>or</span>
            </div>

            <button className="btn-secondary" style={{ width: "100%" }} onClick={handleDevLogin}>
              Developer Quick Login
            </button>
            <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "10px", textAlign: "center" }}>
              Bypass OAuth to immediately inspect/preview the application.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (activeSession) {
    const col = collections.find(c => c.id === activeSession.collectionId);
    if (col) {
      const colCards = cards.filter(c => c.collectionId === col.id);
      const isEnded = activeSession.isComplete;
      const currentCard = colCards[activeSession.currentCardIndex];

      return (
        <div className={`slideshow-overlay theme-${col.colorTheme}`}>
          <div className="slideshow-bg" />
          <div className="slideshow-bg-glow-active" />

          <div className="slideshow-container">
            {/* TOP HEADER */}
            <div className="slideshow-header">
              <div className="slideshow-header-left">
                <span className="title-sub desktop-only" style={{ color: "var(--theme-color)", fontSize: "11px" }}>MEDITATING ON</span>
                <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.2rem", fontWeight: "400", color: "white", margin: "0" }}>{col.name}</h2>
                <div style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-sans)", fontWeight: "600", marginTop: "2px" }}>
                  {activeSession.currentCardIndex + 1} of {colCards.length}
                </div>
              </div>

              <div className="slideshow-header-center">
                <button
                  className="action-icon-btn"
                  onClick={skipBack}
                  disabled={activeSession.currentCardIndex === 0}
                  style={{ opacity: activeSession.currentCardIndex === 0 ? 0.3 : 1 }}
                  title="Previous Card"
                >
                  <SkipBackIcon />
                </button>

                {!disableCountdown && (
                  <button
                    className="btn-primary"
                    style={{
                      borderRadius: "50%",
                      width: "36px",
                      height: "36px",
                      padding: "0",
                      borderColor: "var(--theme-color)",
                      color: "white",
                      background: "var(--theme-color)",
                      boxShadow: "0 0 12px var(--theme-glow)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                    onClick={() => setActiveSession(prev => ({ ...prev, isPlaying: !prev.isPlaying }))}
                    title={activeSession.isPlaying ? "Pause Session" : "Resume Session"}
                  >
                    {activeSession.isPlaying ? <PauseIcon style={{ width: "16px", height: "16px" }} /> : <PlayIcon style={{ width: "16px", height: "16px" }} />}
                  </button>
                )}

                <button
                  className="action-icon-btn"
                  onClick={skipNext}
                  title="Next Card"
                >
                  <SkipNextIcon />
                </button>
              </div>

              <div className="slideshow-header-right">
                <button className="action-icon-btn" onClick={closeSession} title="Exit session">
                  <CloseIcon />
                </button>
              </div>
            </div>

            {/* BODY: SCRIPTURE CARD / SLIDESHOW CONTENT */}
            <div className="slideshow-body">
              {!isEnded ? (
                <div className="animate-fade-up" style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }} key={currentCard.id}>
                  {/* Big Scripture Card */}
                  <div className="glass-panel" style={{ padding: "30px 24px", width: "100%", maxWidth: "750px", marginBottom: "20px", position: "relative" }}>
                    <span className="title-sub" style={{ display: "block", color: "var(--theme-color)", marginBottom: "16px", letterSpacing: "3px" }}>
                      {currentCard.verse}
                    </span>
                    <p className="scripture-text">
                      "{currentCard.content}"
                    </p>
                    <div style={{ marginTop: "20px", display: "flex", justifyContent: "center", gap: "8px" }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: "8px 14px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px", opacity: isLoading ? 0.6 : 1 }}
                        onClick={() => isSpeaking ? stop() : speak(currentCard.content)}
                        disabled={isLoading}
                        title={isLoading ? "Generating audio..." : isSpeaking ? "Stop reading verse" : "Read verse aloud"}
                      >
                        <SpeakerIcon />
                        {isLoading ? "Generating..." : isSpeaking ? "Stop Reading" : "Read Verse"}
                      </button>
                    </div>
                  </div>

                  {/* Circular Countdown Radial Timer */}
                  {!disableCountdown && (
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
                      <div className="timer-radial-container">
                        <svg className="timer-radial-svg">
                          <circle className="timer-radial-bg" cx="35" cy="35" r="35" />
                          <circle
                            className="timer-radial-progress"
                            cx="35"
                            cy="35"
                            r="35"
                            style={{ strokeDashoffset: getDashOffset(activeSession) }}
                          />
                        </svg>
                        <span className="timer-radial-text">{activeSession.timeRemaining}</span>
                      </div>
                    </div>
                  )}

                  {/* Reflection / Journal Notes Panel */}
                  {activeSession.notesOpen && (
                    <div className="glass-panel notes-drawer animate-fade-up" style={{ padding: "18px 22px" }}>
                      <div className="notes-drawer-header">
                        <span className="title-sub" style={{ fontSize: "11px", color: "var(--gold)" }}>✍ Reflection Journal Notes</span>
                        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Saves automatically</span>
                      </div>
                      <textarea
                        className="input-field textarea-field"
                        style={{ minHeight: "90px", fontSize: "14px", background: "rgba(0,0,0,0.15)" }}
                        value={sessionNotes}
                        onChange={(e) => setSessionNotes(e.target.value)}
                        placeholder="Type notes or declarations here to lock in the truth..."
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="glass-panel complete-screen animate-fade-up">
                  <span style={{ fontSize: "40px" }}>✦</span>
                  <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "2rem", fontWeight: "300", margin: "16px 0" }}>Meditation Finished</h2>
                  <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "24px" }}>
                    You have successfully spent time meditating on these scriptures in <strong>{col.name}</strong>.
                  </p>

                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", textAlign: "left", padding: "12px 16px", background: "rgba(255,255,255,0.02)", borderRadius: "10px", marginBottom: "28px" }}>
                    <span className="title-sub" style={{ fontSize: "10px", color: "var(--gold)" }}>Verses Meditated:</span>
                    {colCards.map((c, i) => (
                      <div key={c.id} style={{ fontSize: "13px", display: "flex", gap: "8px" }}>
                        <span style={{ color: "var(--theme-color)" }}>{i + 1}.</span>
                        <span>{c.verse}</span>
                      </div>
                    ))}
                  </div>

                  <button className="btn-primary" onClick={closeSession}>
                    Return to Dashboard
                  </button>
                </div>
              )}
            </div>

            {/* BOTTOM CONTROLS */}
            {!isEnded && (
              <div className="slideshow-controls">
                <div className="slideshow-control-group" style={{ gap: "12px", alignItems: "center" }}>
                  <button className="btn-secondary" style={{ padding: "8px 14px", fontSize: "12px" }} onClick={() => setActiveSession(prev => ({ ...prev, notesOpen: !prev.notesOpen }))}>
                    {activeSession.notesOpen ? "Hide Notes" : "Write Notes"}
                  </button>
                  <label className={`toggle-badge ${!disableCountdown ? "active" : ""}`} title="Toggle Countdown Timer">
                    <input
                      type="checkbox"
                      checked={!disableCountdown}
                      onChange={(e) => {
                        const val = !e.target.checked;
                        setDisableCountdown(val);
                        localStorage.setItem("logos_meditate_disable_countdown", val ? "true" : "false");
                        if (val) {
                          setActiveSession(prev => prev ? { ...prev, isPlaying: false } : null);
                        } else {
                          setActiveSession(prev => prev ? { ...prev, isPlaying: true } : null);
                        }
                      }}
                      style={{ display: "none" }}
                    />
                    <ClockIcon />
                    <span>Countdown</span>
                  </label>

                  <label className={`toggle-badge ${autoPlayVoice ? "active" : ""}`} title="Toggle Auto-Play Voice">
                    <input
                      type="checkbox"
                      checked={autoPlayVoice}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setAutoPlayVoice(val);
                        localStorage.setItem("logos_meditate_autoplay_voice", val ? "true" : "false");
                      }}
                      style={{ display: "none" }}
                    />
                    <SpeakerIcon style={{ width: "14px", height: "14px" }} />
                    <span>Auto Voice</span>
                  </label>

                  <label className={`toggle-badge ${loopCollection ? "active" : ""}`} title="Toggle Loop Collection">
                    <input
                      type="checkbox"
                      checked={loopCollection}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setLoopCollection(val);
                        localStorage.setItem("logos_meditate_loop_collection", val ? "true" : "false");
                      }}
                      style={{ display: "none" }}
                    />
                    <RepeatIcon />
                    <span>Loop</span>
                  </label>

                  {collectionMusicMap[activeSession.collectionId] && (
                    <div className="toggle-badge active" style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "default" }} title="Background Music Volume">
                      <span style={{ fontSize: "14px", lineHeight: "1" }}>🎵</span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        className="music-volume-slider"
                        style={{ width: "50px", verticalAlign: "middle", cursor: "pointer" }}
                        value={musicVolume}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setMusicVolume(val);
                          localStorage.setItem("logos_meditate_bg_music_volume", val);
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }
  }

  return (
    <div className="app-container animate-fade-up">
      {/* HEADER SECTION */}
      <div className="header-section">
        <div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "4px" }}>
            <span className="title-sub">Breathe in His Word</span>
            <div className={`sync-badge ${isCloudEnabled(user) ? "cloud" : "local"}`}>
              {isCloudEnabled(user) ? "☁️ Cloud" : "💾 Local"}
            </div>
          </div>
          <h1 className="title-display">Logos Meditation</h1>
        </div>
        <div className="header-actions-wrapper">
          {/* Action buttons */}
          <div className="header-buttons">
            <input
              ref={importFileRef}
              type="file"
              accept=".json,application/json"
              multiple
              style={{ display: "none" }}
              onChange={handleImportJSON}
            />
            <button
              className="btn-primary"
              onClick={startPlayAllCollections}
              disabled={collections.length === 0}
              title="Play all cards in all collections continuously"
              style={{ background: "linear-gradient(135deg, var(--gold), #d97706)", border: "none", color: "black", fontWeight: "600" }}
            >
              ⚡ Play All
            </button>
            <button className="btn-secondary" onClick={() => importFileRef.current?.click()} title="Import cards from JSON files">
              Import JSON
            </button>
            <button
              className="btn-secondary"
              onClick={handleOpenAddCardGlobal}
              disabled={collections.length === 0}
              title={collections.length === 0 ? "Create a collection first to add scriptures" : "Add Meditation Card"}
            >
              Add Card
            </button>
            <button className="btn-primary" onClick={handleOpenCreateCol}>
              Create Collection
            </button>
          </div>

          {/* User profile dropdown trigger */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
              className="avatar-btn"
              title={user.name}
            >
              {user.picture ? (
                <img src={user.picture} alt={user.name} className="avatar-img" />
              ) : (
                <div className="avatar-placeholder">{user.name.charAt(0).toUpperCase()}</div>
              )}
            </button>

            {profileDropdownOpen && (
              <div className="profile-dropdown animate-fade-up">
                <div className="dropdown-user-info">
                  <span className="user-name">{user.name}</span>
                  <span className="user-email">{user.email}</span>
                </div>
                <div className="dropdown-divider" />
                <div style={{ padding: "8px 16px" }}>
                  <label className="checkbox-container">
                    <input
                      type="checkbox"
                      className="checkbox-input"
                      checked={disableCountdown}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setDisableCountdown(val);
                        localStorage.setItem("logos_meditate_disable_countdown", val ? "true" : "false");
                      }}
                    />
                    Countdown
                  </label>
                </div>
                <div className="dropdown-divider" />
                <button className="dropdown-action-btn" onClick={handleSignOut}>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* COLLECTIONS GRID */}
      {collections.length === 0 ? (
        <div className="empty-state-panel glass-panel animate-fade-up">
          <div className="empty-state-glow" />
          <h2 className="empty-state-title">Your Sanctuary is Empty</h2>
          <p className="empty-state-text">
            Begin your meditation journey by creating a custom scripture collection or importing structured JSON files.
          </p>
          <div className="empty-state-actions">
            <button className="btn-primary" onClick={handleOpenCreateCol}>
              <PlusIcon /> Create Collection
            </button>
            <button className="btn-secondary" onClick={() => importFileRef.current?.click()}>
              ↑ Import JSON File
            </button>
          </div>
        </div>
      ) : (
        <div className="collections-grid">
          {collections.map(col => {
            const colCards = cards.filter(c => c.collectionId === col.id);
            return (
              <div key={col.id} className={`glass-panel collection-card theme-${col.colorTheme}`}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                  <span className="title-sub" style={{ color: "var(--theme-color)" }}>{col.colorTheme} Theme</span>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      className="action-icon-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleOpenEditCol(col);
                      }}
                      title="Edit Collection settings"
                    >
                      <EditIcon />
                    </button>
                    <button
                      className="action-icon-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        deleteCollection(col.id);
                      }}
                      title="Delete Collection"
                      style={{ color: "var(--ruby)" }}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
                <h2
                  style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem", fontWeight: "400", marginBottom: "8px", cursor: "pointer" }}
                  title="Click to view & manage cards"
                  onClick={() => { setCurrentModal({ type: "manage_cards", id: col.id }); setCardFormMode("list"); }}
                >{col.name}</h2>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "16px", flexGrow: "1" }}>{col.description || "No description provided."}</p>

                {/* Background Music Uploader Section */}
                <div style={{ marginBottom: "16px", padding: "10px 12px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
                    <span style={{ color: "var(--text-secondary)", fontWeight: "500" }}>Background Music</span>
                    {collectionMusicMap[col.id] && (
                      <button
                        type="button"
                        className="action-icon-btn"
                        style={{ padding: "2px", color: "var(--ruby)" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          handleDeleteMusic(col.id);
                        }}
                        title="Remove background music"
                      >
                        <TrashIcon style={{ width: "14px", height: "14px" }} />
                      </button>
                    )}
                  </div>
                  <div style={{ marginTop: "6px" }}>
                    {collectionMusicMap[col.id] ? (
                      <div style={{ fontSize: "12px", color: "var(--gold)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>🎵</span>
                        <span style={{ flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis" }} title={collectionMusicMap[col.id].name}>
                          {collectionMusicMap[col.id].name}
                        </span>
                      </div>
                    ) : (
                      <div>
                        <input
                          type="file"
                          accept="audio/mp3,audio/*"
                          id={`music-upload-${col.id}`}
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) {
                              handleUploadMusic(col.id, file);
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ width: "100%", padding: "6px 12px", fontSize: "11px", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            document.getElementById(`music-upload-${col.id}`)?.click();
                          }}
                        >
                          Upload MP3
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                  <button className="btn-primary" style={{ flex: 1, borderColor: "var(--theme-color)", color: "var(--theme-color)", background: "rgba(255,255,255,0.02)" }} onClick={() => startSession(col.id)}>
                    <PlayIcon /> Play
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      ...(batchLoadingState[col.id] === "✓ Ready" ? { color: "#10b981", borderColor: "#10b981", background: "rgba(16, 185, 129, 0.05)" } : {})
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBatchAudioConvert(col.id);
                    }}
                    disabled={batchLoadingState[col.id] && batchLoadingState[col.id] !== "✓ Ready"}
                  >
                    <SpeakerIcon style={batchLoadingState[col.id] === "✓ Ready" ? { color: "#10b981" } : {}} />
                    {batchLoadingState[col.id] || "Read All"}
                  </button>
                </div>

                <div className="collection-meta">
                  <span>{colCards.length} cards</span>
                  <span>⏱ {col.defaultTimeout}s timeout</span>
                </div>
              </div>
            );
          })}
        </div>
      )}



      {/* CREATE / EDIT COLLECTION MODAL */}
      {currentModal && (currentModal.type === "create_col" || currentModal.type === "edit_col") && (
        <div className="modal-overlay">
          <form className="glass-panel modal-content animate-fade-up" onSubmit={saveCollection}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ fontFamily: "var(--font-serif)", fontSize: "1.6rem" }}>
                {currentModal.type === "create_col" ? "Create Meditation Collection" : "Edit Collection"}
              </h3>
              <button type="button" className="action-icon-btn" onClick={() => setCurrentModal(null)}>
                <CloseIcon />
              </button>
            </div>

            <div className="form-group">
              <label>Collection Name</label>
              <input
                type="text"
                required
                className="input-field"
                value={colForm.name}
                onChange={e => setColForm({ ...colForm, name: e.target.value })}
                placeholder="e.g., Healing Scriptures"
              />
            </div>

            <div className="form-group">
              <label>Description (Optional)</label>
              <textarea
                className="input-field textarea-field"
                value={colForm.description}
                onChange={e => setColForm({ ...colForm, description: e.target.value })}
                placeholder="e.g., Promises of covenant health and restorative power."
              />
            </div>

            <div className="form-group">
              <label>Color Theme</label>
              <div className="color-picker-grid">
                {["love", "peace", "strength", "hope", "healing", "general"].map(themeName => (
                  <div
                    key={themeName}
                    className={`color-option theme-${themeName} ${colForm.colorTheme === themeName ? "selected" : ""}`}
                    style={{ background: "var(--theme-gradient, #555)", border: colForm.colorTheme === themeName ? "2px solid white" : "" }}
                    onClick={() => setColForm({ ...colForm, colorTheme: themeName })}
                    title={themeName}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px" }}>
              <div className="form-group">
                <label>Default Timeout (Seconds)</label>
                <input
                  type="number"
                  min="5"
                  required
                  className="input-field"
                  value={colForm.defaultTimeout}
                  onChange={e => setColForm({ ...colForm, defaultTimeout: parseInt(e.target.value, 10) })}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "32px" }}>
              <button type="button" className="btn-secondary" onClick={() => setCurrentModal(null)}>Cancel</button>
              <button type="submit" className="btn-primary">Save Changes</button>
            </div>
          </form>
        </div>
      )}

      {/* MANAGE CARDS MODAL */}
      {currentModal && currentModal.type === "manage_cards" && (() => {
        const col = collections.find(c => c.id === currentModal.id);
        if (!col) return null;
        const colCards = cards.filter(c => c.collectionId === col.id);

        return (
          <div className="modal-overlay">
            <div className="glass-panel modal-content animate-fade-up" style={{ maxWidth: "750px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", borderBottom: "1px solid var(--glass-border)", paddingBottom: "12px" }}>
                <div>
                  <span className="title-sub">Manage Cards In</span>
                  <h3 style={{ fontFamily: "var(--font-serif)", fontSize: "1.7rem", fontWeight: "300" }}>{col.name}</h3>
                </div>
                <button type="button" className="action-icon-btn" onClick={() => { setCurrentModal(null); setCardFormMode("list"); }}>
                  <CloseIcon />
                </button>
              </div>

              {cardFormMode === "list" ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <span style={{ fontSize: "14px", color: "var(--text-secondary)" }}>{colCards.length} Cards in Collection</span>
                    <button type="button" className="btn-primary" onClick={() => { setCardFormMode("add"); setCardForm({ verse: "", content: "", timeout: "", notes: "", collectionId: col.id }); }}>
                      <PlusIcon /> Add Meditation Card
                    </button>
                  </div>

                  <div style={{ maxHeight: "400px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px", paddingRight: "6px" }}>
                    {colCards.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)", fontSize: "14px" }}>
                        No cards in this collection yet. Click "Add Meditation Card" to begin.
                      </div>
                    ) : (
                      colCards.map(card => (
                        <div key={card.id} className="glass-panel card-item" style={{ margin: 0, padding: "16px" }}>
                          <div className="card-item-header">
                            <span style={{ fontFamily: "var(--font-sans)", fontWeight: "600", color: "var(--gold)", fontSize: "14px" }}>{card.verse}</span>
                            <div style={{ display: "flex", gap: "6px" }}>
                              <button type="button" className="action-icon-btn" onClick={() => { setCardFormMode("edit"); setCardForm({ ...card, timeout: card.timeout || "" }); setSelectedCardId(card.id); }}>
                                <EditIcon />
                              </button>
                              <button
                                type="button"
                                className="action-icon-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  deleteCard(card.id);
                                }}
                              >
                                <TrashIcon />
                              </button>
                            </div>
                          </div>
                          <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "1.05rem", marginBottom: "10px", color: "var(--text-primary)" }}>"{card.content}"</p>
                          <div style={{ display: "flex", gap: "12px", fontSize: "11px", color: "var(--text-muted)" }}>
                            <span>⏱ {card.timeout ? `${card.timeout}s custom` : `Inherited (${col.defaultTimeout}s)`}</span>
                            {card.notes && <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>📝 Has notes</span>}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <form onSubmit={saveCard}>
                  <h4 style={{ fontFamily: "var(--font-serif)", fontSize: "1.3rem", marginBottom: "16px", color: "var(--gold)" }}>
                    {cardFormMode === "add" ? "Add Meditation Card" : "Edit Meditation Card"}
                  </h4>

                  <div className="form-group">
                    <label>Bible Reference / Title</label>
                    <input
                      type="text"
                      required
                      className="input-field"
                      value={cardForm.verse}
                      onChange={e => setCardForm({ ...cardForm, verse: e.target.value })}
                      placeholder="e.g., John 3:16"
                    />
                  </div>

                  <div className="form-group">
                    <label>Scripture Content / Text</label>
                    <textarea
                      required
                      className="input-field textarea-field"
                      value={cardForm.content}
                      onChange={e => setCardForm({ ...cardForm, content: e.target.value })}
                      placeholder="e.g., For God so loved the world..."
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px" }}>
                    <div className="form-group">
                      <label>Custom Timeout (Seconds - optional)</label>
                      <input
                        type="number"
                        min="5"
                        className="input-field"
                        value={cardForm.timeout}
                        onChange={e => setCardForm({ ...cardForm, timeout: e.target.value })}
                        placeholder={`Leave blank to inherit collection default (${col.defaultTimeout}s)`}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Reflection Notes</label>
                    <textarea
                      className="input-field textarea-field"
                      value={cardForm.notes}
                      onChange={e => setCardForm({ ...cardForm, notes: e.target.value })}
                      placeholder="Declarations, thoughts, or custom prompts to display when meditating."
                    />
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
                    <button type="button" className="btn-secondary" onClick={() => setCardFormMode("list")}>Cancel</button>
                    <button type="submit" className="btn-primary">Save Card</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        );
      })()}

      {/* GLOBAL ADD CARD MODAL */}
      {currentModal && currentModal.type === "add_card_global" && (
        <div className="modal-overlay">
          <form className="glass-panel modal-content animate-fade-up" onSubmit={saveCardGlobal}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ fontFamily: "var(--font-serif)", fontSize: "1.6rem" }}>
                Add Meditation Card
              </h3>
              <button type="button" className="action-icon-btn" onClick={() => setCurrentModal(null)}>
                <CloseIcon />
              </button>
            </div>

            <div className="form-group">
              <label>Select Collection</label>
              <select
                required
                className="input-field"
                value={cardForm.collectionId}
                onChange={e => setCardForm({ ...cardForm, collectionId: e.target.value })}
              >
                {collections.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Bible Reference / Title</label>
              <input
                type="text"
                required
                className="input-field"
                value={cardForm.verse}
                onChange={e => setCardForm({ ...cardForm, verse: e.target.value })}
                placeholder="e.g., John 3:16"
              />
            </div>

            <div className="form-group">
              <label>Scripture Content / Text</label>
              <textarea
                required
                className="input-field textarea-field"
                value={cardForm.content}
                onChange={e => setCardForm({ ...cardForm, content: e.target.value })}
                placeholder="e.g., For God so loved the world..."
              />
            </div>

            <div className="form-group">
              <label>Custom Timeout (Seconds - optional)</label>
              <input
                type="number"
                min="5"
                className="input-field"
                value={cardForm.timeout}
                onChange={e => setCardForm({ ...cardForm, timeout: e.target.value })}
                placeholder="Leave blank to inherit collection default"
              />
            </div>

            <div className="form-group">
              <label>Reflection Notes</label>
              <textarea
                className="input-field textarea-field"
                value={cardForm.notes}
                onChange={e => setCardForm({ ...cardForm, notes: e.target.value })}
                placeholder="Initial thoughts, declarations, or observations to display during meditation."
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "32px" }}>
              <button type="button" className="btn-secondary" onClick={() => setCurrentModal(null)}>Cancel</button>
              <button type="submit" className="btn-primary">Save Card</button>
            </div>
          </form>
        </div>
      )}

      {/* IMPORT ERRORS MODAL */}
      {currentModal && currentModal.type === "import_errors" && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content animate-fade-up" style={{ borderColor: "var(--ruby)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "24px", color: "var(--ruby)" }}>⚠️</span>
                <h3 style={{ fontFamily: "var(--font-serif)", fontSize: "1.6rem", color: "var(--ruby)" }}>
                  Import Validation Failed
                </h3>
              </div>
              <button type="button" className="action-icon-btn" onClick={() => setCurrentModal(null)}>
                <CloseIcon />
              </button>
            </div>

            <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "16px" }}>
              The imported JSON file does not match the expected meditation card format. The following errors were found:
            </p>

            <div style={{
              maxHeight: "300px",
              overflowY: "auto",
              background: "rgba(248, 113, 113, 0.04)",
              border: "1px solid rgba(248, 113, 113, 0.15)",
              borderRadius: "12px",
              padding: "16px",
              marginBottom: "24px"
            }}>
              <ul style={{ listStyleType: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
                {currentModal.errors.map((err, idx) => (
                  <li key={idx} style={{ display: "flex", gap: "8px", fontSize: "13px", color: "rgba(255, 255, 255, 0.85)", textAlign: "left" }}>
                    <span style={{ color: "var(--ruby)", flexShrink: 0 }}>•</span>
                    <span>{err}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" className="btn-secondary" style={{ borderColor: "var(--ruby)", color: "var(--ruby)", background: "rgba(248, 113, 113, 0.05)" }} onClick={() => setCurrentModal(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}
