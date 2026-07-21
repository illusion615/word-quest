import { describe, expect, it } from 'vitest';
import {
  listEnglishVoices,
  reconcileSelectedVoiceURI,
  resolveSpeechVoice,
  speechErrorMessage,
  speechStartFailureMessage,
  type SpeechVoiceOption,
} from './speech';

function voice(
  name: string,
  lang: string,
  options: Partial<SpeechVoiceOption> = {},
): SpeechVoiceOption {
  return {
    voiceURI: options.voiceURI ?? name,
    name,
    lang,
    localService: options.localService ?? true,
    default: options.default ?? false,
  };
}

describe('speech voices', () => {
  it('keeps unique English voices and groups common accents first', () => {
    const voices = listEnglishVoices([
      voice('Mandarin', 'zh-CN'),
      voice('Daniel', 'en-GB'),
      voice('Samantha', 'en-US', { default: true }),
      voice('Samantha duplicate', 'en-US', { voiceURI: 'Samantha', default: true }),
      voice('Karen', 'en-AU'),
    ]);

    expect(voices.map((item) => `${item.lang}:${item.name}`)).toEqual([
      'en-US:Samantha',
      'en-GB:Daniel',
      'en-AU:Karen',
    ]);
  });

  it('uses an explicit selection and falls back to the system English default', () => {
    const voices = [
      voice('Daniel', 'en-GB'),
      voice('Samantha', 'en-US', { default: true }),
      voice('Ting-Ting', 'zh-CN'),
    ];

    expect(resolveSpeechVoice(voices, 'Daniel')?.name).toBe('Daniel');
    expect(resolveSpeechVoice(voices, 'missing')?.name).toBe('Samantha');
    expect(resolveSpeechVoice(voices, '')?.name).toBe('Samantha');
  });

  it('prefers a local voice over an online voice that the system marks default', () => {
    const voices = [
      voice('Microsoft Andrew Online', 'en-US', { default: true, localService: false }),
      voice('Samantha', 'en-US', { localService: true }),
    ];

    expect(resolveSpeechVoice(voices, '')?.name).toBe('Samantha');
  });

  it('keeps a saved voice until the asynchronous browser list is ready', () => {
    expect(reconcileSelectedVoiceURI('Daniel', [])).toBe('Daniel');
    expect(reconcileSelectedVoiceURI('Daniel', [voice('Daniel', 'en-GB')])).toBe('Daniel');
    expect(reconcileSelectedVoiceURI('missing', [voice('Daniel', 'en-GB')])).toBe('');
  });

  it('returns actionable messages for browser playback failures', () => {
    expect(speechErrorMessage('not-allowed')).toContain('点击播放按钮');
    expect(speechErrorMessage('voice-unavailable')).toContain('换一个音色');
    expect(speechErrorMessage('unknown')).toContain('没有成功播放');
    expect(speechStartFailureMessage('Chrome/148 Electron/42.6.0')).toContain('Safari 或 Chrome');
    expect(speechStartFailureMessage('Chrome/148 Safari/537.36')).toContain('本地');
  });
});
