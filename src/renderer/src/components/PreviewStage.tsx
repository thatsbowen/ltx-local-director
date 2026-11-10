import { useEffect, useMemo, useState } from 'react'
import {
  AudioLines,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  Film,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  X
} from 'lucide-react'
import clsx from 'clsx'
import type { GenerationMode, TaskStageEvent, VideoTask } from '@shared/types'
import { MODE_INFO, RESOLUTIONS } from '@shared/types'
import { formatDuration } from '../lib/media'
import { formatRelativeTime } from '../lib/prompt'

interface PreviewStageProps {
  task?: VideoTask
  tasks: VideoTask[]
  mode: GenerationMode
  prompt: string
  stage: TaskStageEvent | null
  generating: boolean
  onCancel: () => void
  onSelectTask: (id: string) => void
  onOpenLibrary: () => void
  onRetry: () => void
  onOpenDetail: (id: string) => void
}

const ACTIVE: VideoTask['status'][] = ['queued', 'preparing', 'loading', 'sampling', 'decoding']

function isActive(task?: VideoTask): boolean {
  return Boolean(task && ACTIVE.includes(task.status))
}

function statusText(task?: VideoTask): string {
  if (!task) return 'STANDBY'
  if (task.status === 'queued') return 'QUEUED'
  if (ACTIVE.includes(task.status)) return 'RENDERING'
  if (task.status === 'success') return 'TAKE READY'
  if (task.status === 'failed') return 'TAKE FAILED'
  return 'CANCELLED'
}

function stageLabel(task?: VideoTask): string {
  if (!task) return '等待新的镜头'
  if (task.status === 'queued') return '任务排队中'
  if (task.status === 'preparing') return '检查引擎与模型'
  if (task.status === 'loading') return '正在加载模型'
  if (task.status === 'sampling') return '正在采样画面与声音'
  if (task.status === 'decoding') return '正在解码音视频'
  if (task.status === 'success') return '成片已就绪'
  if (task.status === 'failed') return '这次拍摄没有完成'
  return '任务已取消'
}

function modeBadge(mode: GenerationMode): string {
  if (mode === 'text') return 'T2V'
  if (mode === 'image') return 'I2V'
  if (mode === 'firstlast') return 'FLF'
  return 'FX'
}

