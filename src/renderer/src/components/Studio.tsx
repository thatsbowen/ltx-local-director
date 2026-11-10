import { useEffect, useMemo, useState } from 'react'
import { GalleryHorizontalEnd, Image as ImageIcon, Sparkles, Type, Wand2 } from 'lucide-react'
import clsx from 'clsx'
import type {
  AssetRef,
  EffectId,
  GenerationMode,
  MediaKind,
  MediaRole,
  Resolution,
  TaskStageEvent,
  VideoTask
} from '@shared/types'
import { MODE_INFO, TIER_INFO, estimateSeconds, formatEstimated } from '@shared/types'
import { useAppStore, readableError } from '../store'
import {
  compileInspirationPrompt,
  compilePrompt,
  emptyDraft,
  reviewPrompt,
  type PromptDraft
} from '../lib/prompt'
import { validateMedia } from '../lib/media'
import { PromptComposer } from './PromptComposer'
import { MediaInput } from './MediaInput'
import { PreviewStage } from './PreviewStage'
import { GenerationSettings } from './GenerationSettings'

const MODES: Array<{ id: GenerationMode; label: string; sub: string; icon: typeof Type; soon?: boolean }> = [
  { id: 'text', label: '文生视频', sub: 'TEXT', icon: Type },
  { id: 'image', label: '图生视频', sub: 'IMAGE', icon: ImageIcon },
  { id: 'firstlast', label: '首尾帧', sub: 'FRAMES', icon: GalleryHorizontalEnd },
  { id: 'effect', label: '特效转换', sub: 'EFFECT', icon: Sparkles, soon: true }
]

