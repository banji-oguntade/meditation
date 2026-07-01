import { useState, useCallback, useRef } from "react";
import { getCachedAudio, cacheAudio } from "../utils/audioCache";

/**
 * Hook: Text-to-Speech for verse content using ElevenLabs API
 * Requires VITE_ELEVENLABS_API_KEY environment variable
 * Uses eleven_v3 model (most expressive)
 */
const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY || "";
const ELEVENLABS_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"; // George voice (calm, clear)

export function useVerseAudio(user) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef(null);
  const currentTextRef = useRef("");

  const speakNative = useCallback((text) => {
    if (!("speechSynthesis" in window)) {
      alert("Text-to-speech is not supported in this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.lang.startsWith("en") && (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Male") || v.name.includes("George"))) || voices.find(v => v.lang.startsWith("en"));
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    utterance.rate = 0.85;
    utterance.onstart = () => {
      setIsSpeaking(true);
      currentTextRef.current = text;
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      currentTextRef.current = "";
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      currentTextRef.current = "";
    };
    window.speechSynthesis.speak(utterance);
  }, []);

  const speak = useCallback(async (text) => {
    if (!text || text.trim().length === 0) return;

    // Toggle off: If already speaking the EXACT same text, stop it
    if (isSpeaking && currentTextRef.current === text) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setIsSpeaking(false);
      currentTextRef.current = "";
      return;
    }

    // New text transition: Stop any active speech of other texts
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    currentTextRef.current = text;

    if (!ELEVENLABS_API_KEY) {
      console.warn("ElevenLabs API key not configured. Falling back to native browser speech synthesis.");
      speakNative(text);
      return;
    }

    setIsLoading(true);
    const userEmail = user?.email || "guest";

    try {
      // 1. Try to load from IndexedDB cache first
      let audioBlob = await getCachedAudio(userEmail, text);
      let audioUrl = "";

      if (audioBlob) {
        console.log(`[AudioCache] Cache hit! Using cached audio for key: ${userEmail}::${text.trim().substring(0, 30)}...`);
        audioUrl = URL.createObjectURL(audioBlob);
      } else {
        console.log(`[AudioCache] Cache miss. Fetching from ElevenLabs API for: ${text.trim().substring(0, 30)}...`);

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

        audioBlob = await response.blob();
        audioUrl = URL.createObjectURL(audioBlob);

        // 2. Cache the newly fetched audio Blob asynchronously
        try {
          await cacheAudio(userEmail, text, audioBlob);
        } catch (cacheError) {
          console.error("[AudioCache] Failed to store audio in cache:", cacheError);
        }
      }

      // Clean up previous audio URLs if any
      if (audioRef.current && audioRef.current.src) {
        URL.revokeObjectURL(audioRef.current.src);
      }

      // Create new audio element
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onplay = () => {
        setIsSpeaking(true);
        currentTextRef.current = text;
      };
      audio.onended = () => {
        setIsSpeaking(false);
        currentTextRef.current = "";
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        currentTextRef.current = "";
        URL.revokeObjectURL(audioUrl);
      };

      setIsLoading(false);
      await audio.play();
    } catch (error) {
      if (error.name === "AbortError") {
        console.log("[Audio] Playback aborted intentionally.");
        return;
      }
      console.error("ElevenLabs TTS error, falling back to browser synthesis:", error);
      setIsLoading(false);
      speakNative(text);
    }
  }, [isSpeaking, user, speakNative]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    currentTextRef.current = "";
  }, []);

  return { speak, stop, isSpeaking, isLoading };
}
