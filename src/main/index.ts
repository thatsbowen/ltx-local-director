import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  Notification,
  protocol,
  shell,
  Tray,
  Menu
} from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import type {
  AssetRef,
  BootstrapData,
  CreateTaskResult,
  EngineLogLine,
  EngineStatus,
  GenerationRequest,
  HardwareInfo,
  LocalAsset,
  LtxSettings,
  ModelScanResult,
  Resolution,
  TaskInput,
  TaskStageEvent,
  VideoTask
} from '@shared/types'
import { RESOLUTIONS, estimateSeconds } from '@shared/types'
import { ComfyBridge, buildWorkflow, type BuildContext, type ModelPaths } from './comfy'
import { detectHardware } from './hardware'
import { scanModels, resolveModelPaths } from './models'
import { enhancePromptLocal } from './prompt'
import {
  addTask,
  adoptGeneratedVideo,
  applyPortableUserData,
  findAsset,
  findTask,
  getAssets,
  getDataDir,
  getDirectories,
  getLogsDir,
  getSettings,
  getTasks,
  getVideosDir,
  importAssetFromPath,
  initStore,
  pathToLocalUrl,
  removeAsset,
  removeTask,
  saveSettings,
  updateAsset,
  updateTask
} from './store'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'ltxasset',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: false
    }
  }
])

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let trayHintShown = false

const bridge = new ComfyBridge()
const canceledTasks = new Set<string>()
let activeTaskId: string | null = null
let queueChain: Promise<void> = Promise.resolve()

let hardwareCache: { info: HardwareInfo; at: number } | null = null
let modelCache: { result: ModelScanResult; at: number } | null = null

// ------------------------------------------------------------
// 日志与事件
// ------------------------------------------------------------

function logLine(line: string): void {
  try {
    const logPath = path.join(getLogsDir(), 'app.log')
    const stamped = `[${new Date().toISOString()}] ${line}\n`
    fs.appendFileSync(logPath, stamped, 'utf8')
    if (fs.statSync(logPath).size > 2 * 1024 * 1024) {
      fs.rmSync(`${logPath}.old`, { force: true })
      fs.renameSync(logPath, `${logPath}.old`)
    }
  } catch {
    // 日志失败不能影响生成。
  }
}

