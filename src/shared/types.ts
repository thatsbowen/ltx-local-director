// ============================================================
// LTX 本地导演台 — 共享类型
// 所有跨进程（main / preload / renderer）契约都定义在这里
// ============================================================

/** 显存档位 */
export type VramTier = '8G' | '16G' | '24G' | '32G' | '64G'

/** 引擎状态 */
export type EngineState = 'stopped' | 'starting' | 'ready' | 'error'

/** 生成模式 */
export type GenerationMode = 'text' | 'image' | 'firstlast' | 'effect'

/** v1 特效（IC-LoRA） */
export type EffectId = 'canny' | 'depth'

/** 任务状态 */
export type TaskStatus =
  | 'queued'
  | 'preparing'
  | 'loading'
  | 'sampling'
  | 'decoding'
  | 'success'
  | 'failed'
  | 'canceled'

export type MediaKind = 'image' | 'video' | 'audio'
export type MediaRole = 'first_frame' | 'last_frame' | 'reference_image' | 'reference_video'

/** 分辨率档（宽x高，均为 32 的倍数） */
export type Resolution = '832x480' | '960x544' | '1216x704' | '1280x720'

// ------------------------------------------------------------
// 硬件与引擎
// ------------------------------------------------------------

export interface HardwareInfo {
  gpuName: string
  vramMb: number
  computeCap: string
  driver: string
  ramMb: number
  diskFreeGb: number
  /** 推断档位 */
  tier: VramTier
  /** Blackwell (sm_120) 才支持 NVFP4 */
  supportsNvfp4: boolean
  /** Ada (sm_89) 及以上支持 fp8 */
  supportsFp8: boolean
  /** Win10 + RTX50 需要提示升级 */
  needsWin11Hint: boolean
  /** 推荐默认参数 */
  recommended: RecommendedProfile
}

export interface RecommendedProfile {
  tier: VramTier
  resolution: Resolution
  duration: number
  steps: number
  /** 单条预计耗时（秒），由实测校准 */
  estimatedSec: number
  /** 上限分辨率（超出需警告） */
  maxResolution: Resolution
  note: string
}

export interface EngineStatus {
  state: EngineState
  port: number
  message: string
  pid?: number
  startedAt?: number
  lastError?: string
}

export interface EngineLogLine {
  at: number
  level: 'info' | 'warn' | 'error'
  text: string
}

// ------------------------------------------------------------
// 模型
// ------------------------------------------------------------

export type ModelRole =
  | 'transformer'
  | 'text_encoder'
  | 'text_projection'
  | 'video_vae'
  | 'audio_vae'
  | 'upscaler'
  | 'lora'
  | 'effect_lora'
  | 'assistant_llm'

export interface ModelFile {
  id: string
  role: ModelRole
  /** 展示名 */
  name: string
  /** ComfyUI 目录名，如 unet / text_encoders / vae / loras */
  folder: string
  /** 期望文件名 */
  filename: string
  sizeGb: number
  required: boolean
  /** 哪些档位需要 */
  tiers: VramTier[]
  description: string
}

export interface ModelStatus extends ModelFile {
  present: boolean
  actualPath?: string
  actualSizeGb?: number
}

export interface ModelScanResult {
  models: ModelStatus[]
  missingRequired: string[]
  modelRoot: string
  scannedAt: number
}

// ------------------------------------------------------------
// 素材
// ------------------------------------------------------------

export interface LocalAsset {
  id: string
  kind: MediaKind
  name: string
  ext: string
  mime: string
  size: number
  relativePath: string
  url: string
  createdAt: number
  width?: number
  height?: number
  duration?: number
}

export interface AssetRef {
  asset: LocalAsset
  role: MediaRole
}

export interface TaskInput {
  assetId: string
  kind: MediaKind
  role: MediaRole
  name: string
  url: string
  relativePath: string
}

// ------------------------------------------------------------
// 生成
// ------------------------------------------------------------

export interface GenerationRequest {
  mode: GenerationMode
  prompt: string
  negativePrompt?: string
  resolution: Resolution
  /** 秒 */
  duration: number
  fps: number
  seed: number
  steps: number
  audio: boolean
  /** 音频强度提示：0 环境声，1 含对白 */
  audioMode: 'ambient' | 'dialogue'
  effect?: EffectId
  effectStrength?: number
  inputs: AssetRef[]
}

export interface VideoTask {
  id: string
  status: TaskStatus
  progress: number
  mode: GenerationMode
  resolution: Resolution
  duration: number
  fps: number
  prompt: string
  negativePrompt?: string
  seed: number
  steps: number
  audio: boolean
  audioMode: 'ambient' | 'dialogue'
  effect?: EffectId
  inputs: TaskInput[]
  /** 实际耗时（秒） */
  elapsedSec?: number
  peakVramMb?: number
  localVideoPath?: string
  localVideoUrl?: string
  coverUrl?: string
  error?: string
  createdAt: number
  updatedAt: number
  completedAt?: number
}

