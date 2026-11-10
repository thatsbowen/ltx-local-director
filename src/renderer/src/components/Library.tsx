import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  AudioLines,
  ChevronDown,
  Clock3,
  Cpu,
  Film,
  FolderOpen,
  Loader2,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Timer,
  Wand2
} from 'lucide-react'
import clsx from 'clsx'
import type { GenerationMode, TaskStatus, VideoTask } from '@shared/types'
import { MODE_INFO, RESOLUTIONS } from '@shared/types'
import { isActiveTask, useAppStore } from '../store'
import { formatDuration } from '../lib/media'
import { formatRelativeTime } from '../lib/prompt'

type StatusFilter = 'all' | 'success' | 'active' | 'failed'
type SortKey = 'new' | 'old' | 'duration'

const STATUS_LABEL: Record<TaskStatus, string> = {
  queued: '排队中',
  preparing: '准备中',
  loading: '加载模型',
  sampling: '采样中',
  decoding: '解码中',
  success: '已完成',
  failed: '失败',
  canceled: '已取消'
}

const MODE_BADGE: Record<GenerationMode, string> = {
  text: 'T2V',
  image: 'I2V',
  firstlast: 'FLF',
  effect: 'FX'
}

const TONES = ['amber', 'blue', 'rose', 'violet', 'green']

function toneFor(id: string): string {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) % 997
  return TONES[hash % TONES.length]
}

function vramLabel(task: VideoTask): string {
  return task.peakVramMb ? `${(task.peakVramMb / 1024).toFixed(1)}G` : '—'
}

function TaskCard({ task, onOpen }: { task: VideoTask; onOpen: () => void }): React.JSX.Element {
  const mode = MODE_INFO[task.mode]
  const active = isActiveTask(task)
  return (
    <button type="button" className="work-card" onClick={onOpen}>
      <div className={`work-cover tone-${toneFor(task.id)}`}>
        <div className="cover-grid" />
        {task.localVideoUrl ? (
          <video
            src={task.localVideoUrl}
            muted
            preload="metadata"
            onLoadedMetadata={(event) => {
              try {
                event.currentTarget.currentTime = 0.15
              } catch {
                // Some codecs do not support seeking before load.
              }
            }}
          />
        ) : (
          <div className="cover-type">
            <span>{mode.subtitle}</span>
            <strong>{task.prompt.slice(0, 48) || mode.title}</strong>
          </div>
        )}
        <div className="cover-shade" />
        <span className={clsx('work-status', task.status)}>
          {task.status === 'success' ? null : active ? <Loader2 size={11} className="spin" /> : <AlertTriangle size={11} />}
          {STATUS_LABEL[task.status]}
        </span>
        <span className="work-duration">{formatDuration(task.duration)}</span>
        {task.status === 'success' && (
          <span className="play-orb">
            <Play size={18} fill="currentColor" />
          </span>
        )}
        {active && (
          <div className="work-progress"><span style={{ width: `${task.progress}%` }} /></div>
        )}
        <div className="cover-meta">
          <span>{MODE_BADGE[task.mode]}</span>
          <span>{RESOLUTIONS[task.resolution].label}</span>
          <span>{vramLabel(task)} VRAM</span>
        </div>
      </div>
      <div className="work-body">
        <div className="work-title-row">
          <strong>{task.prompt.split('\n')[0].slice(0, 34) || mode.title}</strong>
          <span>{formatRelativeTime(task.createdAt)}</span>
        </div>
        <div className="work-sub">
          <span className="work-mode">{mode.title}</span>
          <span className="dot" />
          <span>{task.duration} 秒</span>
          <span className="dot" />
          <span>{task.elapsedSec ? `${task.elapsedSec}s 渲染` : '本地'}</span>
          {task.audio && <AudioLines size={11} className="local-icon" />}
          {task.localVideoPath && <FolderOpen size={11} className="local-icon" />}
        </div>
      </div>
    </button>
  )
}

