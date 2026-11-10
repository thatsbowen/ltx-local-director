import { app, nativeImage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type {
  DirectoryInfo,
  LocalAsset,
  LtxSettings,
  MediaKind,
  Resolution,
  VideoTask,
  VramTier
} from '@shared/types'

// ------------------------------------------------------------
// 默认设置
// ------------------------------------------------------------

const DEFAULT_RESOLUTION: Resolution = '960x544'

function existingFile(candidate: string | undefined): string | undefined {
  if (!candidate) return undefined
  try {
    return fs.statSync(candidate).isFile() ? candidate : undefined
  } catch {
    return undefined
  }
}

function existingDir(candidate: string | undefined): string | undefined {
  if (!candidate) return undefined
  try {
    return fs.statSync(candidate).isDirectory() ? candidate : undefined
  } catch {
    return undefined
  }
}

/** 开发机上的 ComfyUI 安装位置，仅作为非打包模式下的兜底 */
const DEV_COMFY_ROOT = 'C:\\Users\\Zhang\\AppData\\Local\\Programs\\ComfyUI\\resources\\ComfyUI'
const DEV_COMFY_BASE = 'C:\\Users\\Zhang\\Documents\\ComfyUI'
const DEV_COMFY_PYTHON = 'C:\\Users\\Zhang\\Documents\\ComfyUI\\.venv\\Scripts\\python.exe'

/** 打包后 exe 所在目录（便携根目录） */
function portableRoot(): string {
  return process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe'))
}

function firstDir(candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    if (existingDir(candidate)) return candidate
  }
  return undefined
}

function firstFile(candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    if (existingFile(candidate)) return candidate
  }
  return undefined
}

function detectEngineRoot(): string {
  if (process.env.LTX_ENGINE_ROOT) return process.env.LTX_ENGINE_ROOT
  if (app.isPackaged) {
    const root = portableRoot()
    const comfyBase = path.join(root, 'data', 'comfyui')
    return (
      firstDir([
        path.join(process.resourcesPath, 'engine'),
        path.join(comfyBase, 'ComfyUI'),
        path.join(comfyBase, 'comfyui'),
        path.join(root, 'data', 'ComfyUI')
      ]) ?? path.join(process.resourcesPath, 'engine')
    )
  }
  return existingFile(path.join(app.getAppPath(), 'engine', 'main.py'))
    ? path.join(app.getAppPath(), 'engine')
    : DEV_COMFY_ROOT
}

function detectPythonPath(): string {
  if (process.env.LTX_PYTHON) return process.env.LTX_PYTHON
  if (app.isPackaged) {
    const root = portableRoot()
    const comfyBase = path.join(root, 'data', 'comfyui')
    return (
      firstFile([
        path.join(process.resourcesPath, 'python', 'python.exe'),
        path.join(comfyBase, 'python_embeded', 'python.exe'),
        path.join(comfyBase, 'ComfyUI', 'python_embeded', 'python.exe'),
        path.join(comfyBase, '.venv', 'Scripts', 'python.exe'),
        path.join(root, 'data', 'python', 'python.exe')
      ]) ?? path.join(process.resourcesPath, 'python', 'python.exe')
    )
  }
  return DEV_COMFY_PYTHON
}

function detectModelRoot(dataDir: string): string {
  if (process.env.LTX_MODEL_ROOT) return process.env.LTX_MODEL_ROOT
  if (!app.isPackaged) return DEV_COMFY_BASE
  return (
    firstDir([
      path.join(dataDir, 'comfyui'),
      path.join(dataDir, 'comfyui', 'ComfyUI'),
      path.join(dataDir, 'ComfyUI')
    ]) ?? path.join(dataDir, 'comfyui')
  )
}

function buildDefaults(dataDir: string): LtxSettings {
  const modelRoot = detectModelRoot(dataDir)
  return {
    enginePort: 8188,
    engineRoot: detectEngineRoot(),
    modelRoot,
    pythonPath: detectPythonPath(),
    autoStartEngine: true,
    tier: '16G',
    defaultResolution: DEFAULT_RESOLUTION,
    defaultDuration: 4,
    defaultFps: 24,
    defaultSteps: 9,
    defaultSeed: -1,
    audioDefault: true,
    outputDir: path.join(dataDir, 'videos'),
    importDir: path.join(dataDir, 'import'),
    onboardingDone: false,
    reduceMotion: false,
    allowNetwork: false
  }
}