function sendToRenderer(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

function broadcastTask(task: VideoTask): void {
  sendToRenderer('task:update', task)
}

function sendStage(event: TaskStageEvent): void {
  sendToRenderer('task:stage', event)
}

function getWindowForEvent(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

// ------------------------------------------------------------
// 引擎
// ------------------------------------------------------------

function configureBridge(): void {
  const settings = getSettings()
  bridge.configure({
    engineRoot: settings.engineRoot,
    modelRoot: settings.modelRoot,
    pythonPath: settings.pythonPath,
    port: settings.enginePort
  })
}

function initBridgeEvents(): void {
  bridge.onStatus = (status: EngineStatus) => {
    sendToRenderer('engine:status', status)
    if (status.state === 'error' && status.lastError) {
      logLine(`engine error: ${status.lastError.slice(-600)}`)
    }
  }
  bridge.onLog = (text: string) => {
    const level: EngineLogLine['level'] = /error|traceback|exception/i.test(text)
      ? 'error'
      : /warn|deprecated/i.test(text)
        ? 'warn'
        : 'info'
    sendToRenderer('engine:log', { at: Date.now(), level, text: text.trim() } satisfies EngineLogLine)
  }
}

async function ensureEngine(): Promise<EngineStatus> {
  configureBridge()
  const status = bridge.getStatus()
  if (status.state === 'ready' && (await bridge.health())) return status
  return bridge.start()
}

async function currentHardware(force = false): Promise<HardwareInfo> {
  if (!force && hardwareCache && Date.now() - hardwareCache.at < 60_000) return hardwareCache.info
  const info = await detectHardware(getDataDir())
  hardwareCache = { info, at: Date.now() }
  return info
}

function currentModels(force = false): ModelScanResult {
  const root = getSettings().modelRoot
  if (!force && modelCache && modelCache.result.modelRoot === root && Date.now() - modelCache.at < 15_000) {
    return modelCache.result
  }
  const result = scanModels(root)
  modelCache = { result, at: Date.now() }
  return result
}

// ------------------------------------------------------------
// 生成任务
// ------------------------------------------------------------

function validateRequest(req: GenerationRequest, models: ModelScanResult): void {
  if (!req.prompt.trim()) throw new Error('提示词不能为空')
  if (req.prompt.length > 7000) throw new Error('提示词超过 7000 字')
  if (!(req.resolution in RESOLUTIONS)) throw new Error('分辨率不合法')
  if (!Number.isFinite(req.duration) || req.duration < 2 || req.duration > 10) {
    throw new Error('时长需在 2–10 秒之间')
  }
  if (!Number.isFinite(req.steps) || req.steps < 4 || req.steps > 20) {
    throw new Error('采样步数需在 4–20 之间')
  }

  const roleCount = (role: AssetRef['role']): number => req.inputs.filter((item) => item.role === role).length

  if (req.mode === 'image' && roleCount('first_frame') !== 1) {
    throw new Error('图生视频需要一张起始画面')
  }
  if (req.mode === 'firstlast') {
    if (roleCount('first_frame') !== 1) throw new Error('请上传首帧')
    if (roleCount('last_frame') !== 1) throw new Error('请上传尾帧')
  }
  if (req.mode === 'effect') {
    const hasCanny = models.models.find((item) => item.id === 'effect-canny')?.present
    const hasDepth =
      models.models.find((item) => item.id === 'effect-depth')?.present &&
      models.models.find((item) => item.id === 'depth-estimator')?.present
    if (req.effect === 'canny' && !hasCanny) throw new Error('线稿特效缺少 IC-LoRA 权重，请先在设置中查看模型清单')
    if (req.effect === 'depth' && !hasDepth) throw new Error('景深特效缺少 IC-LoRA 或深度估计模型')
    if (roleCount('reference_video') !== 1) throw new Error('特效转换需要一段输入视频')
    throw new Error('特效模式仍在验证中，v1 暂不开放')
  }
}

function buildTaskInputs(req: GenerationRequest): TaskInput[] {
  return req.inputs.map((input) => {
    const asset = findAsset(input.asset.id)
    if (!asset) throw new Error(`素材「${input.asset.name}」已不存在，请重新导入`)
    return {
      assetId: asset.id,
      kind: asset.kind,
      role: input.role,
      name: asset.name,
      url: asset.url,
      relativePath: asset.relativePath
    }
  })
}

function enqueue(fn: () => Promise<void>): void {
  queueChain = queueChain.then(fn).catch((error) => {
    logLine(`queue error: ${error instanceof Error ? error.stack || error.message : String(error)}`)
  })
}

async function stageInputImages(req: GenerationRequest): Promise<{ first?: string; last?: string }> {
  const result: { first?: string; last?: string } = {}
  for (const role of ['first_frame', 'last_frame'] as const) {
    const ref = req.inputs.find((item) => item.role === role)
    if (!ref) continue
    const asset = findAsset(ref.asset.id)
    if (!asset) throw new Error(`素材「${ref.asset.name}」已不存在`)
    const absolute = path.join(getDataDir(), asset.relativePath)
    const staged = await bridge.stageInput(absolute)
    if (role === 'first_frame') result.first = staged
    else result.last = staged
  }
  return result
}

async function runTask(taskId: string): Promise<void> {
  const task = findTask(taskId)
  if (!task) return
  if (task.status === 'canceled' || canceledTasks.has(taskId)) {
    if (task.status !== 'canceled') {
      const canceled = updateTask(taskId, { status: 'canceled', error: '已取消', progress: 0, completedAt: Date.now() })
      if (canceled) broadcastTask(canceled)
    }
    canceledTasks.delete(taskId)
    return
  }

  activeTaskId = taskId
  const startedAt = Date.now()

  const patch = (value: Partial<VideoTask>): VideoTask | undefined => {
    const updated = updateTask(taskId, value)
    if (updated) broadcastTask(updated)
    return updated
  }

  try {
    patch({ status: 'preparing', progress: 2 })
    sendStage({ stage: 'preparing', message: '检查引擎与模型…', progress: 2 })

    const engine = await ensureEngine()
    if (engine.state !== 'ready') {
      throw new Error(engine.lastError || engine.message || '引擎启动失败')
    }

    const models = currentModels(true)
    const missing = models.models.filter((item) => item.required && !item.present)
    if (missing.length) {
      throw new Error(`缺少必需模型：${missing.map((item) => item.name).join('、')}`)
    }

    patch({ status: 'loading', progress: 6 })
    sendStage({ stage: 'loading', message: '加载模型…', progress: 6 })

    const staged = await stageInputImages({
      ...taskToRequest(task),
      inputs: task.inputs.map((input) => {
        const asset = findAsset(input.assetId)
        return {
          asset: asset ?? {
            id: input.assetId,
            kind: input.kind,
            name: input.name,
            ext: path.extname(input.relativePath),
            mime: 'application/octet-stream',
            size: 0,
            relativePath: input.relativePath,
            url: input.url,
            createdAt: task.createdAt
          },
          role: input.role
        } satisfies AssetRef
      })
    })

    const modelPaths: ModelPaths = resolveModelPaths(models)
    const ctx: BuildContext = {
      req: taskToRequest(task),
      models: modelPaths,
      firstImage: staged.first,
      lastImage: staged.last,
      prefix: `ltx-director/${taskId}`
    }

    const workflow = buildWorkflow(ctx)
    const promptId = await bridge.submit(workflow)
    logLine(`task submit ${taskId} prompt=${promptId}`)

    const estimated = estimateSeconds(ctx.req.mode, ctx.req.resolution, ctx.req.duration, getSettings().tier)
    const result = await bridge.waitFor(promptId, {
      estimatedSec: estimated,
      onStage: (event) => {
        if (canceledTasks.has(taskId)) return
        patch({ status: event.stage, progress: event.progress ?? 0 })
        sendStage(event)
      }
    })

    if (canceledTasks.has(taskId)) {
      throw new Error('已取消')
    }

    const output = result.outputs.find((item) => /\.(mp4|webm|mov)$/i.test(item))
    if (!output) throw new Error('引擎没有返回视频文件')

    sendStage({ stage: 'decoding', message: '归档成片…', progress: 98 })
    const adopted = adoptGeneratedVideo(bridge.resolveOutput(output), taskId)

    const completed = patch({
      status: 'success',
      progress: 100,
      localVideoPath: adopted.path,
      localVideoUrl: adopted.url,
      elapsedSec: Math.round((Date.now() - startedAt) / 1000),
      peakVramMb: result.peakVramMb,
      completedAt: Date.now(),
      error: undefined
    })
    if (completed) {
      notify('视频生成完成', `${completed.duration} 秒 · ${completed.resolution}，点击查看作品`)
    }
    logLine(`task success ${taskId} elapsed=${result.elapsedSec}s peak=${result.peakVramMb ?? '?'}MB`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const canceled = canceledTasks.has(taskId) || /interrupt|cancel/i.test(message)
    const updated = updateTask(taskId, {
      status: canceled ? 'canceled' : 'failed',
      progress: 0,
      error: canceled ? '已取消' : message,
      elapsedSec: Math.round((Date.now() - startedAt) / 1000),
      completedAt: Date.now()
    })
    if (updated) {
      broadcastTask(updated)
      if (!canceled) notify('视频生成失败', message.slice(0, 120))
    }
    logLine(`task ${canceled ? 'canceled' : 'failed'} ${taskId}: ${message}`)
  } finally {
    canceledTasks.delete(taskId)
    if (activeTaskId === taskId) activeTaskId = null
  }
}

function taskToRequest(task: VideoTask): GenerationRequest {
  return {
    mode: task.mode,
    prompt: task.prompt,
    negativePrompt: task.negativePrompt,
    resolution: task.resolution,
    duration: task.duration,
    fps: task.fps,
    seed: task.seed,
    steps: task.steps,
    audio: task.audio,
    audioMode: task.audioMode,
    effect: task.effect,
    inputs: []
  }
}

// ------------------------------------------------------------
// IPC
// ------------------------------------------------------------

async function buildBootstrap(): Promise<BootstrapData> {
  configureBridge()
  const settings = getSettings()
  return {
    version: app.getVersion(),
    platform: process.platform,
    settings,
    tasks: getTasks(),
    assets: getAssets(),
    dirs: getDirectories(),
    hardware: await currentHardware(),
    engine: bridge.getStatus(),
    models: currentModels()
  }
}

function registerIpc(): void {
  ipcMain.handle('app:bootstrap', () => buildBootstrap())

  ipcMain.handle('settings:save', (_event, input: Partial<LtxSettings>): LtxSettings => {
    const saved = saveSettings(input)
    modelCache = null
    configureBridge()
    return saved
  })

  // ---- 硬件 ----
  ipcMain.handle('hardware:detect', () => currentHardware(true))

  // ---- 引擎 ----
  ipcMain.handle('engine:start', async (): Promise<EngineStatus> => {
    configureBridge()
    return bridge.start()
  })
  ipcMain.handle('engine:stop', async (): Promise<EngineStatus> => bridge.stop())
  ipcMain.handle('engine:status', async (): Promise<EngineStatus> => {
    configureBridge()
    if (bridge.getStatus().state === 'ready' && !(await bridge.health())) {
      return { ...bridge.getStatus(), state: 'stopped', message: '引擎连接已断开' }
    }
    return bridge.getStatus()
  })

  // ---- 模型 ----
  ipcMain.handle('models:scan', (): ModelScanResult => currentModels(true))
  ipcMain.handle('models:pickRoot', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: '选择 ComfyUI 基础目录（包含 models 文件夹）',
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  // ---- 素材 ----
  ipcMain.handle('files:pick', async (_event, input: { kind: LocalAsset['kind']; multiple?: boolean }) => {
    const filters: Record<LocalAsset['kind'], Electron.FileFilter[]> = {
      image: [{ name: '图片素材', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
      video: [{ name: '视频素材', extensions: ['mp4', 'mov', 'webm'] }],
      audio: [{ name: '音频素材', extensions: ['mp3', 'wav', 'm4a'] }]
    }
    const result = await dialog.showOpenDialog({
      title: '选择素材',
      properties: input.multiple ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: filters[input.kind]
    })
    if (result.canceled) return []
    const imported: LocalAsset[] = []
    for (const filePath of result.filePaths) {
      try {
        imported.push(importAssetFromPath(filePath))
      } catch (error) {
        logLine(`import failed ${filePath}: ${error instanceof Error ? error.message : error}`)
      }
    }
    return imported
  })

  ipcMain.handle('files:import', (_event, paths: string[]) => {
    const imported: LocalAsset[] = []
    for (const filePath of paths) {
      try {
        imported.push(importAssetFromPath(filePath))
      } catch (error) {
        logLine(`import failed ${filePath}: ${error instanceof Error ? error.message : error}`)
      }
    }
    return imported
  })

  ipcMain.handle('files:updateMeta', (_event, input: { id: string; width?: number; height?: number; duration?: number }) => {
    const asset = findAsset(input.id)
    if (!asset) throw new Error('素材不存在')
    const updated = {
      ...asset,
      width: input.width || asset.width,
      height: input.height || asset.height,
      duration: input.duration || asset.duration
    }
    updateAsset(updated)
    return updated
  })

  ipcMain.handle('files:remove', (_event, id: string) => {
    removeAsset(id)
  })

  // ---- 生成 ----
  ipcMain.handle('generation:create', async (_event, request: GenerationRequest): Promise<CreateTaskResult> => {
    const models = currentModels(true)
    validateRequest(request, models)

    const inputs = buildTaskInputs(request)
    const now = Date.now()
    const seed = request.seed >= 0 ? request.seed : crypto.randomInt(0, 2 ** 31 - 1)

    const task: VideoTask = {
      id: crypto.randomUUID(),
      status: 'queued',
      progress: 0,
      mode: request.mode,
      resolution: request.resolution,
      duration: request.duration,
      fps: request.fps,
      prompt: request.prompt,
      negativePrompt: request.negativePrompt,
      seed,
      steps: request.steps,
      audio: request.audio,
      audioMode: request.audioMode,
      effect: request.effect,
      inputs,
      createdAt: now,
      updatedAt: now
    }

    addTask(task)
    broadcastTask(task)
    logLine(`task created ${task.id} mode=${task.mode} res=${task.resolution} dur=${task.duration}s`)

    const taskId = task.id
    enqueue(() => runTask(taskId))

    return { task, message: '任务已加入本地队列' }
  })

  ipcMain.handle('generation:cancel', async (_event, id: string): Promise<VideoTask> => {
    const task = findTask(id)
    if (!task) throw new Error('任务不存在')
    if (task.status === 'success' || task.status === 'failed' || task.status === 'canceled') return task

    canceledTasks.add(id)
    if (activeTaskId === id) {
      await bridge.interrupt()
    }
    const updated = updateTask(id, { status: 'canceled', error: '已取消', progress: 0, completedAt: Date.now() })
    if (updated) broadcastTask(updated)
    return updated ?? task
  })

  ipcMain.handle('tasks:remove', async (_event, id: string, deleteFile?: boolean) => {
    const task = findTask(id)
    if (!task) return
    if (task.status === 'queued' || task.status === 'preparing' || task.status === 'loading' || task.status === 'sampling' || task.status === 'decoding') {
      canceledTasks.add(id)
      if (activeTaskId === id) await bridge.interrupt()
    }
    removeTask(id, deleteFile)
    sendToRenderer('task:removed', id)
  })

  ipcMain.handle('tasks:saveAs', async (_event, id: string) => {
    const task = findTask(id)
    if (!task) throw new Error('任务不存在')
    if (!task.localVideoPath || !fs.existsSync(task.localVideoPath)) {
      throw new Error('成片文件不存在，可能已被移动或删除')
    }
    const ext = path.extname(task.localVideoPath) || '.mp4'
    const stamp = new Date(task.createdAt).toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const result = await dialog.showSaveDialog({
      title: '导出视频',
      defaultPath: `LTX-${stamp}-${task.id.slice(0, 6)}${ext}`,
      filters: [{ name: '视频文件', extensions: [ext.replace('.', '')] }]
    })
    if (result.canceled || !result.filePath) return { saved: false }
    fs.copyFileSync(task.localVideoPath, result.filePath)
    return { saved: true, path: result.filePath }
  })

  // ---- 提示词 ----
  ipcMain.handle('prompt:enhance', (_event, prompt: string, mode: GenerationRequest['mode']) =>
    enhancePromptLocal(prompt, mode)
  )

  // ---- 系统 ----
  ipcMain.handle('shell:openPath', async (_event, target: string) => {
    const dirs = getDirectories()
    const resolved =
      target === 'data'
        ? dirs.dataDir
        : target === 'output'
          ? dirs.outputDir
          : target === 'logs'
            ? dirs.logsDir
            : target
    if (!fs.existsSync(resolved)) throw new Error('文件夹不存在')
    const result = await shell.openPath(resolved)
    if (result) throw new Error(result)
  })

  ipcMain.handle('shell:showItem', async (_event, target: string) => {
    shell.showItemInFolder(target)
  })

  ipcMain.handle('clipboard:write', async (_event, text: string) => {
    clipboard.writeText(text)
  })

  ipcMain.handle('window:minimize', (event) => {
    getWindowForEvent(event)?.minimize()
  })

  ipcMain.handle('window:toggleMaximize', (event) => {
    const window = getWindowForEvent(event)
    if (!window) return false
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
    return window.isMaximized()
  })

  ipcMain.handle('window:close', (event) => {
    getWindowForEvent(event)?.close()
  })
}

// ------------------------------------------------------------
// 通知 / 托盘 / 窗口
// ------------------------------------------------------------

function notify(title: string, body: string): void {
  if (!Notification.isSupported()) return
  const iconPath = resolveResource('tray.png')
  const notification = new Notification({
    title,
    body,
    icon: iconPath && fs.existsSync(iconPath) ? iconPath : undefined,
    silent: false
  })
  notification.on('click', () => showMainWindow())
  notification.show()
}

function resolveResource(name: string): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'assets', name)
  return path.join(app.getAppPath(), 'resources', name)
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createTray(): void {
  const iconPath = resolveResource('tray.png')
  if (!fs.existsSync(iconPath)) return
  try {
    const image = nativeImage.createFromPath(iconPath)
    if (image.isEmpty()) return
    tray = new Tray(image.resize({ width: 20, height: 20 }))
    tray.setToolTip('LTX 本地导演台')
    const menu = Menu.buildFromTemplate([
      { label: '打开导演台', click: () => showMainWindow() },
      { label: '作品目录', click: () => void shell.openPath(getVideosDir()) },
      { label: '数据文件夹', click: () => void shell.openPath(getDataDir()) },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
    tray.setContextMenu(menu)
    tray.on('click', () => showMainWindow())
    tray.on('double-click', () => showMainWindow())
  } catch (error) {
    logLine(`tray creation failed: ${error instanceof Error ? error.message : error}`)
  }
}

function createWindow(): void {
  const iconPath = resolveResource('tray.png')
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    frame: false,
    backgroundColor: '#08090c',
    title: 'LTX 本地导演台',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false
    }
  })

  mainWindow.setMenuBarVisibility(false)

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('maximize', () => sendToRenderer('window:maximized', true))
  mainWindow.on('unmaximize', () => sendToRenderer('window:maximized', false))

  mainWindow.on('close', (event) => {
    if (isQuitting) return
    const active = getTasks().some((task) =>
      ['queued', 'preparing', 'loading', 'sampling', 'decoding'].includes(task.status)
    )
    if (active && tray) {
      event.preventDefault()
      mainWindow?.hide()
      if (!trayHintShown) {
        trayHintShown = true
        notify('导演台仍在后台渲染', '任务完成后会通知你，可从系统托盘重新打开。')
      }
    } else {
      isQuitting = true
      app.quit()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL()
    if (current && url !== current) {
      event.preventDefault()
      if (/^https?:\/\//i.test(url) && !url.startsWith('http://localhost')) void shell.openExternal(url)
    }
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logLine(`renderer gone: ${details.reason}`)
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// ------------------------------------------------------------
// 自定义协议：ltxasset://local/<相对路径>
// ------------------------------------------------------------

const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

function mimeForFile(file: string): string {
  return MIME_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream'
}

function registerProtocol(): void {
  protocol.handle('ltxasset', async (request) => {
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Range',
            'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length, Content-Type'
          }
        })
      }
      const url = new URL(request.url)
      if (url.hostname !== 'local') return new Response('Not found', { status: 404 })
      const relative = decodeURIComponent(url.pathname).replace(/^[/\\]+/, '')
      const root = path.resolve(getDataDir())
      const absolute = path.resolve(root, relative)
      if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
        return new Response('Forbidden', { status: 403 })
      }
      if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
        return new Response('Not found', { status: 404 })
      }
      const size = fs.statSync(absolute).size
      const type = mimeForFile(absolute)
      const range = request.headers.get('range')
      const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null
      if (match) {
        let start = match[1] ? Number(match[1]) : 0
        let end = match[2] ? Number(match[2]) : size - 1
        if (!match[1] && match[2]) {
          start = Math.max(0, size - Number(match[2]))
          end = size - 1
        }
        if (start >= size || start > end) {
          return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
        }
        end = Math.min(end, size - 1)
        return new Response(Readable.toWeb(fs.createReadStream(absolute, { start, end })) as ReadableStream, {
          status: 206,
          headers: {
            'Content-Type': type,
            'Content-Length': String(end - start + 1),
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length, Content-Type'
          }
        })
      }
      return new Response(Readable.toWeb(fs.createReadStream(absolute)) as ReadableStream, {
        status: 200,
        headers: {
          'Content-Type': type,
          'Content-Length': String(size),
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length, Content-Type'
        }
      })
    } catch (error) {
      logLine(`protocol error: ${error instanceof Error ? error.message : error}`)
      return new Response('Internal error', { status: 500 })
    }
  })
}

// ------------------------------------------------------------
// 启动
// ------------------------------------------------------------

// 便携模式：在 app ready 之前把 Electron 的 userData 指向 data/electron
applyPortableUserData()

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showMainWindow())

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.ltxdirector.local')
    initStore()
    configureBridge()
    initBridgeEvents()
    registerProtocol()
    registerIpc()
    createWindow()
    createTray()
    logLine(`app started version=${app.getVersion()} data=${getDataDir()} engine=${getSettings().engineRoot}`)

    if (getSettings().autoStartEngine) {
      void ensureEngine().catch((error) => logLine(`auto start failed: ${error instanceof Error ? error.message : error}`))
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
      else showMainWindow()
    })
  })

  app.on('before-quit', () => {
    isQuitting = true
    if (bridge.getStatus().state === 'ready' || bridge.getStatus().state === 'starting') {
      void bridge.stop()
    }
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

process.on('uncaughtException', (error) => {
  logLine(`uncaught: ${error.stack || error.message}`)
})
process.on('unhandledRejection', (reason) => {
  logLine(`unhandled rejection: ${reason instanceof Error ? reason.stack : String(reason)}`)
})

export { pathToLocalUrl }