export interface CreateTaskResult {
  task: VideoTask
  message?: string
}

export interface TaskStageEvent {
  stage: TaskStatus
  message: string
  progress?: number
  node?: string
}

// ------------------------------------------------------------
// 设置
// ------------------------------------------------------------

export interface LtxSettings {
  /** ComfyUI 后端端口 */
  enginePort: number
  /** ComfyUI 根目录（含 main.py） */
  engineRoot: string
  /** ComfyUI 基础目录（含 models / input / output / user），作为 --base-directory */
  modelRoot: string
  /** Python 可执行文件（ComfyUI venv） */
  pythonPath: string
  /** 启动时自动拉起引擎 */
  autoStartEngine: boolean
  /** 当前档位 */
  tier: VramTier
  defaultResolution: Resolution
  defaultDuration: number
  defaultFps: number
  defaultSteps: number
  defaultSeed: number
  audioDefault: boolean
  /** 输出目录 */
  outputDir: string
  /** 下载/导入模型目录（离线导入用） */
  importDir: string
  onboardingDone: boolean
  reduceMotion: boolean
  /** 联网白名单：仅模型下载时允许 */
  allowNetwork: boolean
}

export interface DirectoryInfo {
  dataDir: string
  outputDir: string
  logsDir: string
  usingFallback: boolean
}

export interface BootstrapData {
  version: string
  platform: string
  settings: LtxSettings
  tasks: VideoTask[]
  assets: LocalAsset[]
  dirs: DirectoryInfo
  hardware: HardwareInfo | null
  engine: EngineStatus
  models: ModelScanResult | null
}

export interface PickFilesInput {
  kind: MediaKind
  multiple?: boolean
}

export interface UpdateAssetMetaInput {
  id: string
  width?: number
  height?: number
  duration?: number
}

export interface EnhanceResult {
  prompt: string
  note?: string
}

// ------------------------------------------------------------
// IPC 契约
// ------------------------------------------------------------

export interface LtxApi {
  getBootstrap: () => Promise<BootstrapData>
  saveSettings: (input: Partial<LtxSettings>) => Promise<LtxSettings>

  // 硬件 / 引擎
  detectHardware: () => Promise<HardwareInfo>
  startEngine: () => Promise<EngineStatus>
  stopEngine: () => Promise<EngineStatus>
  getEngineStatus: () => Promise<EngineStatus>
  onEngineStatus: (listener: (status: EngineStatus) => void) => () => void
  onEngineLog: (listener: (line: EngineLogLine) => void) => () => void

  // 模型
  scanModels: () => Promise<ModelScanResult>
  pickModelRoot: () => Promise<string | null>

  // 素材
  pickFiles: (input: PickFilesInput) => Promise<LocalAsset[]>
  importFiles: (paths: string[]) => Promise<LocalAsset[]>
  updateAssetMeta: (input: UpdateAssetMetaInput) => Promise<LocalAsset>
  removeAsset: (id: string) => Promise<void>

  // 生成
  createTask: (input: GenerationRequest) => Promise<CreateTaskResult>
  cancelTask: (id: string) => Promise<VideoTask>
  removeTask: (id: string, deleteFile?: boolean) => Promise<void>
  saveTaskAs: (id: string) => Promise<{ saved: boolean; path?: string }>

  // 提示词助手（本地 LLM）
  enhancePrompt: (prompt: string, mode: GenerationMode) => Promise<EnhanceResult>

  // 系统
  openPath: (target: 'data' | 'output' | 'logs' | string) => Promise<void>
  showItemInFolder: (path: string) => Promise<void>
  copyText: (text: string) => Promise<void>
  windowMinimize: () => void
  windowToggleMaximize: () => Promise<boolean>
  windowClose: () => void
  getPathForFile: (file: File) => string

  // 事件
  onTaskUpdate: (listener: (task: VideoTask) => void) => () => void
  onTaskRemoved: (listener: (id: string) => void) => () => void
  onTaskStage: (listener: (event: TaskStageEvent) => void) => () => void
  onWindowState: (listener: (maximized: boolean) => void) => () => void
}

// ------------------------------------------------------------
// 常量表
// ------------------------------------------------------------

export const RESOLUTIONS: Record<Resolution, { width: number; height: number; label: string }> = {
  '832x480': { width: 832, height: 480, label: '480p' },
  '960x544': { width: 960, height: 544, label: '544p' },
  '1216x704': { width: 1216, height: 704, label: '704p' },
  '1280x720': { width: 1280, height: 720, label: '720p' }
}

