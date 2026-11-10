import { useState } from 'react'
import {
  ChevronDown,
  Clipboard,
  FileText,
  Loader2,
  RotateCcw,
  Sparkles,
  Wand2,
  AudioLines,
  Check,
  AlertCircle,
  Lightbulb
} from 'lucide-react'
import clsx from 'clsx'
import type { GenerationMode } from '@shared/types'
import {
  CAMERA_OPTIONS,
  INSPIRATION_TEMPLATES,
  LIGHT_OPTIONS,
  STYLE_OPTIONS,
  type PromptDraft,
  type PromptReview
} from '../lib/prompt'

interface PromptComposerProps {
  mode: GenerationMode
  promptMode: 'inspiration' | 'director'
  setPromptMode: (mode: 'inspiration' | 'director') => void
  idea: string
  setIdea: (value: string) => void
  draft: PromptDraft
  updateDraft: (patch: Partial<PromptDraft>) => void
  negative: string
  setNegative: (value: string) => void
  soundDesign: boolean
  setSoundDesign: (value: boolean) => void
  prompt: string
  setPromptOverride: (value: string) => void
  isManual: boolean
  resetToAuto: () => void
  review: PromptReview
  onDirector: () => void
  directorBusy: boolean
  onEnhance: () => void
  enhanceBusy: boolean
  tips: string[]
  applyTemplate: (idea: string) => void
  onCopy: () => void
}

const MODE_TIPS: Record<GenerationMode, string> = {
  text: '描述越具体，画面越可控。先写“谁在哪里做什么”。',
  image: '图片决定起点。文字重点描述“接下来怎么动”。',
  firstlast: '文字负责连接两帧，写明中间发生的动作与转场。',
  effect: '特效会保留输入视频的运动与构图，只替换画面风格。'
}

