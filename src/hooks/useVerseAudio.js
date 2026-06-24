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

  const speak = useCallback(async (text) => {
    if (!text || text.trim().length === 0) return;

    // If already speaking, stop
    if (isSpeaking && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsSpeaking(false);
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
        
        if (!ELEVENLABS_API_KEY) {
          console.error("ElevenLabs API key not configured. Set VITE_ELEVENLABS_API_KEY in .env");
          alert("Audio feature not configured. Please add your ElevenLabs API key.");
          setIsLoading(false);
          return;
        }

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
          const errorData = await response.json();
          throw new Error(errorData.detail?.message || `API error: ${response.status}`);
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

      // Clean up previous audio
      if (audioRef.current) {
        audioRef.current.pause();
        if (audioRef.current.src) {
          URL.revokeObjectURL(audioRef.current.src);
        }
      }

      // Create new audio element
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onplay = () => setIsSpeaking(true);
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };

      setIsLoading(false);
      await audio.play();
    } catch (error) {
      console.error("ElevenLabs TTS error:", error);
      alert(`Audio playback failed: ${error.message}`);
      setIsLoading(false);
      setIsSpeaking(false);
    }
  }, [isSpeaking, user]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsSpeaking(false);
  }, []);

  return { speak, stop, isSpeaking, isLoading };
}

