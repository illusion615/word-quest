import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  CircleHelp,
  Clock3,
  ListChecks,
  Sparkles,
  Swords,
  Target,
  X,
} from '../icons';
import {
  APP_RELEASES,
  APP_VERSION,
  type ReleaseIcon,
} from '../data/releaseNotes';
import type { HelpSection } from '../hooks/useHelpCenter';

interface HelpCenterDialogProps {
  open: boolean;
  initialSection: HelpSection;
  celebrate: boolean;
  onClose: () => void;
  onSectionChange: (section: HelpSection) => void;
}

const GUIDE_STEPS = [
  {
    icon: Swords,
    eyebrow: '第 1 步 · 找到当前对手',
    title: '认准正前方的词怪',
    description: '词怪队列会围成一圈，正前方最大、最亮的词怪就是当前题目。怪物旁边的单词可以点读，帮助你把拼写和发音连起来。',
    note: '两侧的词怪是之后会遇到的对手，不需要提前作答。',
  },
  {
    icon: Target,
    eyebrow: '第 2 步 · 完成攻防',
    title: '答题就是发动攻击',
    description: '答对会命中词怪，快速连续答对还能积累连击；答错时词怪会反击，但不会清空你的学习进度。',
    note: '听音、识义、拼写和语境题会随着记忆状态自动切换。',
  },
  {
    icon: BookOpenCheck,
    eyebrow: '第 3 步 · 看懂错题',
    title: '错了先看解析，再继续',
    description: '答错后不会立刻跳题。先核对正确选项，打开词汇详情查看每个义项的助记、用法和例句，再主动进入下一题。',
    note: '错词会由 FSRS 自动安排重学，不用自己记住何时复习。',
  },
  {
    icon: Clock3,
    eyebrow: '第 4 步 · 推进关卡',
    title: '完成本批，等待下一次复习',
    description: '普通关会分批引入新词；每四个普通关会迎来一次 Boss 综合考核。通关和长期掌握是两回事，系统会继续按照遗忘风险安排复习。',
    note: '首页的关卡地图、覆盖率和成就会记录你的长期进展。',
  },
] as const;

const RELEASE_ICONS: Record<ReleaseIcon, typeof Sparkles> = {
  book: BookOpenCheck,
  help: CircleHelp,
  sparkles: Sparkles,
  swords: Swords,
  target: Target,
};

