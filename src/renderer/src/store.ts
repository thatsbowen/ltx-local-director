import { create } from 'zustand'
import type {
  BootstrapData,
  DirectoryInfo,
  EngineLogLine,
  EngineStatus,
  GenerationRequest,
  HardwareInfo,
  LocalAsset,
  LtxSettings,
  ModelScanResult,
  TaskStageEvent,
  VideoTask
} from '@shared/types'
import { probeMedia } from './lib/media'

export type View = 'studio' | 'library' | 'academy' | 'settings' | 'reward'

export interface ToastMessage {
  id: string
  kind: 'success' | 'error' | 'info'
  title: string
  message?: string
}

const ACTIVE_STATUSES: VideoTask['status'][] = ['queued', 'preparing', 'loading', 'sampling', 'decoding']

export function isActiveTask(task: VideoTask): boolean {
  return ACTIVE_STATUSES.includes(task.status)
}

interface AppState {
  ready: boolean
  bootError: string
  view: View
  settings: LtxSettings | null
  tasks: VideoTask[]
  assets: LocalAsset[]
  dirs: DirectoryInfo | null
  version: string
  hardware: HardwareInfo | null
  engine: EngineStatus
  models: ModelScanResult | null
  engineLogs: EngineLogLine[]
  onboardingOpen: boolean
  generating: boolean
  stage: TaskStageEvent | null
  activeTaskId: string | null
  detailTaskId: string | null
  reuseTask: VideoTask | null
  toasts: ToastMessage[]

  init: () => Promise<void>
  setView: (view: View) => void
  openOnboarding: () => void
  closeOnboarding: () => void
  setGenerating: (value: boolean) => void
  setStage: (event: TaskStageEvent | null) => void
  setActiveTask: (id: string | null) => void
  openTaskDetail: (id: string) => void
  closeTaskDetail: () => void
  setReuseTask: (task: VideoTask | null) => void

  saveSettings: (input: Partial<LtxSettings>) => Promise<LtxSettings>
  refreshHardware: () => Promise<HardwareInfo | null>
  refreshModels: () => Promise<ModelScanResult | null>
  startEngine: () => Promise<EngineStatus>
  stopEngine: () => Promise<EngineStatus>
  applyEngine: (status: EngineStatus) => void

  importPicked: (kind: LocalAsset['kind'], multiple?: boolean) => Promise<LocalAsset[]>
  importPaths: (paths: string[]) => Promise<LocalAsset[]>
  removeAsset: (id: string) => Promise<void>

  createTask: (request: GenerationRequest) => Promise<VideoTask>
  applyTask: (task: VideoTask) => void
  applyTaskRemoved: (id: string) => void
  removeTask: (id: string, deleteFile?: boolean) => Promise<void>

  pushToast: (toast: Omit<ToastMessage, 'id'>) => void
  dismissToast: (id: string) => void
}

export function readableError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .replace(/^Uncaught\s*/i, '')
}

function makeToastId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