export function Studio(): React.JSX.Element {
  const settings = useAppStore((state) => state.settings)
  const hardware = useAppStore((state) => state.hardware)
  const engine = useAppStore((state) => state.engine)
  const tasks = useAppStore((state) => state.tasks)
  const assets = useAppStore((state) => state.assets)
  const stage = useAppStore((state) => state.stage)
  const generating = useAppStore((state) => state.generating)
  const activeTaskId = useAppStore((state) => state.activeTaskId)
  const setActiveTask = useAppStore((state) => state.setActiveTask)
  const setView = useAppStore((state) => state.setView)
  const openOnboarding = useAppStore((state) => state.openOnboarding)
  const openTaskDetail = useAppStore((state) => state.openTaskDetail)
  const createTask = useAppStore((state) => state.createTask)
  const importPicked = useAppStore((state) => state.importPicked)
  const pushToast = useAppStore((state) => state.pushToast)
  const removeAsset = useAppStore((state) => state.removeAsset)
  const reuseTask = useAppStore((state) => state.reuseTask)
  const setReuseTask = useAppStore((state) => state.setReuseTask)

  const tier = settings?.tier ?? hardware?.tier ?? '16G'
  const tierInfo = TIER_INFO[tier]

  const [mode, setMode] = useState<GenerationMode>('text')
  const [resolution, setResolution] = useState<Resolution>(settings?.defaultResolution ?? tierInfo.defaultResolution)
  const [duration, setDuration] = useState(settings?.defaultDuration ?? 4)
  const [steps, setSteps] = useState(9)
  const [seed, setSeed] = useState(settings?.defaultSeed ?? -1)
  const [audio, setAudio] = useState(settings?.audioDefault ?? true)
  const [audioMode, setAudioMode] = useState<'ambient' | 'dialogue'>('ambient')
  const [effect, setEffect] = useState<EffectId>('canny')

  const [promptMode, setPromptMode] = useState<'inspiration' | 'director'>('inspiration')
  const [idea, setIdea] = useState('')
  const [draft, setDraft] = useState<PromptDraft>(emptyDraft)
  const [negative, setNegative] = useState('')
  const [promptOverride, setPromptOverride] = useState<string | null>(null)
  const [inputs, setInputs] = useState<AssetRef[]>([])
  const [enhanceBusy, setEnhanceBusy] = useState(false)
  const [pendingAutoGenerate, setPendingAutoGenerate] = useState(false)

  const activeTask = tasks.find((task) => task.id === activeTaskId) || tasks[0]
  const canGenerate = engine.state !== 'error'
  const estimated = estimateSeconds(mode, resolution, duration, tier)

  const compiledDraft = useMemo<PromptDraft>(() => ({ ...draft, negative }), [draft, negative])
  const compiled = useMemo(
    () =>
      promptMode === 'inspiration'
        ? compileInspirationPrompt(idea, duration, audio, negative)
        : compilePrompt(compiledDraft, mode, duration, audio),
    [promptMode, idea, duration, audio, negative, compiledDraft, mode]
  )
  const prompt = promptOverride ?? compiled
  const isManual = promptOverride !== null
  const review = useMemo(
    () =>
      reviewPrompt(prompt, {
        structured: promptMode === 'director' && !isManual,
        draft: compiledDraft,
        soundDesign: audio,
        negative,
        mode
      }),
    [prompt, promptMode, isManual, compiledDraft, audio, negative, mode]
  )

  useEffect(() => {
    if (!reuseTask) return
    hydrateFromTask(reuseTask)
    setReuseTask(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reuseTask, setReuseTask])

  useEffect(() => {
    if (!pendingAutoGenerate) return
    setPendingAutoGenerate(false)
    const timer = window.setTimeout(() => {
      void handleGenerate()
    }, 60)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAutoGenerate])

  function hydrateFromTask(task: VideoTask): void {
    setMode(task.mode)
    setResolution(task.resolution)
    setDuration(task.duration)
    setSteps(9)
    setSeed(task.seed)
    setAudio(task.audio)
    setAudioMode(task.audioMode)
    if (task.effect) setEffect(task.effect)
    setIdea(task.prompt)
    setPromptOverride(task.prompt)
    setNegative(task.negativePrompt || '')
    const mapped = task.inputs
      .map((input) => {
        const asset = assets.find((item) => item.id === input.assetId)
        return asset ? ({ asset, role: input.role } satisfies AssetRef) : null
      })
      .filter((input): input is AssetRef => Boolean(input))
    setInputs(mapped)
    setActiveTask(task.id)
    if (mapped.length < task.inputs.length) {
      pushToast({ kind: 'info', title: '部分素材已不在本地', message: '缺失的素材需要重新导入后才能再次生成。' })
    }
  }

  function changeMode(next: GenerationMode): void {
    if (next === 'effect') {
      pushToast({
        kind: 'info',
        title: '特效转换即将开放',
        message: 'IC-LoRA 权重与 22B 主模型的兼容性仍在验证，v1.0 暂不开放。'
      })
      return
    }
    setMode(next)
    setInputs([])
  }

  function updateDraft(patch: Partial<PromptDraft>): void {
    setDraft((state) => ({ ...state, ...patch }))
    setPromptOverride(null)
  }

  function changeIdea(value: string): void {
    setIdea(value)
    setPromptOverride(null)
  }

  function changeNegative(value: string): void {
    setNegative(value)
    setPromptOverride(null)
  }

  function changePromptMode(next: 'inspiration' | 'director'): void {
    setPromptMode(next)
    setPromptOverride(null)
  }

  async function addImportedAssets(importedAssets: typeof assets, preferredRole?: MediaRole): Promise<void> {
    if (!importedAssets.length) return

    if (mode !== 'effect') {
      const asset = importedAssets.find((item) => item.kind === 'image')
      if (!asset) {
        for (const item of importedAssets) await removeAsset(item.id)
        pushToast({ kind: 'error', title: '素材类型不匹配', message: '图生视频和首尾帧只接受图片。' })
        return
      }
      const role: MediaRole = preferredRole || 'first_frame'
      const next = [...inputs.filter((item) => item.role !== role), { asset, role }]
      const errors = validateMedia(asset, next)
      if (errors.length) {
        for (const item of importedAssets) await removeAsset(item.id)
        pushToast({ kind: 'error', title: '图片不符合要求', message: errors.join('；') })
        return
      }
      setInputs(next)
      return
    }

    const asset = importedAssets.find((item) => item.kind === 'video')
    if (!asset) {
      for (const item of importedAssets) await removeAsset(item.id)
      pushToast({ kind: 'error', title: '素材类型不匹配', message: '特效转换需要视频文件。' })
      return
    }
    const next = [{ asset, role: 'reference_video' as MediaRole }]
    const errors = validateMedia(asset, next)
    if (errors.length) {
      for (const item of importedAssets) await removeAsset(item.id)
      pushToast({ kind: 'error', title: '视频不符合要求', message: errors.join('；') })
      return
    }
    setInputs(next)
  }

  async function pickAndAdd(kind: MediaKind, role?: MediaRole): Promise<void> {
    const multiple = false
    if (role && inputs.some((item) => item.role === role)) {
      pushToast({ kind: 'info', title: '这个位置已有素材', message: '请先移除后再添加。' })
      return
    }
    const imported = await importPicked(kind, multiple)
    await addImportedAssets(imported, role)
  }

  async function handleDropPaths(paths: string[], role?: MediaRole): Promise<void> {
    if (!paths.length) return
    const imported = await useAppStore.getState().importPaths(paths)
    await addImportedAssets(imported, role)
  }

  function validateBeforeGenerate(): string | null {
    if (!prompt.trim()) return '请先描述你想看到的画面'
    if (prompt.length > 7000) return '提示词超过 7000 字，请精简'
    if (mode === 'image' && !inputs.some((item) => item.role === 'first_frame')) return '图生视频需要一张起始画面'
    if (mode === 'firstlast') {
      if (!inputs.some((item) => item.role === 'first_frame')) return '请上传首帧'
      if (!inputs.some((item) => item.role === 'last_frame')) return '请上传尾帧'
    }
    if (mode === 'effect' && !inputs.some((item) => item.role === 'reference_video')) return '请上传要转换的视频'
    for (const input of inputs) {
      const errors = validateMedia(input.asset, inputs)
      if (errors.length) return `${input.asset.name}：${errors[0]}`
    }
    return null
  }

  async function handleGenerate(): Promise<void> {
    if (!settings?.onboardingDone) {
      openOnboarding()
      return
    }
    const validation = validateBeforeGenerate()
    if (validation) {
      pushToast({ kind: 'error', title: '还差一点', message: validation })
      return
    }
    try {
      await createTask({
        mode,
        prompt,
        negativePrompt: negative || undefined,
        resolution,
        duration,
        fps: 24,
        seed,
        steps,
        audio,
        audioMode,
        effect: mode === 'effect' ? effect : undefined,
        inputs
      })
    } catch {
      // Store 已经弹出错误提示。
    }
  }

  async function handleEnhance(): Promise<void> {
    if (!prompt.trim()) {
      pushToast({ kind: 'info', title: '先写一段提示词', message: '润色需要一段基础描述。' })
      return
    }
    setEnhanceBusy(true)
    try {
      const result = await window.ltx.enhancePrompt(prompt, mode)
      setPromptOverride(result.prompt)
      pushToast({ kind: 'success', title: '本地润色完成', message: result.note })
    } catch (error) {
      pushToast({ kind: 'error', title: '润色失败', message: readableError(error) })
    } finally {
      setEnhanceBusy(false)
    }
  }

  async function handleCancel(): Promise<void> {
    if (!activeTask) return
    try {
      await window.ltx.cancelTask(activeTask.id)
      pushToast({ kind: 'info', title: '任务已取消' })
    } catch (error) {
      pushToast({ kind: 'error', title: '取消失败', message: readableError(error) })
    }
  }

  function handleRetry(): void {
    if (!activeTask) return
    hydrateFromTask(activeTask)
    setPendingAutoGenerate(true)
  }

  function copyPrompt(): void {
    if (!prompt.trim()) return
    void window.ltx.copyText(prompt)
    pushToast({ kind: 'success', title: '提示词已复制' })
  }

  return (
    <div className="studio-page">
      <div className="studio-header">
        <div className="studio-title">
          <span className="page-eyebrow">
            <Sparkles size={12} />
            LOCAL STUDIO
          </span>
          <h1>创作台</h1>
          <p>把脑海里的镜头，交给本地 LTX 完成</p>
        </div>

        <div className="mode-switcher">
          {MODES.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                className={clsx('mode-tab', mode === item.id && 'active', item.soon && 'soon')}
                onClick={() => changeMode(item.id)}
                title={item.soon ? 'IC-LoRA 权重兼容性验证中，v1.0 暂不开放' : MODE_INFO[item.id].description}
              >
                <span className="mode-icon">
                  <Icon size={17} />
                </span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.soon ? '即将开放' : item.sub}</small>
                </span>
              </button>
            )
          })}
        </div>

        <div className="studio-header-right">
          <span className={clsx('workspace-status', engine.state === 'ready' ? 'ready' : 'warn')}>
            <i />
            {engine.state === 'ready' ? '本地引擎就绪' : engine.state === 'starting' ? '引擎启动中' : '引擎未就绪'}
          </span>
          <span className="header-divider" />
          <span className="header-hint">{tierInfo.label} · {formatEstimated(estimated)}</span>
        </div>
      </div>

      <div className="studio-grid">
        <div className="left-column">
          <PromptComposer
            mode={mode}
            promptMode={promptMode}
            setPromptMode={changePromptMode}
            idea={idea}
            setIdea={changeIdea}
            draft={draft}
            updateDraft={updateDraft}
            negative={negative}
            setNegative={changeNegative}
            soundDesign={audio}
            setSoundDesign={(value) => {
              setAudio(value)
              setPromptOverride(null)
            }}
            prompt={prompt}
            setPromptOverride={setPromptOverride}
            isManual={isManual}
            resetToAuto={() => setPromptOverride(null)}
            review={review}
            onDirector={() => {
              setPromptOverride(null)
              pushToast({ kind: 'success', title: '已按结构生成提示词', message: '可继续在下方预览区手动修改。' })
            }}
            directorBusy={false}
            onEnhance={() => void handleEnhance()}
            enhanceBusy={enhanceBusy}
            tips={[]}
            applyTemplate={(value) => {
              setIdea(value)
              setPromptMode('inspiration')
              setPromptOverride(null)
            }}
            onCopy={copyPrompt}
          />

          <MediaInput
            mode={mode}
            inputs={inputs}
            onPick={(kind, role) => void pickAndAdd(kind, role)}
            onDropPaths={(paths, role) => void handleDropPaths(paths, role)}
            onRemove={(assetId) => setInputs((state) => state.filter((item) => item.asset.id !== assetId))}
          />
        </div>

        <PreviewStage
          task={activeTask}
          tasks={tasks}
          mode={mode}
          prompt={prompt}
          stage={stage as TaskStageEvent | null}
          generating={generating}
          onCancel={() => void handleCancel()}
          onSelectTask={setActiveTask}
          onOpenLibrary={() => setView('library')}
          onRetry={handleRetry}
          onOpenDetail={openTaskDetail}
        />

        <GenerationSettings
          mode={mode}
          resolution={resolution}
          duration={duration}
          steps={steps}
          seed={seed}
          audio={audio}
          audioMode={audioMode}
          effect={effect}
          tier={tier}
          maxResolution={tierInfo.maxResolution}
          generating={generating}
          engineReady={canGenerate}
          setResolution={setResolution}
          setDuration={setDuration}
          setSteps={setSteps}
          setSeed={setSeed}
          setAudio={setAudio}
          setAudioMode={setAudioMode}
          setEffect={setEffect}
          onGenerate={() => void handleGenerate()}
          onOpenSettings={() => setView('settings')}
        />
      </div>
    </div>
  )
}
