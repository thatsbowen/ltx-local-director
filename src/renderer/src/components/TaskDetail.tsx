import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  AudioLines,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  Dices,
  Film,
  FolderOpen,
  Gauge,
  Loader2,
  MonitorPlay,
  RotateCcw,
  ShieldCheck,
  Trash2,
  X
} from 'lucide-react'
import clsx from 'clsx'
import type { VideoTask } from '@shared/types'
import { MODE_INFO, RESOLUTIONS } from '@shared/types'
import { isActiveTask, useAppStore, readableError } from '../store'
import { formatDuration, roleLabel } from '../lib/media'

interface TaskDetailProps {
  taskId: string
}

const STATUS_LABEL: Record<VideoTask['status'], string> = {
  queued: '排队中',
  preparing: '准备中',
  loading: '加载模型',
  sampling: '采样中',
  decoding: '解码中',
  success: '已完成',
  failed: '生成失败',
  canceled: '已取消'
}

function formatElapsed(seconds?: number): string {
  if (!seconds) return '—'
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  return `${minutes} 分 ${seconds % 60} 秒`
}

export function TaskDetail({ taskId }: TaskDetailProps): React.JSX.Element {
  const task = useAppStore((state) => state.tasks.find((item) => item.id === taskId))
  const close = useAppStore((state) => state.closeTaskDetail)
  const pushToast = useAppStore((state) => state.pushToast)
  const setReuseTask = useAppStore((state) => state.setReuseTask)
  const setView = useAppStore((state) => state.setView)
  const removeTask = useAppStore((state) => state.removeTask)

  const [confirming, setConfirming] = useState(false)
  const [deleteFile, setDeleteFile] = useState(true)
  const [busy, setBusy] = useState('')
  const [videoFailed, setVideoFailed] = useState(false)

  useEffect(() => {
    setVideoFailed(false)
  }, [taskId, task?.localVideoUrl])

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (confirming) setConfirming(false)
        else close()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [close, confirming])

  if (!task) {
    return (
      <div className="modal-backdrop" onClick={close}>
        <div className="detail-modal small-modal" onClick={(event) => event.stopPropagation()}>
          <p>作品已不存在</p>
          <button type="button" className="btn-secondary" onClick={close}>关闭</button>
        </div>
      </div>
    )
  }

  const videoSrc = task.localVideoUrl
  const mode = MODE_INFO[task.mode]
  const resolution = RESOLUTIONS[task.resolution]
  const active = isActiveTask(task)

  const saveAs = async (): Promise<void> => {
    setBusy('save')
    try {
      const result = await window.ltx.saveTaskAs(task.id)
      if (result.saved) pushToast({ kind: 'success', title: '视频已导出', message: result.path })
    } catch (error) {
      pushToast({ kind: 'error', title: '导出失败', message: readableError(error) })
    } finally {
      setBusy('')
    }
  }

  const cancel = async (): Promise<void> => {
    setBusy('cancel')
    try {
      await window.ltx.cancelTask(task.id)
      pushToast({ kind: 'info', title: '任务已取消' })
    } catch (error) {
      pushToast({ kind: 'error', title: '取消失败', message: readableError(error) })
    } finally {
      setBusy('')
    }
  }

  const reuse = (): void => {
    setReuseTask(task)
    setView('studio')
    close()
  }

  const confirmDelete = async (): Promise<void> => {
    setBusy('delete')
    try {
      await removeTask(task.id, deleteFile)
      close()
      setConfirming(false)
    } finally {
      setBusy('')
    }
  }

  const copyPrompt = (): void => {
    void window.ltx.copyText(task.prompt)
    pushToast({ kind: 'success', title: '提示词已复制' })
  }

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="detail-modal" onClick={(event) => event.stopPropagation()}>
        <div className="detail-topbar">
          <div className="detail-title">
            <span className={clsx('status-badge', task.status)}>
              {task.status === 'success' ? (
                <CheckCircle2 size={12} />
              ) : task.status === 'failed' ? (
                <AlertTriangle size={12} />
              ) : active ? (
                <Loader2 size={12} className="spin" />
              ) : (
                <Clock3 size={12} />
              )}
              {STATUS_LABEL[task.status]}
            </span>
            <span className="detail-id">#{task.id.slice(0, 8).toUpperCase()}</span>
          </div>
          <button type="button" className="modal-close" onClick={close}>
            <X size={18} />
          </button>
        </div>

        <div className="detail-body">
          <div className="detail-video-column">
            <div className="detail-video" style={{ aspectRatio: `${resolution.width} / ${resolution.height}` }}>
              {task.status === 'success' && videoSrc && !videoFailed ? (
                <video src={videoSrc} controls playsInline preload="metadata" onError={() => setVideoFailed(true)} />
              ) : task.status === 'success' ? (
                <div className="detail-placeholder expired">
                  <Clock3 size={30} />
                  <h3>成片文件读取失败</h3>
                  <p>文件可能已被移动或删除。记录仍在，可到数据目录检查 videos 文件夹。</p>
                </div>
              ) : task.status === 'failed' || task.status === 'canceled' ? (
                <div className="detail-placeholder error">
                  <AlertTriangle size={30} />
                  <h3>{STATUS_LABEL[task.status]}</h3>
                  <p>{task.error || '调整参数后可重新生成'}</p>
                </div>
              ) : (
                <div className="detail-placeholder processing">
                  <div className="detail-progress">
                    <strong>{task.progress}<small>%</small></strong>
                  </div>
                  <h3>{task.status === 'queued' ? '正在排队' : 'LTX 正在渲染'}</h3>
                  <p>生成完成后会自动归档到本地，可离开此页面。</p>
                </div>
              )}
            </div>

            <div className="detail-actions">
              {task.status === 'success' && videoSrc && (
                <button type="button" className="btn-primary" onClick={() => void saveAs()} disabled={busy === 'save'}>
                  {busy === 'save' ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
                  导出视频
                </button>
              )}
              {task.localVideoPath && (
                <button type="button" className="btn-secondary" onClick={() => void window.ltx.showItemInFolder(task.localVideoPath as string)}>
                  <FolderOpen size={15} />
                  打开文件夹
                </button>
              )}
              {active && (
                <button type="button" className="btn-secondary" onClick={() => void cancel()} disabled={busy === 'cancel'}>
                  {busy === 'cancel' ? <Loader2 size={15} className="spin" /> : <X size={15} />}
                  取消任务
                </button>
              )}
              <button type="button" className="btn-secondary" onClick={reuse}>
                <RotateCcw size={15} />
                复用参数
              </button>
              <button type="button" className="btn-danger-ghost" onClick={() => setConfirming(true)}>
                <Trash2 size={15} />
                删除
              </button>
            </div>

            {task.inputs.length > 0 && (
              <div className="detail-inputs">
                <div className="detail-section-title">
                  <span>输入素材</span>
                  <em>{task.inputs.length} 项</em>
                </div>
                <div className="detail-input-strip">
                  {task.inputs.map((input) => (
                    <div className="detail-input-card" key={`${input.assetId}-${input.role}`}>
                      {input.kind === 'image' ? (
                        <img src={input.url} alt={input.name} />
                      ) : (
                        <span className={`input-kind ${input.kind}`}>
                          {input.kind === 'video' ? <Film size={18} /> : <AudioLines size={18} />}
                        </span>
                      )}
                      <div>
                        <strong>{input.name}</strong>
                        <span>{roleLabel(input.role)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <aside className="detail-info-column">
            <div className="detail-heading">
              <span className="page-eyebrow">{mode.subtitle}</span>
              <h2>{task.prompt.split('\n')[0].slice(0, 32) || mode.title}</h2>
              <p><CalendarDays size={11} /> {new Date(task.createdAt).toLocaleString('zh-CN')}</p>
            </div>

            <div className="detail-facts">
              <div><span>模式</span><strong>{mode.title}</strong></div>
              <div><span>分辨率</span><strong>{resolution.width}×{resolution.height}</strong></div>
              <div><span>帧率</span><strong>{task.fps} fps</strong></div>
              <div><span>时长</span><strong>{task.duration} 秒</strong></div>
              <div><span>采样步数</span><strong>{task.steps}</strong></div>
              <div><span>种子</span><strong className="mono">{task.seed}</strong></div>
              <div><span>实际耗时</span><strong>{formatElapsed(task.elapsedSec)}</strong></div>
              <div><span>峰值显存</span><strong>{task.peakVramMb ? `${(task.peakVramMb / 1024).toFixed(2)} GB` : '—'}</strong></div>
            </div>

            <div className="detail-badges">
              <span><AudioLines size={11} /> {task.audio ? (task.audioMode === 'dialogue' ? '含对白音频' : '环境声') : '无声'}</span>
              <span><ShieldCheck size={11} /> 全程本地</span>
              {task.effect && <span><MonitorPlay size={11} /> {task.effect === 'canny' ? '线稿特效' : '景深特效'}</span>}
              {task.localVideoPath && <span><Download size={11} /> 已本地归档</span>}
            </div>

            <div className="detail-section-title">
              <span>提示词</span>
              <button type="button" onClick={copyPrompt}><Copy size={12} /> 复制</button>
            </div>
            <div className="detail-prompt">{task.prompt}</div>
            {task.negativePrompt && (
              <>
                <div className="detail-section-title"><span>负向约束</span></div>
                <div className="detail-negative">{task.negativePrompt}</div>
              </>
            )}

            <div className="detail-note">
              <Gauge size={12} />
              耗时与显存来自本机采样，可作为调整分辨率与时长的参考。
            </div>

            <button type="button" className="docs-link" onClick={reuse}>
              <Dices size={12} />
              用相同参数再拍一条
            </button>
          </aside>
        </div>
      </div>

      {confirming && (
        <div className="confirm-overlay" onClick={(event) => event.stopPropagation()}>
          <div className="confirm-box">
            <span className="confirm-icon"><Trash2 size={20} /></span>
            <h3>删除这个作品？</h3>
            <p>历史记录会从作品库移除。此操作不可撤销。</p>
            <button
              type="button"
              className={clsx('check-row compact-check', deleteFile && 'active')}
              onClick={() => setDeleteFile((value) => !value)}
            >
              <span className={clsx('check-box', deleteFile && 'checked')}>{deleteFile && <CheckCircle2 size={11} />}</span>
              同时删除本地视频文件
            </button>
            <div className="confirm-actions">
              <button type="button" className="btn-secondary" onClick={() => setConfirming(false)}>取消</button>
              <button type="button" className="btn-danger" onClick={() => void confirmDelete()} disabled={busy === 'delete'}>
                {busy === 'delete' ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
