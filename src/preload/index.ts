import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { EngineLogLine, EngineStatus, LtxApi, TaskStageEvent, VideoTask } from '@shared/types'

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: LtxApi = {
  getBootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  saveSettings: (input) => ipcRenderer.invoke('settings:save', input),

  detectHardware: () => ipcRenderer.invoke('hardware:detect'),

  startEngine: () => ipcRenderer.invoke('engine:start'),
  stopEngine: () => ipcRenderer.invoke('engine:stop'),
  getEngineStatus: () => ipcRenderer.invoke('engine:status'),
  onEngineStatus: (listener: (status: EngineStatus) => void) => subscribe('engine:status', listener),
  onEngineLog: (listener: (line: EngineLogLine) => void) => subscribe('engine:log', listener),

  scanModels: () => ipcRenderer.invoke('models:scan'),
  pickModelRoot: () => ipcRenderer.invoke('models:pickRoot'),

  pickFiles: (input) => ipcRenderer.invoke('files:pick', input),
  importFiles: (paths) => ipcRenderer.invoke('files:import', paths),
  updateAssetMeta: (input) => ipcRenderer.invoke('files:updateMeta', input),
  removeAsset: (id) => ipcRenderer.invoke('files:remove', id),

  createTask: (input) => ipcRenderer.invoke('generation:create', input),
  cancelTask: (id) => ipcRenderer.invoke('generation:cancel', id),
  removeTask: (id, deleteFile) => ipcRenderer.invoke('tasks:remove', id, deleteFile),
  saveTaskAs: (id) => ipcRenderer.invoke('tasks:saveAs', id),

  enhancePrompt: (prompt, mode) => ipcRenderer.invoke('prompt:enhance', prompt, mode),

  openPath: (target) => ipcRenderer.invoke('shell:openPath', target),
  showItemInFolder: (target) => ipcRenderer.invoke('shell:showItem', target),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),

  windowMinimize: () => {
    void ipcRenderer.invoke('window:minimize')
  },
  windowToggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
  windowClose: () => {
    void ipcRenderer.invoke('window:close')
  },

  getPathForFile: (file) => webUtils.getPathForFile(file),

  onTaskUpdate: (listener: (task: VideoTask) => void) => subscribe('task:update', listener),
  onTaskRemoved: (listener: (id: string) => void) => subscribe('task:removed', listener),
  onTaskStage: (listener: (event: TaskStageEvent) => void) => subscribe('task:stage', listener),
  onWindowState: (listener: (maximized: boolean) => void) => subscribe('window:maximized', listener)
}

contextBridge.exposeInMainWorld('ltx', api)
