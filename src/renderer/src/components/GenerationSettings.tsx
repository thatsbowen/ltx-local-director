import {
  AudioLines,
  ChevronRight,
  Clapperboard,
  Cpu,
  Dices,
  Info,
  Loader2,
  Sparkles,
  Timer,
  Wand2
} from 'lucide-react'
import clsx from 'clsx'
import type { EffectId, GenerationMode, Resolution, VramTier } from '@shared/types'
import { EFFECT_INFO, RESOLUTIONS, TIER_INFO, estimateSeconds, formatEstimated } from '@shared/types'

interface GenerationSettingsProps {
  mode: GenerationMode
  resolution: Resolution
  duration: number
  steps: number
  seed: number
  audio: boolean
  audioMode: 'ambient' | 'dialogue'
  effect: EffectId
  tier: VramTier
  maxResolution: Resolution
  generating: boolean
  engineReady: boolean
  setResolution: (resolution: Resolution) => void
  setDuration: (duration: number) => void
  setSteps: (steps: number) => void
  setSeed: (seed: number) => void
  setAudio: (value: boolean) => void
  setAudioMode: (value: 'ambient' | 'dialogue') => void
  setEffect: (value: EffectId) => void
  onGenerate: () => void
  onOpenSettings: () => void
}

const RESOLUTION_ORDER: Resolution[] = ['832x480', '960x544', '1216x704', '1280x720']
const RESOLUTION_NOTE: Record<Resolution, string> = {
  '832x480': '草稿',
  '960x544': '均衡',
  '1216x704': '高清',
  '1280x720': '最高'
}

function resolutionIndex(resolution: Resolution): number {
  return RESOLUTION_ORDER.indexOf(resolution)
}

