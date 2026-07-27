import { useEffect, useState, type FormEvent } from 'react';
import { Play, Volume2, X } from '../icons';
import type { SpeechVoiceOption } from '../domain/speech';
import type { SpeechPlaybackState } from '../hooks/useSpeech';

interface SpeechSettingsDialogProps {
  open: boolean;
  isSupported: boolean;
  voices: SpeechVoiceOption[];
  selectedVoiceURI: string;
  playbackState: SpeechPlaybackState;
  error: string;
  onClose: () => void;
  onPreview: (text: string, voiceURI: string) => void;
  onSave: (voiceURI: string) => void;
  onStop: () => void;
}

const PREVIEW_TEXT = 'Hello, this is your Word Quest voice.';

function groupVoices(voices: SpeechVoiceOption[]): Map<string, SpeechVoiceOption[]> {
  const groups = new Map<string, SpeechVoiceOption[]>();
  for (const voice of voices) {
    const group = groups.get(voice.lang) ?? [];
    group.push(voice);
    groups.set(voice.lang, group);
  }
  return groups;
}

export function SpeechSettingsDialog({
  open,
  isSupported,
  voices,
  selectedVoiceURI,
  playbackState,
  error,
  onClose,
  onPreview,
  onSave,
  onStop,
}: SpeechSettingsDialogProps) {
  const [draftVoiceURI, setDraftVoiceURI] = useState(selectedVoiceURI);
  const [previewRequested, setPreviewRequested] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraftVoiceURI(selectedVoiceURI);
    setPreviewRequested(false);
  }, [open, selectedVoiceURI]);

  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      onStop();
      onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onStop, open]);

  if (!open) return null;

  const voiceGroups = groupVoices(voices);
  const previewBusy = playbackState === 'loading' || playbackState === 'speaking';

  function closeDialog() {
    onStop();
    onClose();
  }

  function handlePreview() {
    setPreviewRequested(true);
    onPreview(PREVIEW_TEXT, draftVoiceURI);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onStop();
    onSave(draftVoiceURI);
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) closeDialog();
    }}>
      <section className="settings-dialog speech-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="speech-settings-title">
        <div className="dialog-heading">
          <div>
            <span className="dialog-icon"><Volume2 aria-hidden="true" /></span>
            <div><h2 id="speech-settings-title">发音设置</h2><p>选择听音训练使用的英语音色</p></div>
          </div>
          <button type="button" className="icon-button" onClick={closeDialog} aria-label="关闭发音设置">
            <X aria-hidden="true" />
          </button>
        </div>

        <form className="settings-form" onSubmit={handleSubmit}>
          <label>
            英语音色
            <select
              value={draftVoiceURI}
              onChange={(event) => {
                onStop();
                setPreviewRequested(false);
                setDraftVoiceURI(event.target.value);
              }}
              disabled={!isSupported || voices.length === 0}
            >
              <option value="">自动选择（推荐）</option>
              {[...voiceGroups].map(([lang, options]) => (
                <optgroup key={lang} label={lang}>
                  {options.map((voice) => (
                    <option key={`${voice.voiceURI}-${voice.lang}`} value={voice.voiceURI}>
                      {voice.name}{voice.default ? '（系统默认）' : ''}{voice.localService ? ' · 本地' : ' · 在线'}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <small>{voices.length > 0 ? `已检测到 ${voices.length} 个英语音色` : '正在读取系统英语音色'}</small>
          </label>

          {!isSupported && (
            <p className="test-result is-error" role="alert">当前浏览器不支持系统发音。</p>
          )}
          {previewRequested && playbackState !== 'idle' && (
            <p className={`test-result is-${playbackState}`} aria-live="polite">
              {playbackState === 'loading' && '正在准备试听...'}
              {playbackState === 'speaking' && '正在试听...'}
              {playbackState === 'success' && '试听完成。'}
              {playbackState === 'error' && error}
            </p>
          )}

          <div className="dialog-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={handlePreview}
              disabled={!isSupported || previewBusy}
            >
              <Play aria-hidden="true" /> {previewBusy ? '正在试听' : '试听此音色'}
            </button>
            <button type="submit" className="primary-button" disabled={!isSupported}>
              保存音色
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
