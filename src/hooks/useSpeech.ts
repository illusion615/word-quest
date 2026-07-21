import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listEnglishVoices,
  reconcileSelectedVoiceURI,
  resolveSpeechVoice,
  speechErrorMessage,
  type SpeechVoiceOption,
} from '../domain/speech';

export type SpeechPlaybackState = 'idle' | 'loading' | 'speaking' | 'success' | 'error';

const VOICE_STORAGE_KEY = 'wordbuddy.speech.voice.v1';

function storedVoiceURI(): string {
  try {
    return window.localStorage.getItem(VOICE_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function useSpeech() {
  const [isSupported, setIsSupported] = useState(false);
  const [voices, setVoices] = useState<SpeechVoiceOption[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState(storedVoiceURI);
  const [playbackState, setPlaybackState] = useState<SpeechPlaybackState>('idle');
  const [error, setError] = useState('');
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const maxDurationRef = useRef<number | null>(null);
  const pendingStartRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (maxDurationRef.current !== null) window.clearTimeout(maxDurationRef.current);
    if (pendingStartRef.current !== null) window.clearTimeout(pendingStartRef.current);
    maxDurationRef.current = null;
    pendingStartRef.current = null;
  }, []);

  const stop = useCallback(() => {
    clearTimers();
    utteranceRef.current = null;
    window.speechSynthesis?.cancel();
    setPlaybackState('idle');
    setError('');
  }, [clearTimers]);

  useEffect(() => {
    const supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    setIsSupported(supported);
    if (!supported) return undefined;

    const synth = window.speechSynthesis;
    function refreshVoices() {
      const available = synth.getVoices();
      const englishVoices = listEnglishVoices(available);
      setVoices(englishVoices);
      setSelectedVoiceURI((current) => {
        const reconciled = reconcileSelectedVoiceURI(current, englishVoices);
        if (reconciled === current) return current;
        try {
          window.localStorage.removeItem(VOICE_STORAGE_KEY);
        } catch {
          // Storage can be unavailable in privacy-restricted browser contexts.
        }
        return reconciled;
      });
    }

    refreshVoices();
    synth.addEventListener('voiceschanged', refreshVoices);
    const refreshTimer = window.setTimeout(refreshVoices, 500);

    return () => {
      window.clearTimeout(refreshTimer);
      synth.removeEventListener('voiceschanged', refreshVoices);
      clearTimers();
      utteranceRef.current = null;
      synth.cancel();
    };
  }, [clearTimers]);

  const saveVoice = useCallback((voiceURI: string) => {
    const validVoiceURI = voices.some((voice) => voice.voiceURI === voiceURI) ? voiceURI : '';
    setSelectedVoiceURI(validVoiceURI);
    setPlaybackState('idle');
    setError('');
    try {
      if (validVoiceURI) window.localStorage.setItem(VOICE_STORAGE_KEY, validVoiceURI);
      else window.localStorage.removeItem(VOICE_STORAGE_KEY);
    } catch {
      // The active selection still works for this page even when storage is unavailable.
    }
  }, [voices]);

  const speak = useCallback((text: string, voiceURI = selectedVoiceURI) => {
    const synth = window.speechSynthesis;
    if (!isSupported || !synth || !text.trim()) {
      setPlaybackState('error');
      setError('当前浏览器不支持系统发音。');
      return;
    }

    const startUtterance = () => {
      const utterance = new SpeechSynthesisUtterance(text);
      // Resolve against a fresh voice list at speak time; cached voice objects
      // can go stale and some engines then refuse to speak.
      const voice = resolveSpeechVoice(synth.getVoices(), voiceURI);
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang ?? 'en-US';
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;
      utteranceRef.current = utterance;
      // Upper bound so the UI always resolves even if the engine never fires onend.
      const maxDurationMs = Math.min(20_000, 2_500 + text.length * 120);

      // onstart is unreliable (Edge often never fires it), so it only upgrades
      // the label; success/failure are driven solely by onend/onerror.
      utterance.onstart = () => {
        if (utteranceRef.current === utterance) setPlaybackState('speaking');
      };
      utterance.onend = () => {
        if (utteranceRef.current !== utterance) return;
        clearTimers();
        utteranceRef.current = null;
        setPlaybackState('success');
      };
      utterance.onerror = (event) => {
        if (utteranceRef.current !== utterance) return;
        clearTimers();
        utteranceRef.current = null;
        if (event.error === 'canceled' || event.error === 'interrupted') {
          setPlaybackState('idle');
          return;
        }
        setPlaybackState('error');
        setError(speechErrorMessage(event.error));
      };

      setPlaybackState('speaking');
      setError('');
      // resume() unsticks an engine left in a wedged/paused state by an earlier
      // cancel() — a browser-global Edge/Chrome quirk that can survive reloads.
      synth.resume();
      synth.speak(utterance);

      maxDurationRef.current = window.setTimeout(() => {
        if (utteranceRef.current !== utterance) return;
        utteranceRef.current = null;
        setPlaybackState('success');
      }, maxDurationMs);
    };

    clearTimers();
    utteranceRef.current = null;
    // ROOT-CAUSE FIX: never call cancel() in the same tick as speak(). Edge
    // drops an utterance spoken immediately after a cancel() (proven: it fires
    // `canceled` with no audio) and repeated same-tick cancels wedge the global
    // engine. So cancel ONLY to interrupt active playback, and defer the
    // replacement one tick. The common path (nothing playing) speaks
    // synchronously to keep the user gesture, mirroring the stable Study-Room player.
    if (synth.speaking || synth.pending) {
      synth.cancel();
      pendingStartRef.current = window.setTimeout(startUtterance, 0);
    } else {
      startUtterance();
    }
  }, [clearTimers, isSupported, selectedVoiceURI]);

  const selectedVoice = resolveSpeechVoice(voices, selectedVoiceURI);
  // Capability is static: supported engine + an available voice. It must NOT
  // depend on the transient playbackState, or a single runtime error would
  // wrongly disable listening questions for the rest of the session.
  const isPlaybackAvailable = isSupported && Boolean(selectedVoice);

  return {
    isSupported,
    isPlaybackAvailable,
    voices,
    selectedVoiceURI,
    selectedVoice,
    playbackState,
    isSpeaking: playbackState === 'loading' || playbackState === 'speaking',
    error,
    saveVoice,
    speak,
    stop,
  };
}