import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronLeft,
  Clapperboard,
  Cpu,
  Download,
  HardDrive,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Volume2,
  Wand2,
  Zap
} from 'lucide-react'
import clsx from 'clsx'
import type { Resolution, VramTier } from '@shared/types'
import { RESOLUTIONS, TIER_INFO } from '@shared/types'
import { useAppStore, readableError } from '../store'
import { Logo } from './TitleBar'

const TIERS: VramTier[] = ['8G', '16G', '24G', '32G', '64G']

export function Onboarding(): React.JSX.Element {
  const settings = useAppStore((state) => state.settings)
  const hardware = useAppStore((state) => state.hardware)
  const models = useAppStore((state) => state.models)
  const refreshHardware = useAppStore((state) => state.refreshHardware)
  const refreshModels = useAppStore((state) => state.refreshModels)
  const saveSettings = useAppStore((state) => state.saveSettings)
  const closeOnboarding = useAppStore((state) => state.closeOnboarding)
  const pushToast = useAppStore((state) => state.pushToast)

  const [step, setStep] = useState(1)
  const [tier, setTier] = useState<VramTier>(settings?.tier ?? '16G')
  const [resolution, setResolution] = useState<Resolution>(settings?.defaultResolution ?? '960x544')
  const [duration, setDuration] = useState(settings?.defaultDuration ?? 4)
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (step !== 2) return
    void refreshHardware()
  }, [step, refreshHardware])

  useEffect(() => {
    if (step !== 3) return
    setScanning(true)
    void refreshModels().finally(() => setScanning(false))
  }, [step, refreshModels])

  const tierInfo = TIER_INFO[tier]
  const required = models?.models.filter((item) => item.required) ?? []
  const missingRequired = required.filter((item) => !item.present)
  const effectModels = models?.models.filter((item) => item.role === 'effect_lora') ?? []

  const applyTier = (next: VramTier): void => {
    setTier(next)
    const info = TIER_INFO[next]
    setResolution(info.defaultResolution)
    setDuration(next === '8G' ? 3 : next === '16G' ? 4 : 6)
  }

  const finish = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await saveSettings({
        tier,
        defaultResolution: resolution,
        defaultDuration: duration,
        onboardingDone: true
      })
      closeOnboarding()
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }

  const skip = async (): Promise<void> => {
    try {
      await saveSettings({ onboardingDone: true })
      closeOnboarding()
    } catch (err) {
      pushToast({ kind: 'error', title: '保存失败', message: readableError(err) })
    }
  }

  return (
    <div className="onboarding">
      <div className="onboarding-visual">
        <div className="onboarding-noise" />
        <div className="visual-head">
          <span className="rec-dot" />
          <span>LTX LOCAL / TAKE 01</span>
          <span className="visual-time">00:04:00</span>
        </div>

        <div className="visual-stage">
          <div className="stage-frame frame-a">
            <span>本地渲染</span>
            <b>LTX-2</b>
          </div>
          <div className="stage-frame frame-b" />
          <div className="visual-orb" />
          <div className="visual-horizon" />
          <div className="visual-caption">
            <span className="caption-line">提示词、素材与成片，全程留在这台电脑。</span>
            <span className="caption-sub">Your GPU. Your files. No cloud.</span>
          </div>
          <div className="visual-sound">
            <Volume2 size={14} />
            <span className="sound-wave">
              {Array.from({ length: 18 }).map((_, index) => (
                <i key={index} style={{ height: `${6 + ((index * 7) % 18)}px` }} />
              ))}
            </span>
            <span>原生同步音频</span>
          </div>
        </div>

        <div className="visual-copy">
          <p className="eyebrow">
            <Sparkles size={13} />
            LTX-2 · LOCAL VIDEO DIRECTOR
          </p>
          <h1>
            一句话，
            <br />
            在本机变成一段<span>带声音的视频</span>。
          </h1>
          <p className="visual-desc">
            没有账号，没有云 API，没有遥测。模型跑在你的显卡上，文件只写进 exe 旁边的 data 文件夹。
          </p>
          <div className="visual-metrics">
            <div>
              <strong>100%</strong>
              <span>本地推理</span>
            </div>
            <div>
              <strong>Audio</strong>
              <span>原生声音</span>
            </div>
            <div>
              <strong>0</strong>
              <span>云端请求</span>
            </div>
          </div>
        </div>
      </div>

      <div className="onboarding-panel">
        <div className="onboarding-top">
          <Logo size={34} withText />
          <div className="step-dots">
            {[1, 2, 3].map((item) => (
              <span key={item} className={clsx(item <= step && 'active')} />
            ))}
          </div>
        </div>

        {step === 1 && (
          <div className="onboarding-content welcome-content">
            <span className="step-kicker">第一次见面</span>
            <h2>你的私人 AI 片场，已就位</h2>
            <p className="step-lead">
              这是一个解压即用的 Windows 客户端。视频由你本机的 LTX-2 模型生成，不需要联网，也不需要任何账号。
            </p>

            <div className="welcome-grid">
              <div className="welcome-card">
                <span className="feature-icon warm">
                  <Cpu size={18} />
                </span>
                <strong>显卡直接出片</strong>
                <p>内置无头 ComfyUI 引擎，按显存档位自动匹配分辨率与时长。</p>
              </div>
              <div className="welcome-card">
                <span className="feature-icon cool">
                  <HardDrive size={18} />
                </span>
                <strong>便携数据目录</strong>
                <p>素材、成片和设置在 exe 旁边的 data 文件夹，拷走就能带走。</p>
              </div>
              <div className="welcome-card">
                <span className="feature-icon green">
                  <ShieldCheck size={18} />
                </span>
                <strong>数据不出机</strong>
                <p>生成阶段强制离线。唯一的联网行为是你主动发起的模型下载。</p>
              </div>
              <div className="welcome-card">
                <span className="feature-icon violet">
                  <Wand2 size={18} />
                </span>
                <strong>提示词不靠云</strong>
                <p>结构编排与本地润色都在本机完成，未来可接入离线 LLM 助手。</p>
              </div>
            </div>

            <div className="welcome-flow">
              <div><span>01</span>检测显卡与显存</div>
              <ArrowRight size={14} />
              <div><span>02</span>确认模型是否齐全</div>
              <ArrowRight size={14} />
              <div><span>03</span>开始本地创作</div>
            </div>

            <button type="button" className="btn-primary btn-large" onClick={() => setStep(2)}>
              开始检测
              <ArrowRight size={17} />
            </button>
            <button type="button" className="text-button" onClick={() => void skip()}>
              先随便看看，稍后配置
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-content key-content">
            <span className="step-kicker">硬件检测</span>
            <h2>{hardware?.gpuName || '正在读取显卡信息…'}</h2>
            <p className="step-lead">
              档位决定默认分辨率、时长和量化版本。检测结果只在本机使用，不会上传。
            </p>

            <div className="hardware-grid">
              <div>
                <span>显存</span>
                <strong>{hardware ? `${Math.round(hardware.vramMb / 1024 * 10) / 10} GB` : '—'}</strong>
              </div>
              <div>
                <span>计算能力</span>
                <strong>{hardware?.computeCap || '—'}</strong>
              </div>
              <div>
                <span>驱动</span>
                <strong>{hardware?.driver || '—'}</strong>
              </div>
              <div>
                <span>系统内存</span>
                <strong>{hardware ? `${Math.round(hardware.ramMb / 1024)} GB` : '—'}</strong>
              </div>
            </div>

            {hardware?.needsWin11Hint && (
              <div className="fallback-note">
                <AlertTriangle size={13} />
                检测到 RTX 50 系显卡运行在 Windows 10。NVFP4 与新版驱动在 Win10 上可能不稳定，建议升级到 Windows 11。
              </div>
            )}

            <div className="tier-list">
              {TIERS.map((id) => {
                const info = TIER_INFO[id]
                const recommended = hardware?.tier === id
                return (
                  <button
                    key={id}
                    type="button"
                    className={clsx('tier-card', tier === id && 'active', recommended && 'recommended')}
                    onClick={() => applyTier(id)}
                  >
                    <span className="tier-radio">{tier === id && <i />}</span>
                    <span className="tier-body">
                      <span className="tier-head">
                        <strong>{info.label}</strong>
                        {recommended && <em>本机推荐</em>}
                      </span>
                      <small>{info.quantization} · 下载约 {info.modelDownloadGb} GB</small>
                      <span className="tier-note">{info.note}</span>
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="field-row">
              <label className="field-block">
                <span>默认分辨率</span>
                <select value={resolution} onChange={(event) => setResolution(event.target.value as Resolution)}>
                  {Object.keys(RESOLUTIONS).map((id) => (
                    <option key={id} value={id}>
                      {RESOLUTIONS[id as Resolution].label} · {id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-block">
                <span>默认时长</span>
                <select value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
                  {[2, 3, 4, 5, 6, 8].map((value) => (
                    <option key={value} value={value}>{value} 秒</option>
                  ))}
                </select>
              </label>
            </div>

            {error && <p className="form-error">{error}</p>}

            <div className="key-actions">
              <button type="button" className="btn-secondary" onClick={() => setStep(1)}>
                <ChevronLeft size={15} />
                返回
              </button>
              <button type="button" className="btn-primary" onClick={() => setStep(3)}>
                检查模型
                <ArrowRight size={16} />
              </button>
            </div>

            <p className="onboarding-footer-note">
              <Zap size={12} />
              当前档位：{tierInfo.label} · 上限 {tierInfo.maxResolution}
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="onboarding-content key-content">
            <span className="step-kicker">模型检查</span>
            <h2>{missingRequired.length ? '还缺几个必需模型' : '模型齐全，可以开机'}</h2>
            <p className="step-lead">
              模型目录：<code>{models?.modelRoot || settings?.modelRoot || '—'}</code>
            </p>

            {scanning ? (
              <div className="scan-state">
                <Loader2 size={18} className="spin" />
                正在扫描 models 目录…
              </div>
            ) : (
              <div className="model-list">
                {required.map((item) => (
                  <div key={item.id} className={clsx('model-row', item.present ? 'present' : 'missing')}>
                    <span className="model-row-icon">
                      {item.present ? <Check size={14} /> : <Download size={14} />}
                    </span>
                    <div>
                      <strong>{item.name}</strong>
                      <small>{item.filename} · {item.sizeGb} GB</small>
                    </div>
                    <em>{item.present ? `${item.actualSizeGb ?? '?'} GB` : '缺失'}</em>
                  </div>
                ))}
              </div>
            )}

            {effectModels.length > 0 && (
              <div className="model-optional">
                <span>可选特效权重</span>
                {effectModels.map((item) => (
                  <div key={item.id} className={clsx('model-row', item.present ? 'present' : 'optional')}>
                    <span className="model-row-icon">
                      {item.present ? <Check size={14} /> : <Lock size={14} />}
                    </span>
                    <div>
                      <strong>{item.name}</strong>
                      <small>{item.description}</small>
                    </div>
                    <em>{item.present ? '已安装' : '未安装'}</em>
                  </div>
                ))}
              </div>
            )}

            <div className="inline-actions">
              <button
                type="button"
                className="btn-secondary small"
                onClick={() => {
                  setScanning(true)
                  void refreshModels().finally(() => setScanning(false))
                }}
                disabled={scanning}
              >
                <RefreshCw size={13} />
                重新扫描
              </button>
              <button
                type="button"
                className="btn-secondary small"
                onClick={() => void window.ltx.openPath(models?.modelRoot || settings?.modelRoot || '')}
              >
                <HardDrive size={13} />
                打开模型目录
              </button>
            </div>

            <div className={clsx('test-result', missingRequired.length ? 'bad' : 'ok')}>
              {missingRequired.length ? (
                <>
                  <AlertTriangle size={13} />
                  缺少 {missingRequired.length} 个必需模型。补齐后才能生成，也可以先进入界面。
                </>
              ) : (
                <>
                  <Check size={13} />
                  全部必需模型已就位，可以开始生成。
                </>
              )}
            </div>

            <div className="key-actions">
              <button type="button" className="btn-secondary" onClick={() => setStep(2)}>
                <ChevronLeft size={15} />
                返回
              </button>
              <button type="button" className="btn-primary" onClick={() => void finish()} disabled={busy}>
                {busy ? <Loader2 size={16} className="spin" /> : null}
                进入创作台
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        <p className="onboarding-footer">
          <ShieldCheck size={12} />
          本地运行 · 无账号体系 · 无云端同步 · 无数据分析
        </p>
      </div>
    </div>
  )
}