// ------------------------------------------------------------
// 存储状态
// ------------------------------------------------------------

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm'])
const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a'])

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4'
}

let dataDir = ''
let videosDir = ''
let logsDir = ''
let assetsDir = ''
let importDir = ''
let usingFallback = false
let settings: LtxSettings = buildDefaults('')
let tasks: VideoTask[] = []
let assets: LocalAsset[] = []
let initialized = false

function fileExists(p: string): boolean {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

function isWritable(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true })
    const probe = path.join(dir, `.write-test-${Date.now()}`)
    fs.writeFileSync(probe, 'ok')
    fs.rmSync(probe, { force: true })
    return true
  } catch {
    return false
  }
}

function resolveDataDir(): { dir: string; fallback: boolean } {
  const executableDir = app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath()
  const portableBase = process.env.PORTABLE_EXECUTABLE_DIR || executableDir
  const preferred = path.join(portableBase, 'data')

  if (isWritable(preferred)) return { dir: preferred, fallback: false }

  const fallback = path.join(app.getPath('userData'), 'data')
  fs.mkdirSync(fallback, { recursive: true })
  return { dir: fallback, fallback: true }
}

/**
 * 便携模式：把 Electron 的 userData（缓存、Local Storage、DevTools 状态等）
 * 也放进 data 目录，避免往 %APPDATA% 写东西。
 * 必须在 app ready 之前调用。
 */
export function applyPortableUserData(): void {
  try {
    const resolved = resolveDataDir()
    if (resolved.fallback) return
    app.setPath('userData', path.join(resolved.dir, 'electron'))
  } catch {
    /* 设置失败时退回 Electron 默认 userData */
  }
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fileExists(file)) return fallback
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJson(file: string, value: unknown): void {
  const temporary = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), 'utf8')
  try {
    fs.renameSync(temporary, file)
  } catch {
    fs.copyFileSync(temporary, file)
    fs.rmSync(temporary, { force: true })
  }
}

function settingsFile(): string {
  return path.join(dataDir, 'settings.json')
}

function tasksFile(): string {
  return path.join(dataDir, 'tasks.json')
}

function assetsFile(): string {
  return path.join(dataDir, 'assets.json')
}

// ------------------------------------------------------------
// 初始化
// ------------------------------------------------------------

export function initStore(): void {
  if (initialized) return
  const resolved = resolveDataDir()
  dataDir = resolved.dir
  usingFallback = resolved.fallback
  videosDir = path.join(dataDir, 'videos')
  logsDir = path.join(dataDir, 'logs')
  assetsDir = path.join(dataDir, 'assets')
  importDir = path.join(dataDir, 'import')

  for (const dir of [dataDir, videosDir, logsDir, assetsDir, importDir]) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const defaults = buildDefaults(dataDir)
  const stored = readJson<Partial<LtxSettings>>(settingsFile(), {})
  settings = sanitizeSettings({ ...defaults, ...stored }, defaults)

  assets = readJson<LocalAsset[]>(assetsFile(), []).map((asset) => ({
    ...asset,
    url: toAssetUrl(asset.relativePath)
  }))

  const assetsById = new Map(assets.map((asset) => [asset.id, asset]))
  tasks = readJson<Partial<VideoTask>[]>(tasksFile(), []).map((task) => migrateTask(task, assetsById))

  initialized = true
}