export function HelpCenterDialog({
  open,
  initialSection,
  celebrate,
  onClose,
  onSectionChange,
}: HelpCenterDialogProps) {
  const [section, setSection] = useState<HelpSection>(initialSection);
  const [guideStep, setGuideStep] = useState(0);

  useEffect(() => {
    if (!open) return;
    setSection(initialSection);
    if (initialSection === 'guide') setGuideStep(0);
  }, [initialSection, open]);

  useEffect(() => {
    if (!open || !celebrate) return undefined;
    let active = true;
    let reset: (() => void) | null = null;
    let finaleTimer: number | null = null;
    void import('canvas-confetti').then(({ default: confetti }) => {
      if (!active || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const fire = confetti.create(undefined, {
        resize: true,
        useWorker: true,
        disableForReducedMotion: true,
      });
      reset = () => fire.reset();
      const common = {
        colors: ['#e5383b', '#f6ad0f', '#2ea44f', '#2f6bff', '#ffffff'],
        disableForReducedMotion: true,
        scalar: 0.9,
        ticks: 220,
        zIndex: 120,
      };
      fire({ ...common, particleCount: 100, angle: 60, spread: 70, origin: { x: 0, y: 0.7 } });
      fire({ ...common, particleCount: 100, angle: 120, spread: 70, origin: { x: 1, y: 0.7 } });
      finaleTimer = window.setTimeout(() => fire({
        ...common,
        particleCount: 120,
        spread: 130,
        startVelocity: 34,
        origin: { x: 0.5, y: 0.35 },
      }), 260);
    });
    return () => {
      active = false;
      if (finaleTimer !== null) window.clearTimeout(finaleTimer);
      reset?.();
    };
  }, [celebrate, open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, open]);

  if (!open) return null;
  const step = GUIDE_STEPS[guideStep];
  const StepIcon = step.icon;

  return (
    <div
      className="dialog-backdrop help-center-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="settings-dialog help-center-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-center-title"
      >
        <div className="help-center-chrome">
          <header className="help-center-header">
            <div>
              <span className="help-center-mark"><CircleHelp aria-hidden="true" /></span>
              <div>
                <h2 id="help-center-title">帮助中心</h2>
                <p>快速上手，也能随时回看新功能</p>
              </div>
            </div>
            <button type="button" className="icon-button" onClick={onClose} aria-label="关闭帮助中心">
              <X aria-hidden="true" />
            </button>
          </header>

          <div className="help-center-tabs" role="tablist" aria-label="帮助中心内容">
            <button
              type="button"
              role="tab"
              aria-selected={section === 'guide'}
              className={section === 'guide' ? 'is-active' : ''}
              onClick={() => {
                setSection('guide');
                onSectionChange('guide');
                setGuideStep(0);
              }}
            >
              <Swords aria-hidden="true" /> 新手指引
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={section === 'updates'}
              className={section === 'updates' ? 'is-active' : ''}
              onClick={() => {
                setSection('updates');
                onSectionChange('updates');
              }}
            >
              <Sparkles aria-hidden="true" /> 更新内容
            </button>
          </div>
        </div>

        {section === 'guide' ? (
          <div className="guide-panel">
            <div className="guide-visual" data-step={guideStep + 1} aria-hidden="true">
              <span className="guide-orbit-dot is-left" />
              <span className="guide-orbit-dot is-right" />
              <span className="guide-visual-icon"><StepIcon /></span>
              <b>{guideStep + 1}</b>
            </div>
            <div className="guide-copy">
              <p className="section-index">{step.eyebrow}</p>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
              <div className="guide-note"><CheckCircle2 aria-hidden="true" /> {step.note}</div>
            </div>
            <div className="guide-progress" aria-label={`新手指引第 ${guideStep + 1} 步，共 ${GUIDE_STEPS.length} 步`}>
              {GUIDE_STEPS.map((item, index) => (
                <button
                  key={item.title}
                  type="button"
                  className={index === guideStep ? 'is-active' : ''}
                  onClick={() => setGuideStep(index)}
                  aria-label={`查看第 ${index + 1} 步：${item.title}`}
                />
              ))}
            </div>
            <div className="guide-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setGuideStep((current) => Math.max(0, current - 1))}
                disabled={guideStep === 0}
              >
                <ArrowLeft aria-hidden="true" /> 上一步
              </button>
              {guideStep < GUIDE_STEPS.length - 1 ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => setGuideStep((current) => current + 1)}
                >
                  下一步 <ArrowRight aria-hidden="true" />
                </button>
              ) : (
                <button type="button" className="primary-button" onClick={onClose}>
                  开始挑战 <Swords aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="whats-new-panel">
            <div className="whats-new-lead">
              <span><Sparkles aria-hidden="true" /></span>
              <div>
                <p className="section-index">当前版本 · v{APP_VERSION}</p>
                <h3>这次有什么新变化？</h3>
                <p>只讲你能直接感受到的变化，不堆技术细节。</p>
              </div>
            </div>
            <div className="release-list">
              {APP_RELEASES.map((release) => (
                <article key={release.version} className="release-entry">
                  <header>
                    <div>
                      <span>v{release.version}</span>
                      {release.version === APP_VERSION && <b>最新</b>}
                    </div>
                    <time dateTime={release.date}>{release.date}</time>
                  </header>
                  <h4>{release.title}</h4>
                  <p>{release.summary}</p>
                  <ul>
                    {release.highlights.map((highlight) => {
                      const HighlightIcon = RELEASE_ICONS[highlight.icon];
                      return (
                        <li key={highlight.title}>
                          <span><HighlightIcon aria-hidden="true" /></span>
                          <div><strong>{highlight.title}</strong><p>{highlight.description}</p></div>
                        </li>
                      );
                    })}
                  </ul>
                </article>
              ))}
            </div>
            <div className="whats-new-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setSection('guide');
                  onSectionChange('guide');
                  setGuideStep(0);
                }}
              >
                <ListChecks aria-hidden="true" /> 播放新手指引
              </button>
              <button type="button" className="primary-button" onClick={onClose}>
                知道了 <CheckCircle2 aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}