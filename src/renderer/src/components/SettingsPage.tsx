import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Cpu,
  Database,
  ExternalLink,
  FolderOpen,
  Gauge,
  HardDrive,
  Info,
  Loader2,
  Play,
  Power,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Square,
  Zap
} from 'lucide-react'
import clsx from 'clsx'
import type { ModelRole, Resolution, VramTier } from '@shared/types'
import { RESOLUTIONS, TIER_INFO } from '@shared/types'
import { useAppStore, readableError } from '../store'

const TIERS: VramTier[] = ['8G', '16G', '24G', '32G', '64G']

const ROLE_LABEL: Record<ModelRole, string> = {
  transformer: '主模型',
  text_encoder: '文本编码',
  text_projection: '文本投影',
  video_vae: '视频 VAE',
  audio_vae: '音频 VAE',
  upscaler: '空间放大',
  lora: 'LoRA',
  effect_lora: '特效 LoRA',
  assistant_llm: '助手 LLM'
}

export function SettingsPage(): React.JSX.Element {
  const settings = useAppStore((state) => state.settings)
  const dirs = useAppStore((state) => state.dirs)
  const version = useAppStore((state) => state.version)
  const hardware = useAppStore((state) => state.hardware)
  const engine = useAppStore((state) => state.engine)
  const models = useAppStore((state) => state.models)
  const saveSettings = useAppStore((state) => state.saveSettings)
  const refreshHardware = useAppStore((state) => state.refreshHardware)
  const refreshModels = useAppStore((state) => state.refreshModels)
  const startEngine = useAppStore((state) => state.startEngine)
  const stopEngine = useAppStore((state) => state.stopEngine)
  const pushToast = useAppStore((state) => state.pushToast)
  const setView = useAppStore((state) => state.setView)

  const [engineRoot, setEngineRoot] = useState(settings?.engineRoot ?? '')
  const [modelRoot, setModelRoot] = useState(settings?.modelRoot ?? '')
  const [pythonPath, setPythonPath] = useState(settings?.pythonPath ?? '')
  const [enginePort, setEnginePort] = useState(settings?.enginePort ?? 8188)
  const [autoStartEngine, setAutoStartEngine] = useState(settings?.autoStartEngine ?? true)
  const [tier, setTier] = useState<VramTier>(settings?.tier ?? '16G')
  const [defaultResolution, setDefaultResolution] = useState<Resolution>(settings?.defaultResolution ?? '960x544')
  const [defaultDuration, setDefaultDuration] = useState(settings?.defaultDuration ?? 4)
  const [defaultFps, setDefaultFps] = useState(settings?.defaultFps ?? 24)
  const [defaultSteps, setDefaultSteps] = useState(settings?.defaultSteps ?? 9)
  const [defaultSeed, setDefaultSeed] = useState(settings?.defaultSeed ?? -1)
  const [audioDefault, setAudioDefault] = useState(settings?.audioDefault ?? true)
  const [reduceMotion, setReduceMotion] = useState(settings?.reduceMotion ?? false)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    if (!settings) return
    setEngineRoot(settings.engineRoot)
    setModelRoot(settings.modelRoot)
    setPythonPath(settings.pythonPath)
    setEnginePort(settings.enginePort)
    setAutoStartEngine(settings.autoStartEngine)
    setTier(settings.tier)
    setDefaultResolution(settings.defaultResolution)
    setDefaultDuration(settings.defaultDuration)
    setDefaultFps(settings.defaultFps)
    setDefaultSteps(settings.defaultSteps)
    setDefaultSeed(settings.defaultSeed)
    setAudioDefault(settings.audioDefault)
    setReduceMotion(settings.reduceMotion)
  }, [settings])

  const save = async (): Promise<void> => {
    setBusy('save')
    try {
      await saveSettings({
        engineRoot: engineRoot.trim(),
        modelRoot: modelRoot.trim(),
        pythonPath: pythonPath.trim(),
        enginePort,
        autoStartEngine,
        tier,
        defaultResolution,
        defaultDuration,
        defaultFps,
        defaultSteps: 9,
        defaultSeed,
        audioDefault,
        reduceMotion
      })
      pushToast({ kind: 'success', title: '设置已保存' })
      void refreshModels()
    } catch (error) {
      pushToast({ kind: 'error', title: '保存失败', message: readableError(error) })
    } finally {
      setBusy('')
    }
  }

  const pickModelRoot = async (): Promise<void> => {
    try {
      const picked = await window.ltx.pickModelRoot()
      if (picked) setModelRoot(picked)
    } catch (error) {
      pushToast({ kind: 'error', title: '选择目录失败', message: readableError(error) })
    }
  }

  const rescan = async (): Promise<void> => {
    setBusy('scan')
    try {
      const result = await refreshModels()
      pushToast({
        kind: result?.missingRequired.length ? 'info' : 'success',
        title: result?.missingRequired.length ? '扫描完成，仍有缺失' : '模型扫描完成',
        message: result?.missingRequired.length
          ? `缺少：${result.missingRequired.join('、')}`
          : `共 ${result?.models.filter((item) => item.present).length ?? 0} 个模型已就位`
      })
    } finally {
      setBusy('')
    }
  }

  const toggleEngine = async (): Promise<void> => {
    setBusy('engine')
    try {
      if (engine.state === 'ready') {
        await stopEngine()
        pushToast({ kind: 'info', title: '引擎已停止' })
      } else {
        const status = await startEngine()
        pushToast({
          kind: status.state === 'ready' ? 'success' : 'error',
          title: status.state === 'ready' ? '引擎已就绪' : '引擎启动失败',
          message: status.state === 'ready' ? undefined : status.message
        })
      }
    } finally {
      setBusy('')
    }
  }

  if (!settings) return <div className="settings-page" />

  const tierInfo = TIER_INFO[tier]
  const presentCount = models?.models.filter((item) => item.present).length ?? 0
  const missingRequired = models?.models.filter((item) => item.required && !item.present) ?? []
  const engineReady = engine.state === 'ready'
  const engineLabel =
    engine.state === 'ready'
      ? '引擎就绪'
      : engine.state === 'starting'
        ? '启动中'
        : engine.state === 'error'
          ? '引擎异常'
          : '引擎未启动'

  return (
    <div className="settings-page">
      <div className="settings-header">
        <div>
          <span className="page-eyebrow"><ShieldCheck size={12} /> PREFERENCES</span>
          <h1>设置</h1>
          <p>本地引擎、模型清单、生成默认值与数据目录</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => void save()} disabled={busy === 'save'}>
          {busy === 'save' ? <Loader2 size={15} className="spin" /> : <Check size={15} />}
          保存设置
        </button>
      </div>

      <div className="settings-layout">
        <div className="settings-main">
          <section className="settings-card">
            <div className="settings-card-head">
              <span className="settings-icon warm"><Cpu size={18} /></span>
              <div>
                <h2>本地引擎</h2>
                <p>内置无头 ComfyUI。生成阶段只与本机 127.0.0.1 通信，不访问外网。</p>
              </div>
              <span className={clsx('connection-pill', engineReady ? 'ok' : engine.state === 'error' ? 'bad' : 'warn')}>
                <i />
                {engineLabel}
              </span>
            </div>

            <div className="settings-form">
              <label className="field-block">
                <span>ComfyUI 程序目录 <small>包含 main.py</small></span>
                <div className="key-input">
                  <HardDrive size={15} />
                  <input value={engineRoot} onChange={(event) => setEngineRoot(event.target.value)} spellCheck={false} />
                </div>
              </label>

              <label className="field-block">
                <span>模型根目录 <small>包含 models / input / output</small></span>
                <div className="key-input">
                  <Database size={15} />
                  <input value={modelRoot} onChange={(event) => setModelRoot(event.target.value)} spellCheck={false} />
                  <button type="button" className="icon-button" onClick={() => void pickModelRoot()} title="选择目录">
                    <FolderOpen size={15} />
                  </button>
                </div>
              </label>

              <label className="field-block">
                <span>Python 解释器 <small>ComfyUI 的 .venv</small></span>
                <div className="key-input">
                  <Gauge size={15} />
                  <input value={pythonPath} onChange={(event) => setPythonPath(event.target.value)} spellCheck={false} />
                </div>
              </label>

              <div className="field-row">
                <label className="field-block">
                  <span>引擎端口</span>
                  <input
                    type="number"
                    min={1024}
                    max={65535}
                    value={enginePort}
                    onChange={(event) => setEnginePort(Number(event.target.value))}
                  />
                </label>
                <label className="field-block">
                  <span>启动行为</span>
                  <select
                    value={autoStartEngine ? 'auto' : 'manual'}
                    onChange={(event) => setAutoStartEngine(event.target.value === 'auto')}
                  >
                    <option value="auto">随程序自动启动</option>
                    <option value="manual">手动启动</option>
                  </select>
                </label>
              </div>

              <div className="inline-actions">
                <button type="button" className="btn-secondary small" onClick={() => void toggleEngine()} disabled={busy === 'engine'}>
                  {busy === 'engine' ? (
                    <Loader2 size={13} className="spin" />
                  ) : engineReady ? (
                    <Square size={13} />
                  ) : (
                    <Power size={13} />
                  )}
                  {engineReady ? '停止引擎' : '启动引擎'}
                </button>
                <button
                  type="button"
                  className="btn-secondary small"
                  onClick={() => void window.ltx.openPath(engineRoot)}
                >
                  <FolderOpen size={13} />
                  打开程序目录
                </button>
                {engine.message && <span className="inline-result">{engine.message}</span>}
              </div>
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-head">
              <span className="settings-icon blue"><Database size={18} /></span>
              <div>
                <h2>模型清单</h2>
                <p>只读扫描模型目录，不联网、不上传文件名。缺失的必需模型会导致生成失败。</p>
              </div>
              <span className={clsx('connection-pill', missingRequired.length ? 'warn' : 'ok')}>
                <i />
                {presentCount} / {models?.models.length ?? 0}
              </span>
            </div>

            <div className="model-scan-bar">
              <code title={models?.modelRoot}>{models?.modelRoot || modelRoot || '—'}</code>
              <div className="inline-actions">
                <button type="button" className="btn-secondary small" onClick={() => void rescan()} disabled={busy === 'scan'}>
                  {busy === 'scan' ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
                  重新扫描
                </button>
                <button type="button" className="btn-secondary small" onClick={() => void window.ltx.openPath(modelRoot)}>
                  <FolderOpen size={13} />
                  打开模型目录
                </button>
              </div>
            </div>

            <div className="model-list">
              {(models?.models ?? []).map((item) => (
                <div key={item.id} className={clsx('model-row', item.present ? 'present' : item.required ? 'missing' : 'optional')}>
                  <span className="model-row-icon">
                    {item.present ? <Check size={14} /> : item.required ? <AlertTriangle size={14} /> : <Info size={14} />}
                  </span>
                  <div className="model-row-body">
                    <div className="model-row-title">
                      <strong>{item.name}</strong>
                      <em>{ROLE_LABEL[item.role]}</em>
                      {item.required && <span className="required-tag">必需</span>}
                    </div>
                    <small>{item.filename}</small>
                    <p>{item.description}</p>
                  </div>
                  <div className="model-row-size">
                    <strong>{item.present ? `${item.actualSizeGb ?? item.sizeGb} GB` : `需 ${item.sizeGb} GB`}</strong>
                    <span>{item.present ? '已就位' : item.required ? '缺失' : '可选'}</span>
                  </div>
                </div>
              ))}
              {!models && <div className="model-empty">还没有扫描结果，点击「重新扫描」。</div>}
            </div>

            {missingRequired.length > 0 && (
              <div className="fallback-note">
                <AlertTriangle size={13} />
                缺少必需模型：{missingRequired.map((item) => item.name).join('、')}。补齐后才能开始生成。
              </div>
            )}
          </section>

          <section className="settings-card">
            <div className="settings-card-head">
              <span className="settings-icon violet"><Sparkles size={18} /></span>
              <div>
                <h2>生成默认值</h2>
                <p>新建作品时的初始参数，可在创作台随时修改。</p>
              </div>
            </div>

            <div className="settings-form two-col">
              <label className="field-block">
                <span>显存档位</span>
                <select value={tier} onChange={(event) => setTier(event.target.value as VramTier)}>
                  {TIERS.map((id) => (
                    <option key={id} value={id}>
                      {TIER_INFO[id].label} · {TIER_INFO[id].vram}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-block">
                <span>默认分辨率</span>
                <select value={defaultResolution} onChange={(event) => setDefaultResolution(event.target.value as Resolution)}>
                  {(Object.keys(RESOLUTIONS) as Resolution[]).map((id) => (
                    <option key={id} value={id}>
                      {RESOLUTIONS[id].label} · {id}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-block">
                <span>默认时长（秒）</span>
                <input
                  type="number"
                  min={2}
                  max={10}
                  value={defaultDuration}
                  onChange={(event) => setDefaultDuration(Number(event.target.value))}
                />
              </label>

              <label className="field-block">
                <span>默认帧率</span>
                <select value={defaultFps} onChange={(event) => setDefaultFps(Number(event.target.value))}>
                  {[24, 25, 30].map((fps) => (
                    <option key={fps} value={fps}>{fps} fps</option>
                  ))}
                </select>
              </label>

              <label className="field-block">
                <span>默认采样步数 <small>蒸馏基座固定 9</small></span>
                <input type="number" value={9} readOnly disabled />
              </label>

              <label className="field-block">
                <span>默认种子 <small>-1 表示每次随机</small></span>
                <input
                  type="number"
                  value={defaultSeed}
                  onChange={(event) => setDefaultSeed(Number(event.target.value))}
                />
              </label>
            </div>

            <div className="toggle-list">
              <button type="button" className={clsx('switch-row', audioDefault && 'on')} onClick={() => setAudioDefault(!audioDefault)}>
                <span>
                  <Play size={15} />
                  <span>
                    <strong>默认开启同步音频</strong>
                    <small>LTX-2 在生成画面时同时产出声音</small>
                  </span>
                </span>
                <i className="switch" />
              </button>
              <button type="button" className={clsx('switch-row', reduceMotion && 'on')} onClick={() => setReduceMotion(!reduceMotion)}>
                <span>
                  <Sparkles size={15} />
                  <span>
                    <strong>减少界面动态</strong>
                    <small>关闭部分光晕与过渡动画</small>
                  </span>
                </span>
                <i className="switch" />
              </button>
            </div>

            <p className="data-note">
              <Info size={11} />
              当前档位 {tierInfo.label}：{tierInfo.note}。分辨率上限 {tierInfo.maxResolution}。
            </p>
          </section>
        </div>

        <aside className="settings-side">
          <section className="settings-card">
            <div className="settings-card-head compact">
              <span className="settings-icon green"><Gauge size={17} /></span>
              <div><h2>本机硬件</h2></div>
              <button type="button" className="icon-button" onClick={() => void refreshHardware()} title="重新检测">
                <RefreshCw size={13} />
              </button>
            </div>
            <div className="path-list">
              <div><span>显卡</span><strong title={hardware?.gpuName}>{hardware?.gpuName || '未检测到 NVIDIA GPU'}</strong></div>
              <div><span>显存</span><strong>{hardware ? `${Math.round((hardware.vramMb / 1024) * 10) / 10} GB` : '—'}</strong></div>
              <div><span>计算能力</span><strong>{hardware?.computeCap || '—'}</strong></div>
              <div><span>驱动</span><strong>{hardware?.driver || '—'}</strong></div>
              <div><span>系统内存</span><strong>{hardware ? `${Math.round(hardware.ramMb / 1024)} GB` : '—'}</strong></div>
              <div><span>磁盘可用</span><strong>{hardware ? `${hardware.diskFreeGb} GB` : '—'}</strong></div>
              <div><span>推荐档位</span><strong>{hardware ? TIER_INFO[hardware.tier].label : '—'}</strong></div>
            </div>
            {hardware?.needsWin11Hint && (
              <div className="fallback-note">
                <AlertTriangle size={13} />
                检测到 RTX 50 系显卡运行在 Windows 10。NVFP4 与新版驱动在 Win10 上可能不稳定，建议升级到 Windows 11。
              </div>
            )}
            <div className="about-facts">
              <span>{hardware?.supportsNvfp4 ? '支持 NVFP4' : '不支持 NVFP4'}</span>
              <span>{hardware?.supportsFp8 ? '支持 FP8' : '不支持 FP8'}</span>
            </div>
          </section>

          <section className="settings-card data-card">
            <div className="settings-card-head compact">
              <span className="settings-icon green"><Database size={17} /></span>
              <div><h2>本地数据</h2></div>
            </div>
            <div className="path-list">
              <div><span>数据目录</span><strong title={dirs?.dataDir}>{dirs?.dataDir}</strong></div>
              <div><span>成片目录</span><strong>data / videos</strong></div>
              <div><span>素材目录</span><strong>data / assets</strong></div>
              <div><span>日志目录</span><strong>data / logs</strong></div>
            </div>
            {dirs?.usingFallback && (
              <div className="fallback-note">
                <AlertTriangle size={13} />
                程序目录不可写，已自动切换到用户数据目录。把整个文件夹放到有写入权限的位置可恢复便携模式。
              </div>
            )}
            <div className="data-actions">
              <button type="button" className="btn-secondary small" onClick={() => void window.ltx.openPath('data')}>
                <FolderOpen size={13} /> 打开数据目录
              </button>
              <button type="button" className="btn-secondary small" onClick={() => void window.ltx.openPath('output')}>
                <FolderOpen size={13} /> 打开成片目录
              </button>
              <button type="button" className="btn-secondary small" onClick={() => void window.ltx.openPath('logs')}>
                <FolderOpen size={13} /> 打开日志目录
              </button>
            </div>
            <p className="data-note">
              <Info size={11} /> 替换 exe 时保留 data 文件夹，作品、素材与设置不会丢失。
            </p>
          </section>

          <section className="settings-card about-card">
            <div className="about-brand">
              <div className="logo-mark small"><span>LTX</span></div>
              <div>
                <strong>LTX 本地导演台</strong>
                <span>版本 {version || '1.0.0'}</span>
              </div>
            </div>
            <p>解压即用的本地 AI 视频客户端。画面与声音全部由本机 LTX-2 生成，不接入云 API、不需要账号、不上传任何数据。</p>
            <div className="about-facts">
              <span>Windows 10 / 11 x64</span>
              <span>便携版 · 无需安装</span>
              <span>无遥测</span>
            </div>
            <button
              type="button"
              className="btn-secondary small"
              onClick={() => setView('academy')}
            >
              <Zap size={12} />
              提示词学院
            </button>
          </section>

          <section className="settings-card update-card">
            <div className="settings-card-head compact">
              <span className="settings-icon amber"><RefreshCw size={17} /></span>
              <div><h2>手动更新</h2></div>
            </div>
            <p>
              下载新版 ZIP，解压后替换旧 exe 即可。请保留原来的 <code>data</code> 文件夹，历史作品、素材和设置会自动沿用。
            </p>
            <p className="data-note">
              <CheckCircle2 size={11} /> 模型与引擎不随程序包更新，可独立升级。
            </p>
          </section>

          <button type="button" className="donate-card" onClick={() => setView('reward')}>
            <span className="donate-icon">♥</span>
            <div><strong>喜欢这个导演台？</strong><span>请作者喝一杯咖啡</span></div>
            <ExternalLink size={13} />
          </button>
        </aside>
      </div>
    </div>
  )
}