function sanitizeSettings(input: LtxSettings, defaults: LtxSettings): LtxSettings {
  const tiers: VramTier[] = ['8G', '16G', '24G', '32G', '64G']
  const resolutions: Resolution[] = ['832x480', '960x544', '1216x704', '1280x720']
  return {
    enginePort: Number(input.enginePort) || defaults.enginePort,
    engineRoot: existingDir(input.engineRoot) || defaults.engineRoot,
    modelRoot: existingDir(input.modelRoot) || defaults.modelRoot,
    pythonPath: existingFile(input.pythonPath) || defaults.pythonPath,
    autoStartEngine: input.autoStartEngine !== false,
    tier: tiers.includes(input.tier) ? input.tier : defaults.tier,
    defaultResolution: resolutions.includes(input.defaultResolution) ? input.defaultResolution : defaults.defaultResolution,
    defaultDuration: clamp(Number(input.defaultDuration) || defaults.defaultDuration, 2, 10),
    defaultFps: [24, 25, 30].includes(Number(input.defaultFps)) ? Number(input.defaultFps) : 24,
    defaultSteps: clamp(Number(input.defaultSteps) || 9, 4, 20),
    defaultSeed: Number.isFinite(Number(input.defaultSeed)) ? Number(input.defaultSeed) : -1,
    audioDefault: input.audioDefault !== false,
    outputDir: input.outputDir || defaults.outputDir,
    importDir: input.importDir || defaults.importDir,
    onboardingDone: Boolean(input.onboardingDone),
    reduceMotion: Boolean(input.reduceMotion),
    allowNetwork: Boolean(input.allowNetwork)
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

function migrateTask(task: Partial<VideoTask>, assetsById: Map<string, LocalAsset>): VideoTask {
  const now = Date.now()
  const inputs = (task.inputs ?? []).map((input) => {
    const asset = assetsById.get(input.assetId)
    const url = asset?.url || input.url
    return { ...input, url }
  })
  return {
    id: task.id ?? crypto.randomUUID(),
    status: task.status ?? 'failed',
    progress: task.progress ?? 0,
    mode: task.mode ?? 'text',
    resolution: task.resolution ?? DEFAULT_RESOLUTION,
    duration: task.duration ?? 4,
    fps: task.fps ?? 24,
    prompt: task.prompt ?? '',
    negativePrompt: task.negativePrompt,
    seed: task.seed ?? 42,
    steps: task.steps ?? 9,
    audio: task.audio !== false,
    audioMode: task.audioMode ?? 'ambient',
    effect: task.effect,
    inputs,
    elapsedSec: task.elapsedSec,
    peakVramMb: task.peakVramMb,
    localVideoPath: task.localVideoPath,
    localVideoUrl: task.localVideoPath ? pathToLocalUrl(task.localVideoPath) : task.localVideoUrl,
    coverUrl: task.coverUrl,
    error: task.error,
    createdAt: task.createdAt ?? now,
    updatedAt: task.updatedAt ?? now,
    completedAt: task.completedAt
  }
}

// ------------------------------------------------------------
// 目录
// ------------------------------------------------------------

export function getDirectories(): DirectoryInfo {
  return { dataDir, outputDir: videosDir, logsDir, usingFallback }
}

export function getDataDir(): string {
  return dataDir
}

export function getVideosDir(): string {
  return videosDir
}

export function getLogsDir(): string {
  return logsDir
}

export function getAssetsDir(): string {
  return assetsDir
}

export function getImportDir(): string {
  return importDir
}

export function toAssetUrl(relativePath: string): string {
  const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean)
  return `ltxasset://local/${parts.map(encodeURIComponent).join('/')}`
}

export function pathToLocalUrl(absolutePath: string): string | undefined {
  const root = path.resolve(dataDir)
  const resolved = path.resolve(absolutePath)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return undefined
  return toAssetUrl(path.relative(root, resolved))
}

// ------------------------------------------------------------
// 设置
// ------------------------------------------------------------

export function getSettings(): LtxSettings {
  return { ...settings }
}

export function saveSettings(input: Partial<LtxSettings>): LtxSettings {
  const defaults = buildDefaults(dataDir)
  settings = sanitizeSettings({ ...settings, ...input }, defaults)
  writeJson(settingsFile(), settings)
  return getSettings()
}

// ------------------------------------------------------------
// 任务
// ------------------------------------------------------------

export function getTasks(): VideoTask[] {
  return [...tasks].sort((a, b) => b.createdAt - a.createdAt)
}

export function addTask(task: VideoTask): void {
  tasks.unshift(task)
  persistTasks()
}

export function updateTask(id: string, patch: Partial<VideoTask>): VideoTask | undefined {
  const index = tasks.findIndex((task) => task.id === id)
  if (index < 0) return undefined
  tasks[index] = { ...tasks[index], ...patch, updatedAt: Date.now() }
  persistTasks()
  return tasks[index]
}

export function findTask(id: string): VideoTask | undefined {
  return tasks.find((task) => task.id === id)
}

export function removeTask(id: string, deleteFile?: boolean): VideoTask | undefined {
  const index = tasks.findIndex((task) => task.id === id)
  if (index < 0) return undefined
  const [task] = tasks.splice(index, 1)
  persistTasks()
  if (deleteFile && task.localVideoPath) {
    try {
      fs.rmSync(task.localVideoPath, { force: true })
    } catch {
      // 文件被占用时忽略，记录仍然移除。
    }
  }
  return task
}

export function persistTasks(): void {
  writeJson(tasksFile(), tasks)
}

// ------------------------------------------------------------
// 素材
// ------------------------------------------------------------

export function getAssets(): LocalAsset[] {
  return [...assets]
}

export function findAsset(id: string): LocalAsset | undefined {
  return assets.find((asset) => asset.id === id)
}

export function persistAssets(): void {
  writeJson(assetsFile(), assets)
}

export function updateAsset(asset: LocalAsset): LocalAsset {
  const index = assets.findIndex((item) => item.id === asset.id)
  if (index >= 0) assets[index] = asset
  else assets.unshift(asset)
  persistAssets()
  return asset
}

export function removeAsset(id: string): void {
  const asset = findAsset(id)
  if (!asset) return
  assets = assets.filter((item) => item.id !== id)
  persistAssets()
  try {
    fs.rmSync(path.join(dataDir, asset.relativePath), { force: true })
  } catch {
    // 元数据优先于物理清理。
  }
}

function kindFromExt(ext: string): MediaKind | null {
  if (IMAGE_EXT.has(ext)) return 'image'
  if (VIDEO_EXT.has(ext)) return 'video'
  if (AUDIO_EXT.has(ext)) return 'audio'
  return null
}

const SIZE_LIMITS: Record<MediaKind, number> = {
  image: 40 * 1024 * 1024,
  video: 400 * 1024 * 1024,
  audio: 60 * 1024 * 1024
}

export function importAssetFromPath(sourcePath: string): LocalAsset {
  if (!fileExists(sourcePath)) throw new Error('文件不存在或无法读取')

  const ext = path.extname(sourcePath).toLowerCase()
  const kind = kindFromExt(ext)
  if (!kind) throw new Error('仅支持 JPG / PNG / WEBP 图片，MP4 / MOV / WEBM 视频，MP3 / WAV 音频')

  const stat = fs.statSync(sourcePath)
  const limit = SIZE_LIMITS[kind]
  if (stat.size > limit) {
    throw new Error(`${path.basename(sourcePath)} 超过 ${Math.round(limit / 1024 / 1024)}MB 限制`)
  }
  if (stat.size === 0) throw new Error('文件内容为空')

  const id = crypto.randomUUID()
  const fileName = `${id}${ext}`
  const relativePath = path.join('assets', fileName)
  const destination = path.join(dataDir, relativePath)
  fs.copyFileSync(sourcePath, destination)

  let width: number | undefined
  let height: number | undefined
  if (kind === 'image') {
    try {
      const image = nativeImage.createFromPath(destination)
      const size = image.getSize()
      if (size.width > 0 && size.height > 0) {
        width = size.width
        height = size.height
      }
    } catch {
      // 渲染层可以再探测一次。
    }
  }

  const asset: LocalAsset = {
    id,
    kind,
    name: path.basename(sourcePath),
    ext,
    mime: MIME_MAP[ext] || 'application/octet-stream',
    size: stat.size,
    relativePath,
    url: toAssetUrl(relativePath),
    createdAt: Date.now(),
    width,
    height
  }
  assets.unshift(asset)
  persistAssets()
  return asset
}

/** 把生成结果从 ComfyUI 输出目录搬进我们的作品目录 */
export function adoptGeneratedVideo(sourcePath: string, taskId: string): { path: string; url: string } {
  fs.mkdirSync(videosDir, { recursive: true })
  const ext = path.extname(sourcePath) || '.mp4'
  const destination = path.join(videosDir, `${taskId}${ext}`)
  fs.copyFileSync(sourcePath, destination)
  const url = pathToLocalUrl(destination)
  if (!url) throw new Error('输出目录不在数据目录内')
  return { path: destination, url }
}