export function PromptComposer(props: PromptComposerProps): React.JSX.Element {
  const [advancedOpen, setAdvancedOpen] = useState(false)

  return (
    <section className="panel prompt-panel">
      <div className="panel-heading">
        <div>
          <span className="panel-kicker">PROMPT</span>
          <h2>描述你的画面</h2>
        </div>
        <div className="prompt-tabs">
          <button
            type="button"
            className={clsx(props.promptMode === 'inspiration' && 'active')}
            onClick={() => props.setPromptMode('inspiration')}
          >
            <Sparkles size={13} />
            灵感
          </button>
          <button
            type="button"
            className={clsx(props.promptMode === 'director' && 'active')}
            onClick={() => props.setPromptMode('director')}
          >
            <FileText size={13} />
            导演
          </button>
        </div>
      </div>

      <div className="prompt-scroll">
        <p className="mode-tip">{MODE_TIPS[props.mode]}</p>

        {props.promptMode === 'inspiration' ? (
          <>
            <textarea
              className="idea-textarea"
              value={props.idea}
              onChange={(event) => props.setIdea(event.target.value)}
              placeholder="例如：清晨的老街面馆，师傅把面团摔在案板上，蒸汽升起，镜头从手部特写慢慢拉开……"
              maxLength={5000}
            />
            <div className="template-head">
              <span>没灵感？从这些镜头开始</span>
              <span>{props.idea.length}/5000</span>
            </div>
            <div className="template-grid">
              {INSPIRATION_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className="template-card"
                  onClick={() => props.applyTemplate(template.idea)}
                >
                  <span>{template.tag}</span>
                  <strong>{template.title}</strong>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="director-fields">
            <label className="field-block">
              <span>一句话创意 <small>可选</small></span>
              <input
                value={props.idea}
                onChange={(event) => props.setIdea(event.target.value)}
                placeholder="想拍什么？一句话就够"
              />
            </label>
            <label className="field-block">
              <span>画面主体 <b>必填</b></span>
              <input
                value={props.draft.subject}
                onChange={(event) => props.updateDraft({ subject: event.target.value })}
                placeholder="例如：穿米色风衣的女人，35 岁，神情疲惫"
              />
            </label>
            <label className="field-block">
              <span>动作与叙事 <b>必填</b></span>
              <textarea
                value={props.draft.action}
                onChange={(event) => props.updateDraft({ action: event.target.value })}
                placeholder="她从站台长椅上起身，拖着行李箱走向雨幕，在台阶前停下回头。"
              />
            </label>
            <label className="field-block">
              <span>场景环境</span>
              <input
                value={props.draft.scene}
                onChange={(event) => props.updateDraft({ scene: event.target.value })}
                placeholder="雨夜旧车站，玻璃顶棚，远处列车灯光"
              />
            </label>
            <div className="field-row">
              <label className="field-block">
                <span>视觉风格</span>
                <select value={props.draft.style} onChange={(event) => props.updateDraft({ style: event.target.value })}>
                  {STYLE_OPTIONS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="field-block">
                <span>镜头运动</span>
                <select value={props.draft.camera} onChange={(event) => props.updateDraft({ camera: event.target.value })}>
                  {CAMERA_OPTIONS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field-block">
              <span>光线与色彩</span>
              <select value={props.draft.light} onChange={(event) => props.updateDraft({ light: event.target.value })}>
                {LIGHT_OPTIONS.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="field-block">
              <span>
                声音设计
                <small>环境声 / 音效 / 音乐情绪</small>
              </span>
              <input
                value={props.draft.audio}
                onChange={(event) => props.updateDraft({ audio: event.target.value })}
                placeholder="雨声、列车低鸣、鞋跟踩水声，低沉大提琴"
                disabled={!props.soundDesign}
              />
            </label>
            <label className="field-block">
              <span>额外要求</span>
              <input
                value={props.draft.constraints}
                onChange={(event) => props.updateDraft({ constraints: event.target.value })}
                placeholder="例如：不要出现文字，最后一个镜头停在眼神"
              />
            </label>
          </div>
        )}

        <div className="prompt-actions">
          <button type="button" className="ai-button" onClick={props.onDirector} disabled={props.directorBusy}>
            {props.directorBusy ? <Loader2 size={15} className="spin" /> : <Wand2 size={15} />}
            按结构生成
            <span className="ai-spark">
              <Sparkles size={9} />
            </span>
          </button>
          <button type="button" className="ghost-button" onClick={props.onEnhance} disabled={props.enhanceBusy || !props.prompt}>
            {props.enhanceBusy ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
            本地润色
            <em>离线</em>
          </button>
        </div>

        {props.tips.length > 0 && (
          <div className="director-tips">
            <Lightbulb size={14} />
            <div>
              {props.tips.slice(0, 2).map((tip) => (
                <p key={tip}>{tip}</p>
              ))}
            </div>
          </div>
        )}

        <div className="prompt-preview-head">
          <div>
            <span>最终提示词</span>
            {props.isManual ? <em className="manual-badge">已手动修改</em> : <em className="auto-badge">自动编排</em>}
          </div>
          <div className="preview-tools">
            {props.isManual && (
              <button type="button" onClick={props.resetToAuto} title="恢复自动编排">
                <RotateCcw size={13} />
              </button>
            )}
            <button type="button" onClick={props.onCopy} title="复制提示词">
              <Clipboard size={13} />
            </button>
          </div>
        </div>
        <textarea
          className={clsx('final-prompt', props.isManual && 'edited')}
          value={props.prompt}
          onChange={(event) => props.setPromptOverride(event.target.value)}
          rows={5}
          maxLength={7000}
        />

        <div className={clsx('linter-card', props.review.score >= 85 ? 'good' : props.review.score >= 65 ? 'okay' : 'weak')}>
          <div className="score-ring" style={{ ['--score' as string]: `${props.review.score * 3.6}deg` }}>
            <div>
              <strong>{props.review.score}</strong>
              <span>{props.review.level}</span>
            </div>
          </div>
          <div className="linter-copy">
            {props.review.issues.slice(0, 2).map((issue) => (
              <p key={issue} className="issue">
                {props.review.score >= 85 ? <Check size={12} /> : <AlertCircle size={12} />}
                {issue}
              </p>
            ))}
            {props.review.suggestions[0] && <p className="suggestion">{props.review.suggestions[0]}</p>}
          </div>
        </div>

        <button type="button" className="advanced-toggle" onClick={() => setAdvancedOpen((value) => !value)}>
          <ChevronDown size={14} className={clsx(advancedOpen && 'rotated')} />
          负向约束与声音
          <span>{props.review.chars} / 7000 字</span>
        </button>
        {advancedOpen && (
          <div className="advanced-content">
            <button
              type="button"
              className={clsx('switch-row', props.soundDesign && 'on')}
              onClick={() => props.setSoundDesign(!props.soundDesign)}
            >
              <span>
                <AudioLines size={15} />
                <span>
                  <strong>声音设计</strong>
                  <small>提示词自动补充声音描述，LTX-2 原生输出音频</small>
                </span>
              </span>
              <i className="switch" />
            </button>
            <label className="field-block">
              <span>
                负向约束
                <small>会被编译进正向提示词</small>
              </span>
              <textarea
                value={props.negative}
                onChange={(event) => props.setNegative(event.target.value)}
                placeholder="不要出现：文字、字幕、logo、畸形手指、过度锐化、画面抖动"
                rows={2}
              />
            </label>
          </div>
        )}
      </div>
    </section>
  )
}
