import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listEnglishVoices,
  reconcileSelectedVoiceURI,
  resolveSpeechVoice,
  speechErrorMessage,
  speechStartFailureMessage,
  type SpeechVoiceOption,
} from '../domain/speech';

export type SpeechPlaybackState = 'idle' | 'loading' | 'speaking' | 'success' | 'error';

const VOICE_STORAGE_KEY = 'wordbuddy.speech.voice.v1';

// Give slow or network-backed voices time to start before treating a missing
// onstart event as a real failure.
const SPEECH_START_TIMEOUT_MS = 4000;

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
  const startTimerRef = useRef<number | null>(null);
  const watchdogRef = useRef<number | null>(null);
  const maxDurationRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (startTimerRef.current !== null) window.clearTimeout(startTimerRef.current);
    if (watchdogRef.current !== null) window.clearTimeout(watchdogRef.current);
    if (maxDurationRef.current !== null) window.clearTimeout(maxDurationRef.current);
    startTimerRef.current = null;
    watchdogRef.current = null;
    maxDurationRef.current = null;
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

    clearTimers();
    utteranceRef.current = null;
    // Chrome's speech engine can wedge after long page uptime or repeated use and
    // then silently stop producing audio without firing any events. Cancelling
    // before every utterance resets that stuck state.
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    // Resolve against a fresh voice list at speak time. Voice objects cached from
    // an earlier getVoices() call can go stale, and some browsers then silently
    // refuse to speak an utterance bound to a stale voice.
    const voice = resolveSpeechVoice(synth.getVoices(), voiceURI);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? 'en-US';
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utteranceRef.current = utterance;
    // Upper bound on how long this utterance could reasonably play, so the UI
    // always resolves even when the engine never fires onend.
    const maxDurationMs = Math.min(20_000, 2_500 + text.length * 120);
    setPlaybackState('loading');
    setError('');

    utterance.onstart = () => {
      if (utteranceRef.current !== utterance) return;
      if (watchdogRef.current !== null) window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
      setPlaybackState('speaking');
      maxDurationRef.current = window.setTimeout(() => {
        if (utteranceRef.current !== utterance) return;
        utteranceRef.current = null;
        setPlaybackState('success');
      }, maxDurationMs);
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

    function startSpeaking() {
      if (utteranceRef.current !== utterance) return;
      synth.resume();
      synth.speak(utterance);
      watchdogRef.current = window.setTimeout(() => {
        if (utteranceRef.current !== utterance) return;
        // A healthy browser fires onstart within a second. If it never arrives,
        // audio is almost certainly not being produced here (embedded webview,
        // or a voice that needs to be downloaded). Surface guidance and stop the
        // spinner without cancelling anything that might still start.
        utteranceRef.current = null;
        setPlaybackState('error');
        setError(speechStartFailureMessage(window.navigator.userAgent));
      }, SPEECH_START_TIMEOUT_MS);
    }

    // Let the cancel() settle before speaking; Chrome drops utterances that are
    // spoken in the same tick as a cancel.
    startTimerRef.current = window.setTimeout(startSpeaking, 60);
  }, [clearTimers, isSupported, selectedVoiceURI]);

  const selectedVoice = resolveSpeechVoice(voices, selectedVoiceURI);
  const isPlaybackAvailable = isSupported
    && Boolean(selectedVoice)
    && playbackState !== 'error';

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