export function Library(): React.JSX.Element {
  const tasks = useAppStore((state) => state.tasks)
  const setView = useAppStore((state) => state.setView)
  const openTaskDetail = useAppStore((state) => state.openTaskDetail)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [mode, setMode] = useState<'all' | GenerationMode>('all')
  const [sort, setSort] = useState<SortKey>('new')

  const stats = useMemo(() => {
    const success = tasks.filter((task) => task.status === 'success')
    const vramSamples = success.filter((task) => task.peakVramMb)
    return {
      total: tasks.length,
      success: success.length,
      seconds: success.reduce((sum, task) => sum + task.duration, 0),
      avgVram: vramSamples.length
        ? vramSamples.reduce((sum, task) => sum + (task.peakVramMb ?? 0), 0) / vramSamples.length / 1024
        : 0,
      renderSec: success.reduce((sum, task) => sum + (task.elapsedSec ?? 0), 0)
    }
  }, [tasks])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const list = tasks.filter((task) => {
      if (status === 'success' && task.status !== 'success') return false
      if (status === 'active' && !isActiveTask(task)) return false
      if (status === 'failed' && task.status !== 'failed' && task.status !== 'canceled') return false
      if (mode !== 'all' && task.mode !== mode) return false
      if (query && !`${task.prompt} ${task.negativePrompt || ''}`.toLowerCase().includes(query)) return false
      return true
    })
    list.sort((a, b) => {
      if (sort === 'old') return a.createdAt - b.createdAt
      if (sort === 'duration') return b.duration - a.duration
      return b.createdAt - a.createdAt
    })
    return list
  }, [tasks, status, mode, search, sort])

  return (
    <div className="library-page">
      <div className="library-header">
        <div className="library-title">
          <span className="page-eyebrow"><Archive size={12} /> LOCAL ARCHIVE</span>
          <h1>作品库</h1>
          <p>每一次拍摄都保存在本机，不经过云端同步</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setView('studio')}>
          <Plus size={16} />
          新建作品
        </button>
      </div>

      <div className="stats-row">
        <div className="stat-card accent">
          <span className="stat-icon"><Film size={18} /></span>
          <div><strong>{stats.total}</strong><span>全部作品</span></div>
          <em>LOCAL</em>
        </div>
        <div className="stat-card">
          <span className="stat-icon"><Sparkles size={18} /></span>
          <div><strong>{stats.success}</strong><span>成功生成</span></div>
          <em>TAKES</em>
        </div>
        <div className="stat-card">
          <span className="stat-icon"><Timer size={18} /></span>
          <div><strong>{stats.seconds}<small>s</small></strong><span>成片总时长</span></div>
          <em>RUNTIME</em>
        </div>
        <div className="stat-card">
          <span className="stat-icon"><Cpu size={18} /></span>
          <div>
            <strong>{stats.avgVram ? stats.avgVram.toFixed(1) : '—'}<small>{stats.avgVram ? 'G' : ''}</small></strong>
            <span>平均峰值显存</span>
          </div>
          <em>VRAM</em>
        </div>
      </div>

      <div className="library-toolbar">
        <div className="search-box">
          <Search size={15} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索提示词…" />
        </div>
        <div className="status-tabs">
          {([
            ['all', '全部'],
            ['success', '已完成'],
            ['active', '生成中'],
            ['failed', '失败']
          ] as Array<[StatusFilter, string]>).map(([id, label]) => (
            <button key={id} type="button" className={clsx(status === id && 'active')} onClick={() => setStatus(id)}>
              {label}
              {id === 'active' && tasks.some(isActiveTask) && <i />}
            </button>
          ))}
        </div>
        <div className="toolbar-selects">
          <label className="select-wrap">
            <SlidersHorizontal size={13} />
            <select value={mode} onChange={(event) => setMode(event.target.value as 'all' | GenerationMode)}>
              <option value="all">全部模式</option>
              {(Object.keys(MODE_INFO) as GenerationMode[]).map((id) => (
                <option key={id} value={id}>{MODE_INFO[id].title}</option>
              ))}
            </select>
            <ChevronDown size={12} />
          </label>
          <label className="select-wrap">
            <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              <option value="new">最新优先</option>
              <option value="old">最早优先</option>
              <option value="duration">时长最长</option>
            </select>
            <ChevronDown size={12} />
          </label>
        </div>
      </div>

      <div className="library-summary">
        <span>{filtered.length} 个作品</span>
        <span className="summary-line" />
        <span>自动归档至 data / videos</span>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-library">
          <div className="empty-library-art">
            <span /><span /><span />
            <Film size={38} />
          </div>
          <h2>{tasks.length === 0 ? '这里还没有作品' : '没有符合条件的作品'}</h2>
          <p>{tasks.length === 0 ? '写下第一个想法，让 LTX 为你拍一段带声音的视频。' : '试试更换筛选条件，或搜索其他关键词。'}</p>
          {tasks.length === 0 && (
            <button type="button" className="btn-primary" onClick={() => setView('studio')}>
              <Wand2 size={15} />
              去创作
            </button>
          )}
        </div>
      ) : (
        <div className="works-grid">
          <button type="button" className="new-work-card" onClick={() => setView('studio')}>
            <span className="new-work-plus"><Plus size={22} /></span>
            <strong>新建作品</strong>
            <span>从一个想法开始</span>
          </button>
          {filtered.map((task) => (
            <TaskCard key={task.id} task={task} onOpen={() => openTaskDetail(task.id)} />
          ))}
        </div>
      )}

      <div className="library-footnote">
        <Clock3 size={12} />
        成片、素材与参数全部保存在本机 data 文件夹；卸载程序前记得备份。
      </div>
    </div>
  )
}