export function PreviewStage(props: PreviewStageProps): React.JSX.Element {
  const { task } = props
  const [now, setNow] = useState(Date.now())
  const [videoFailed, setVideoFailed] = useState(false)
  const active = isActive(task)

  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active])

  const elapsed = task && active ? Math.max(0, Math.floor((now - task.createdAt) / 1000)) : 0
  const videoSrc = task?.localVideoUrl

  useEffect(() => {
    setVideoFailed(false)
  }, [task?.id, videoSrc])

  const resolution = task ? RESOLUTIONS[task.resolution] : RESOLUTIONS['960x544']
  const cssRatio = `${resolution.width} / ${resolution.height}`
  const portrait = resolution.height > resolution.width
  const portraitWidth = portrait ? 320 : undefined
  const modeInfo = MODE_INFO[task?.mode || props.mode]

  const recent = useMemo(() => props.tasks.slice(0, 5), [props.tasks])

  return (
    <section className="preview-column">
      <div className="preview-heading">
        <div>
          <span className="panel-kicker">MONITOR</span>
          <h2>预览监视器</h2>
        </div>
        <div className="preview-heading-right">
          <span className={clsx('take-status', task?.status || 'idle')}>
            <i />
            {statusText(task)}
          </span>
          <button type="button" className="text-link" onClick={props.onOpenLibrary}>
            作品库 <ExternalLink size={12} />
          </button>
        </div>
      </div>

      <div className="monitor-shell">
        <div className="monitor-topline">
          <span>LTX-2.3 / LOCAL</span>
          <span>{task?.resolution || '960x544'} · {task?.duration || 4}s · SEED {task?.seed ?? '—'}</span>
          <span className={clsx('audio-tag', task && !task.audio && 'muted')}>
            <AudioLines size={11} />
            {task && !task.audio ? 'MUTE' : 'AUDIO'}
          </span>
        </div>

        <div
          className={clsx('monitor-viewport', task?.status)}
          style={{ aspectRatio: cssRatio, maxWidth: portraitWidth, marginInline: portraitWidth ? 'auto' : undefined }}
        >
          {task?.status === 'success' && videoSrc && !videoFailed ? (
            <div className="video-wrap">
              <video src={videoSrc} controls playsInline preload="metadata" onError={() => setVideoFailed(true)} />
              <div className="video-vignette" />
              <div className="video-meta">
                <span>{formatDuration(task.duration)}</span>
                <span>{task.resolution}</span>
                <button type="button" onClick={() => props.onOpenDetail(task.id)}>
                  详情
                </button>
              </div>
            </div>
          ) : active || props.generating ? (
            <div className="render-state">
              <div className="render-rings">
                <span />
                <span />
                <span />
                <div className="render-core">
                  {props.generating && !task ? <Loader2 size={26} className="spin" /> : <strong>{task?.progress || 4}<small>%</small></strong>}
                </div>
              </div>
              <div className="render-copy">
                <span className="render-kicker">
                  <i />
                  LTX IS RENDERING
                </span>
                <h3>{props.stage?.message || stageLabel(task)}</h3>
                <p>
                  {task
                    ? `已用时 ${formatDuration(elapsed)} · 全程本地 GPU，可切到后台`
                    : '正在建立任务，请稍候'}
                </p>
              </div>
              <div className="render-progress">
                <span style={{ width: `${Math.max(props.generating ? 4 : task?.progress || 4, 4)}%` }} />
              </div>
              <div className="render-steps">
                <span className="done"><CheckCircle2 size={12} /> 加入队列</span>
                <span className={clsx(task?.status !== 'queued' ? 'done' : 'active')}>
                  <Loader2 size={11} /> 加载模型
                </span>
                <span className={clsx(task?.status === 'decoding' || task?.status === 'success' ? 'done' : '')}>
                  <AudioLines size={11} /> 采样与音频
                </span>
                <span className={clsx(task?.status === 'success' ? 'done' : '')}><Download size={11} /> 本地归档</span>
              </div>
              {active && (
                <button type="button" className="cancel-render" onClick={props.onCancel}>
                  <X size={13} />
                  取消任务
                </button>
              )}
            </div>
          ) : task?.status === 'failed' || task?.status === 'canceled' ? (
            <div className="failed-state">
              <span className="failed-icon">
                <Pause size={26} />
              </span>
              <span className="render-kicker">TAKE INTERRUPTED</span>
              <h3>{task.status === 'failed' ? '这次拍摄没有完成' : '任务已取消'}</h3>
              <p>{task.error || '可以调整描述或素材后重试。'}</p>
              <div className="failed-actions">
                <button type="button" className="btn-primary small" onClick={props.onRetry}>
                  <RotateCcw size={14} />
                  重新生成
                </button>
                <button type="button" className="btn-secondary small" onClick={() => props.onOpenDetail(task.id)}>
                  查看参数
                </button>
              </div>
            </div>
          ) : task?.status === 'success' ? (
            <div className="failed-state">
              <span className="failed-icon warning">
                <Clock3 size={26} />
              </span>
              <span className="render-kicker">FILE MISSING</span>
              <h3>成片文件读取失败</h3>
              <p>文件可能已被移动或删除。作品记录仍在，可到作品库查看路径。</p>
              <button type="button" className="btn-primary small" onClick={() => props.onOpenDetail(task.id)}>
                查看详情
              </button>
            </div>
          ) : (
            <div className="empty-stage">
              <div className="aperture">
                <span />
                <span />
                <span />
                <span />
                <div className="aperture-core">
                  <Film size={28} />
                </div>
              </div>
              <div className="empty-copy">
                <span className="empty-kicker">
                  <Sparkles size={12} />
                  {modeInfo.subtitle}
                </span>
                <h3>{modeInfo.title}，从脑海到画面</h3>
                <p>{props.prompt ? props.prompt.slice(0, 92) + (props.prompt.length > 92 ? '…' : '') : modeInfo.description}</p>
              </div>
              <div className="frame-corners">
                <span /><span /><span /><span />
              </div>
              <div className="stage-ready">
                <i />
                准备就绪
              </div>
            </div>
          )}
        </div>

        <div className="monitor-footer">
          <div className="monitor-meta">
            <span><Play size={11} /> {formatDuration(task?.duration || 4)}</span>
            <span>{resolution.label}</span>
            <span>{task ? formatRelativeTime(task.createdAt) : '尚未生成'}</span>
          </div>
          <div className="monitor-sound">
            <AudioLines size={12} />
            <span className="mini-wave">
              {Array.from({ length: 12 }).map((_, index) => <i key={index} style={{ height: `${4 + ((index * 5) % 10)}px` }} />)}
            </span>
            原生同步声音
          </div>
        </div>
      </div>

      <div className="recent-strip">
        <div className="recent-head">
          <span>最近镜头</span>
          <em>{props.tasks.length} 个作品</em>
        </div>
        <div className="recent-list">
          {recent.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={clsx('recent-card', task?.id === item.id && 'active')}
              onClick={() => props.onSelectTask(item.id)}
            >
              <div className={`recent-thumb tone-${index % 5}`}>
                {item.localVideoUrl ? <video src={item.localVideoUrl} muted preload="metadata" /> : <span>{modeBadge(item.mode)}</span>}
                <i className={clsx('thumb-status', item.status)} />
              </div>
              <div className="recent-info">
                <strong>{item.prompt.slice(0, 15) || '未命名镜头'}</strong>
                <span>{formatDuration(item.duration)} · {item.resolution}</span>
              </div>
            </button>
          ))}
          <button type="button" className="recent-all" onClick={props.onOpenLibrary}>
            <span>全部</span>
            <em>作品 →</em>
          </button>
        </div>
      </div>
    </section>
  )
}