async function probeAndUpdate(asset: LocalAsset): Promise<LocalAsset> {
  try {
    const meta = await probeMedia(asset.url, asset.kind)
    if (!meta) return asset
    return await window.ltx.updateAssetMeta({
      id: asset.id,
      width: meta.width,
      height: meta.height,
      duration: meta.duration
    })
  } catch {
    return asset
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  bootError: '',
  view: 'studio',
  settings: null,
  tasks: [],
  assets: [],
  dirs: null,
  version: '',
  hardware: null,
  engine: { state: 'stopped', port: 0, message: '未启动' },
  models: null,
  engineLogs: [],
  onboardingOpen: false,
  generating: false,
  stage: null,
  activeTaskId: null,
  detailTaskId: null,
  reuseTask: null,
  toasts: [],

  init: async () => {
    try {
      const boot: BootstrapData = await window.ltx.getBootstrap()
      set({
        ready: true,
        settings: boot.settings,
        tasks: boot.tasks,
        assets: boot.assets,
        dirs: boot.dirs,
        version: boot.version,
        hardware: boot.hardware,
        engine: boot.engine,
        models: boot.models,
        onboardingOpen: !boot.settings.onboardingDone,
        generating: boot.tasks.some(isActiveTask)
      })

      window.ltx.onTaskUpdate((task) => {
        const existed = get().tasks.find((item) => item.id === task.id)
        get().applyTask(task)
        if (task.status === 'success' && existed && existed.status !== 'success') {
          get().pushToast({
            kind: 'success',
            title: '视频生成完成',
            message: `${task.duration} 秒 · ${task.resolution}${task.elapsedSec ? ` · ${task.elapsedSec}s` : ''}`
          })
        }
        if (task.status === 'failed' && existed && existed.status !== 'failed') {
          get().pushToast({ kind: 'error', title: '视频生成失败', message: task.error })
        }
      })

      window.ltx.onTaskRemoved((id) => get().applyTaskRemoved(id))
      window.ltx.onTaskStage((event) => get().setStage(event))
      window.ltx.onEngineStatus((status) => get().applyEngine(status))
      window.ltx.onEngineLog((line) => {
        set((state) => ({ engineLogs: [...state.engineLogs.slice(-199), line] }))
      })
    } catch (error) {
      set({ ready: true, bootError: readableError(error) })
    }
  },

  setView: (view) => set({ view }),

  openOnboarding: () => set({ onboardingOpen: true }),
  closeOnboarding: () => set({ onboardingOpen: false }),

  setGenerating: (value) => set({ generating: value }),
  setStage: (event) => set({ stage: event }),
  setActiveTask: (id) => set({ activeTaskId: id }),

  openTaskDetail: (id) => set({ detailTaskId: id }),
  closeTaskDetail: () => set({ detailTaskId: null }),
  setReuseTask: (task) => set({ reuseTask: task }),

  saveSettings: async (input) => {
    const settings = await window.ltx.saveSettings(input)
    set({ settings })
    return settings
  },

  refreshHardware: async () => {
    try {
      const hardware = await window.ltx.detectHardware()
      set({ hardware })
      return hardware
    } catch (error) {
      get().pushToast({ kind: 'error', title: '硬件检测失败', message: readableError(error) })
      return null
    }
  },

  refreshModels: async () => {
    try {
      const models = await window.ltx.scanModels()
      set({ models })
      return models
    } catch (error) {
      get().pushToast({ kind: 'error', title: '模型扫描失败', message: readableError(error) })
      return null
    }
  },

  startEngine: async () => {
    set({ engine: { ...get().engine, state: 'starting', message: '正在启动引擎…' } })
    try {
      const status = await window.ltx.startEngine()
      set({ engine: status })
      return status
    } catch (error) {
      const status: EngineStatus = {
        state: 'error',
        port: get().engine.port,
        message: readableError(error)
      }
      set({ engine: status })
      return status
    }
  },

  stopEngine: async () => {
    const status = await window.ltx.stopEngine()
    set({ engine: status })
    return status
  },

  applyEngine: (status) => set({ engine: status }),

  importPicked: async (kind, multiple = false) => {
    try {
      const imported = await window.ltx.pickFiles({ kind, multiple })
      if (!imported.length) return []
      const probed = await Promise.all(imported.map((asset) => probeAndUpdate(asset)))
      set((state) => ({
        assets: [...probed, ...state.assets.filter((item) => !probed.some((p) => p.id === item.id))]
      }))
      return probed
    } catch (error) {
      get().pushToast({ kind: 'error', title: '素材导入失败', message: readableError(error) })
      return []
    }
  },

  importPaths: async (paths) => {
    if (!paths.length) return []
    try {
      const imported = await window.ltx.importFiles(paths)
      if (!imported.length) {
        get().pushToast({ kind: 'error', title: '素材导入失败', message: '文件格式不受支持，或文件超过大小限制' })
        return []
      }
      const probed = await Promise.all(imported.map((asset) => probeAndUpdate(asset)))
      set((state) => ({
        assets: [...probed, ...state.assets.filter((item) => !probed.some((p) => p.id === item.id))]
      }))
      return probed
    } catch (error) {
      get().pushToast({ kind: 'error', title: '素材导入失败', message: readableError(error) })
      return []
    }
  },

  removeAsset: async (id) => {
    try {
      await window.ltx.removeAsset(id)
      set((state) => ({ assets: state.assets.filter((asset) => asset.id !== id) }))
    } catch (error) {
      get().pushToast({ kind: 'error', title: '删除素材失败', message: readableError(error) })
    }
  },

  createTask: async (request) => {
    set({ generating: true, stage: { stage: 'preparing', message: '正在检查引擎与模型…', progress: 1 } })
    try {
      const result = await window.ltx.createTask(request)
      set((state) => ({
        activeTaskId: result.task.id,
        tasks: [result.task, ...state.tasks.filter((task) => task.id !== result.task.id)]
      }))
      get().pushToast({ kind: 'success', title: '已加入本地渲染队列', message: '完成后会通知你，可切到后台' })
      return result.task
    } catch (error) {
      set({ generating: false, stage: null })
      get().pushToast({ kind: 'error', title: '提交失败', message: readableError(error) })
      throw error
    }
  },

  applyTask: (task) => {
    set((state) => {
      const exists = state.tasks.some((item) => item.id === task.id)
      const tasks = exists
        ? state.tasks.map((item) => (item.id === task.id ? task : item))
        : [task, ...state.tasks]
      tasks.sort((a, b) => b.createdAt - a.createdAt)
      const generating = tasks.some(isActiveTask)
      return {
        tasks,
        generating,
        activeTaskId: state.activeTaskId ?? task.id,
        stage: generating ? state.stage : null
      }
    })
  },

  applyTaskRemoved: (id) => {
    set((state) => {
      const tasks = state.tasks.filter((task) => task.id !== id)
      return {
        tasks,
        generating: tasks.some(isActiveTask),
        activeTaskId: state.activeTaskId === id ? null : state.activeTaskId,
        detailTaskId: state.detailTaskId === id ? null : state.detailTaskId
      }
    })
  },

  removeTask: async (id, deleteFile = false) => {
    try {
      await window.ltx.removeTask(id, deleteFile)
      get().applyTaskRemoved(id)
      get().pushToast({ kind: 'info', title: '作品已从历史中移除' })
    } catch (error) {
      get().pushToast({ kind: 'error', title: '删除失败', message: readableError(error) })
    }
  },

  pushToast: (toast) => {
    const id = makeToastId()
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }))
    window.setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }))
    }, toast.kind === 'error' ? 6000 : 3800)
  },

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }))
}))
