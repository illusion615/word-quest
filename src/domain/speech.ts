export interface SpeechVoiceOption {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
}

const LANGUAGE_PRIORITY = ['en-US', 'en-GB', 'en-AU', 'en-CA', 'en-IE', 'en-IN', 'en-ZA'];

function languageRank(lang: string): number {
  const index = LANGUAGE_PRIORITY.indexOf(lang);
  return index === -1 ? LANGUAGE_PRIORITY.length : index;
}

export function listEnglishVoices(
  voices: readonly SpeechVoiceOption[],
): SpeechVoiceOption[] {
  const unique = new Map<string, SpeechVoiceOption>();

  for (const voice of voices) {
    if (!voice.lang.toLowerCase().startsWith('en')) continue;
    const key = `${voice.voiceURI}\u0000${voice.lang}`;
    if (!unique.has(key)) unique.set(key, voice);
  }

  return [...unique.values()].sort((left, right) => (
    languageRank(left.lang) - languageRank(right.lang)
    || left.lang.localeCompare(right.lang)
    || Number(right.default) - Number(left.default)
    || left.name.localeCompare(right.name)
  ));
}

export function resolveSpeechVoice(
  voices: readonly SpeechVoiceOption[],
  selectedVoiceURI: string,
): SpeechVoiceOption | undefined {
  if (selectedVoiceURI) {
    const selected = voices.find((voice) => voice.voiceURI === selectedVoiceURI);
    if (selected) return selected;
  }

  // Prefer on-device (local) voices for auto-selection: browser "Online (Natural)"
  // voices (e.g. Edge's Microsoft neural voices) route through the network and
  // frequently produce no audio through the Web Speech API, so they make a poor
  // default even when the system marks one as the default voice.
  const englishVoices = listEnglishVoices(voices);
  const localEnglish = englishVoices.filter((voice) => voice.localService);
  return localEnglish.find((voice) => voice.lang === 'en-US')
    ?? localEnglish[0]
    ?? englishVoices.find((voice) => voice.default)
    ?? englishVoices.find((voice) => voice.lang === 'en-US')
    ?? englishVoices[0]
    ?? voices.find((voice) => voice.default)
    ?? voices[0];
}

export function reconcileSelectedVoiceURI(
  selectedVoiceURI: string,
  voices: readonly SpeechVoiceOption[],
): string {
  if (!selectedVoiceURI || voices.length === 0) return selectedVoiceURI;
  return voices.some((voice) => voice.voiceURI === selectedVoiceURI) ? selectedVoiceURI : '';
}

export function speechErrorMessage(error: string): string {
  switch (error) {
    case 'not-allowed':
      return '浏览器阻止了发音，请点击播放按钮后重试。';
    case 'audio-busy':
      return '音频设备正忙，请稍后重试。';
    case 'network':
      return '这个音色需要联网，当前无法加载。';
    case 'language-unavailable':
    case 'voice-unavailable':
      return '所选音色暂时不可用，请换一个音色。';
    case 'text-too-long':
    case 'text-unavailable':
      return '当前内容无法朗读。';
    default:
      return '发音没有成功播放，请换一个音色重试。';
  }
}

export function speechStartFailureMessage(userAgent: string): string {
  if (/\bElectron\//i.test(userAgent)) {
    return '当前内置浏览器无法输出系统发音，请在 Safari 或 Chrome 中打开本站。';
  }
  return '没有检测到发音输出，请刷新页面，或改选一个“本地”音色后重试，也可改用 Chrome、Safari 打开本站。';
}