export const TIER_INFO: Record<
  VramTier,
  {
    label: string
    vram: string
    quantization: string
    maxResolution: Resolution
    defaultResolution: Resolution
    modelDownloadGb: number
    note: string
  }
> = {
  '8G': {
    label: '8GB 实验档',
    vram: '8 GB',
    quantization: 'GGUF Q3 + 全量 offload',
    maxResolution: '832x480',
    defaultResolution: '832x480',
    modelDownloadGb: 12,
    note: '仅建议 3 秒短片，速度很慢，画质有明显损失'
  },
  '16G': {
    label: '16GB 主力档',
    vram: '16 GB',
    quantization: 'NVFP4（50系）/ INT8（40系）',
    maxResolution: '1216x704',
    defaultResolution: '960x544',
    modelDownloadGb: 24,
    note: '主力配置，可跑 544p~704p、4~5 秒带音频'
  },
  '24G': {
    label: '24GB 甜点档',
    vram: '24 GB',
    quantization: 'NVFP4 全驻留 / FP8（Ada）',
    maxResolution: '1280x720',
    defaultResolution: '1216x704',
    modelDownloadGb: 26,
    note: '可跑 704p~720p、6 秒，无需频繁 offload'
  },
  '32G': {
    label: '32GB 推荐档',
    vram: '32 GB',
    quantization: 'FP8 全驻留 + 2× 放大',
    maxResolution: '1280x720',
    defaultResolution: '1216x704',
    modelDownloadGb: 40,
    note: '支持双阶段 2× 空间放大，输出 1080p 级别'
  },
  '64G': {
    label: '64GB 最佳画质档',
    vram: '64 GB',
    quantization: 'BF16 全精度 + DFR',
    maxResolution: '1280x720',
    defaultResolution: '1280x720',
    modelDownloadGb: 85,
    note: 'BF16 全精度、多关键帧与高质量后处理'
  }
}

export const MODE_INFO: Record<
  GenerationMode,
  { title: string; subtitle: string; description: string; accept: string }
> = {
  text: {
    title: '文生视频',
    subtitle: 'Text to Video',
    description: '一段完整描述，从零生成带声音的视频。',
    accept: ''
  },
  image: {
    title: '图生视频',
    subtitle: 'Image to Video',
    description: '以一张画面为起点，让镜头动起来。',
    accept: 'image'
  },
  firstlast: {
    title: '首尾帧',
    subtitle: 'First / Last Frame',
    description: '给定开场与结尾，补齐中间的运动。',
    accept: 'image'
  },
  effect: {
    title: '特效转换',
    subtitle: 'IC-LoRA Effect',
    description: '用线稿或深度控制，把视频转换成指定风格。',
    accept: 'video'
  }
}

export const EFFECT_INFO: Record<EffectId, { title: string; description: string; needsDepthModel: boolean }> = {
  canny: {
    title: '线稿动画',
    description: '提取画面边缘作为结构控制，生成线稿/素描风格动画。',
    needsDepthModel: false
  },
  depth: {
    title: '景深强化',
    description: '用深度图控制空间层次，强化前后景分离。',
    needsDepthModel: true
  }
}

// ------------------------------------------------------------
// 耗时预估（主进程与渲染层共用同一套系数）
// 基准：RTX 5060 Ti 16GB / 960×544 / 4 秒 / T2V = 76.4 秒
// ------------------------------------------------------------

export const TIER_SPEED_FACTOR: Record<VramTier, number> = {
  '8G': 4.0,
  '16G': 1.0,
  '24G': 0.6,
  '32G': 0.45,
  '64G': 0.35
}

const RESOLUTION_SPEED_FACTOR: Record<Resolution, number> = {
  '832x480': 0.72,
  '960x544': 1,
  '1216x704': 1.44,
  '1280x720': 1.6
}

const MODE_SPEED_FACTOR: Record<GenerationMode, number> = {
  text: 1,
  image: 2,
  firstlast: 1.12,
  effect: 1.6
}

export function estimateSeconds(
  mode: GenerationMode,
  resolution: Resolution,
  duration: number,
  tier: VramTier
): number {
  const base = 76.4 * TIER_SPEED_FACTOR[tier]
  const durationFactor = Math.pow(1.12, Math.max(0, duration - 4))
  return Math.max(20, Math.round(base * durationFactor * RESOLUTION_SPEED_FACTOR[resolution] * MODE_SPEED_FACTOR[mode]))
}

export function formatEstimated(seconds: number): string {
  if (seconds < 90) return `约 ${Math.round(seconds)} 秒`
  const minutes = seconds / 60
  if (minutes < 10) return `约 ${minutes.toFixed(1)} 分钟`
  return `约 ${Math.round(minutes)} 分钟`
}