export function GenerationSettings(props: GenerationSettingsProps): React.JSX.Element {
  const tier = TIER_INFO[props.tier]
  const maxIndex = resolutionIndex(props.maxResolution)
  const estimated = estimateSeconds(props.mode, props.resolution, props.duration, props.tier)
  const maxDuration = props.tier === '8G' ? 4 : 8

  return (
    <aside className="settings-column">
      <section className="panel settings-panel">
        <div className="panel-heading compact">
          <div>
            <span className="panel-kicker">SETTINGS</span>
            <h2>生成设置</h2>
          </div>
          <span className="model-spectag">{tier.label}</span>
        </div>

        <div className="setting-section">
          <div className="setting-label">
            <span>分辨率</span>
            <em>{RESOLUTION_NOTE[props.resolution]} · {RESOLUTIONS[props.resolution].width}×{RESOLUTIONS[props.resolution].height}</em>
          </div>
          <div className="segmented">
            {RESOLUTION_ORDER.map((resolution, index) => {
              const disabled = index > maxIndex
              return (
                <button
                  key={resolution}
                  type="button"
                  disabled={disabled}
                  title={disabled ? `当前显存档位上限为 ${props.maxResolution}` : undefined}
                  className={clsx(props.resolution === resolution && 'active', disabled && 'disabled')}
                  onClick={() => props.setResolution(resolution)}
                >
                  {RESOLUTIONS[resolution].label}
                  <small>{RESOLUTION_NOTE[resolution]}</small>
                </button>
              )
            })}
          </div>
        </div>

        <div className="setting-section">
          <div className="setting-label">
            <span>时长</span>
            <strong className="duration-value">{props.duration}<small>s</small></strong>
          </div>
          <input
            type="range"
            className="duration-slider"
            min={2}
            max={maxDuration}
            step={1}
            value={props.duration}
            onChange={(event) => props.setDuration(Number(event.target.value))}
            style={{ ['--progress' as string]: `${((props.duration - 2) / (maxDuration - 2)) * 100}%` }}
          />
          <div className="slider-labels">
            <span>2s</span>
            <span>越长越贵，分辨率比时长更贵</span>
            <span>{maxDuration}s</span>
          </div>
        </div>

        <div className="setting-section">
          <div className="setting-label">
            <span>采样步数</span>
            <em>蒸馏基座固定 9 步</em>
          </div>
          <div className="fixed-steps">
            <strong>9</strong>
            <span>steps · ManualSigmas</span>
            <small>低于 9 步会出现满屏网格伪影，高于 9 步不会更清晰</small>
          </div>
        </div>

        <div className="setting-section">
          <div className="setting-label">
            <span>随机种子</span>
            <em>{props.seed < 0 ? '每次随机' : '固定复现'}</em>
          </div>
          <div className="seed-row">
            <input
              type="number"
              value={props.seed}
              min={-1}
              max={2147483647}
              onChange={(event) => props.setSeed(Number(event.target.value))}
            />
            <button type="button" className="btn-secondary small" onClick={() => props.setSeed(-1)}>
              <Dices size={13} />
              随机
            </button>
          </div>
        </div>

        <div className="setting-section compact-section">
          <button type="button" className={clsx('switch-row', props.audio && 'on')} onClick={() => props.setAudio(!props.audio)}>
            <span>
              <AudioLines size={15} />
              <span>
                <strong>同步音频</strong>
                <small>LTX-2 在生成画面时同时产出声音</small>
              </span>
            </span>
            <i className="switch" />
          </button>
          {props.audio && (
            <div className="segmented audio-mode">
              <button
                type="button"
                className={clsx(props.audioMode === 'ambient' && 'active')}
                onClick={() => props.setAudioMode('ambient')}
              >
                环境声
                <small>氛围 / 音效</small>
              </button>
              <button
                type="button"
                className={clsx(props.audioMode === 'dialogue' && 'active')}
                onClick={() => props.setAudioMode('dialogue')}
              >
                含对白
                <small>人物说话</small>
              </button>
            </div>
          )}
        </div>

        {props.mode === 'effect' && (
          <div className="setting-section">
            <div className="setting-label">
              <span>特效</span>
              <em>IC-LoRA</em>
            </div>
            <div className="model-grid">
              {(Object.keys(EFFECT_INFO) as EffectId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  className={clsx('model-card', props.effect === id && 'active')}
                  onClick={() => props.setEffect(id)}
                >
                  <span className="model-card-top">
                    <strong>{EFFECT_INFO[id].title}</strong>
                  </span>
                  <small>{EFFECT_INFO[id].description.slice(0, 18)}…</small>
                  {props.effect === id && <span className="model-check">✓</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="cost-card">
          <div className="cost-top">
            <span>
              <Timer size={13} />
              预计耗时
            </span>
            <strong>{formatEstimated(estimated)}</strong>
          </div>
          <div className="cost-lines">
            <span>{tier.label} · {RESOLUTIONS[props.resolution].label} · {props.duration}s</span>
            <em>本地 GPU</em>
          </div>
          <div className="cost-lines">
            <span>显存占用</span>
            <em>{props.tier === '8G' ? '~8 GB' : props.tier === '16G' ? '~15.5 GB' : '按档位'}</em>
          </div>
          <p className="cost-note">
            <Info size={11} />
            预估基于 RTX 5060 Ti 16GB 实测外推，实际受显存与散热影响。
          </p>
        </div>

        <div className="generate-wrap">
          <button
            type="button"
            className={clsx('generate-button', !props.engineReady && 'needs-key')}
            onClick={props.engineReady ? props.onGenerate : props.onOpenSettings}
            disabled={props.generating}
          >
            {props.generating ? (
              <>
                <Loader2 size={18} className="spin" />
                本地渲染中…
              </>
            ) : (
              <>
                <Sparkles size={18} />
                {props.engineReady ? '开始生成' : '引擎未就绪，去设置'}
                <span>{formatEstimated(estimated)}</span>
              </>
            )}
          </button>
          <div className="generate-sub">
            <span><Cpu size={11} /> 全程本地</span>
            <span><Clapperboard size={11} /> 自动归档</span>
            <ChevronRight size={11} />
          </div>
        </div>
      </section>
    </aside>
  )
}
