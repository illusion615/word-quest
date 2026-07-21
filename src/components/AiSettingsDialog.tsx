import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, PlugZap, X } from '../icons';
import type { AiConnectionConfig } from '../services/aiClient';

interface AiSettingsDialogProps {
  open: boolean;
  config: AiConnectionConfig;
  onClose: () => void;
  onSave: (config: AiConnectionConfig) => void;
  onTest: (config: AiConnectionConfig) => Promise<string>;
}

export function AiSettingsDialog({
  open,
  config,
  onClose,
  onSave,
  onTest,
}: AiSettingsDialogProps) {
  const [draft, setDraft] = useState(config);
  const [testState, setTestState] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  useEffect(() => {
    if (open) {
      setDraft(config);
      setTestState('idle');
      setTestMessage('');
    }
  }, [config, open]);

  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  function update<K extends keyof AiConnectionConfig>(key: K, value: AiConnectionConfig[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function handleTest() {
    setTestState('testing');
    setTestMessage('');
    try {
      await onTest(draft);
      setTestState('success');
      setTestMessage('连接成功。');
    } catch (error) {
      setTestState('error');
      setTestMessage(error instanceof Error ? error.message : '连接测试失败。');
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(draft);
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-settings-title">
        <div className="dialog-heading">
          <div>
            <span className="dialog-icon"><PlugZap aria-hidden="true" /></span>
            <div><h2 id="ai-settings-title">AI 连接</h2><p>可选的单词讲解增强</p></div>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭 AI 设置">
            <X aria-hidden="true" />
          </button>
        </div>

        <form className="settings-form" onSubmit={handleSubmit}>
          <label>
            接口地址
            <input
              type="url"
              value={draft.endpoint}
              onChange={(event) => update('endpoint', event.target.value)}
              placeholder="https://api.example.com/v1"
              required
            />
            <small>支持 base URL 或完整的 /chat/completions 地址</small>
          </label>
          <label>
            模型或部署名
            <input
              value={draft.model}
              onChange={(event) => update('model', event.target.value)}
              placeholder="例如 gpt-4o-mini"
            />
          </label>
          <div className="settings-row">
            <label>
              鉴权方式
              <select
                value={draft.authMode}
                onChange={(event) => update('authMode', event.target.value as AiConnectionConfig['authMode'])}
              >
                <option value="bearer">Bearer Token</option>
                <option value="api-key">api-key 请求头</option>
              </select>
            </label>
            <label>
              输出语言
              <input
                value={draft.outputLanguage}
                onChange={(event) => update('outputLanguage', event.target.value)}
                placeholder="Simplified Chinese"
              />
            </label>
          </div>
          <label>
            API Key
            <div className="secret-input">
              <KeyRound aria-hidden="true" />
              <input
                type="password"
                value={draft.apiKey}
                onChange={(event) => update('apiKey', event.target.value)}
                autoComplete="off"
                required
              />
            </div>
            <small>密钥只保存在当前浏览器会话，不会写入构建文件或长期存储。</small>
          </label>

          <div className="connection-note">
            静态站点会从浏览器直接请求该接口；服务端必须允许当前站点的 CORS 来源。
          </div>
          {testState !== 'idle' && (
            <p className={`test-result is-${testState}`} aria-live="polite">{testMessage || '正在测试连接...'}</p>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={handleTest}
              disabled={testState === 'testing' || !draft.endpoint.trim() || !draft.apiKey.trim()}
            >
              测试连接
            </button>
            <button type="submit" className="primary-button">保存连接</button>
          </div>
        </form>
      </section>
    </div>
  );
}