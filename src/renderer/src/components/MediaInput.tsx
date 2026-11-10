import { useState } from 'react'
import { Film, ImagePlus, Trash2, UploadCloud, Video, X } from 'lucide-react'
import clsx from 'clsx'
import type { AssetRef, GenerationMode, MediaKind, MediaRole } from '@shared/types'
import { formatBytes } from '../lib/prompt'
import { formatDuration } from '../lib/media'

interface MediaInputProps {
  mode: GenerationMode
  inputs: AssetRef[]
  onPick: (kind: MediaKind, role?: MediaRole) => void
  onDropPaths: (paths: string[], role?: MediaRole) => void
  onRemove: (assetId: string) => void
}

function findInput(inputs: AssetRef[], role: MediaRole): AssetRef | undefined {
  return inputs.find((input) => input.role === role)
}

function DropZone(props: {
  className?: string
  children: React.ReactNode
  onDropPaths: (paths: string[]) => void
  disabled?: boolean
}): React.JSX.Element {
  const [over, setOver] = useState(false)
  return (
    <div
      className={clsx('drop-zone', props.className, over && 'over', props.disabled && 'disabled')}
      onDragOver={(event) => {
        event.preventDefault()
        if (!props.disabled) setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setOver(false)
        if (props.disabled) return
        const paths = Array.from(event.dataTransfer.files)
          .map((file) => window.ltx.getPathForFile(file))
          .filter(Boolean)
        if (paths.length) props.onDropPaths(paths)
      }}
    >
      {props.children}
    </div>
  )
}

function FrameSlot(props: {
  label: string
  hint: string
  input?: AssetRef
  onPick: () => void
  onRemove: () => void
  onDropPaths: (paths: string[]) => void
}): React.JSX.Element {
  return (
    <DropZone className={clsx('frame-slot', props.input && 'filled')} onDropPaths={props.onDropPaths}>
      {props.input ? (
        <>
          <img src={props.input.asset.url} alt={props.label} />
          <div className="frame-overlay">
            <span>{props.label}</span>
            <button type="button" onClick={props.onRemove} title="移除">
              <X size={13} />
            </button>
          </div>
          <div className="frame-file">
            <span>{props.input.asset.name}</span>
            <em>{formatBytes(props.input.asset.size)}</em>
          </div>
        </>
      ) : (
        <button type="button" className="frame-empty" onClick={props.onPick}>
          <span className="upload-icon">
            <ImagePlus size={21} />
          </span>
          <strong>{props.label}</strong>
          <span>{props.hint}</span>
          <em>点击选择 · 或拖入图片</em>
        </button>
      )}
    </DropZone>
  )
}

export function MediaInput({ mode, inputs, onPick, onDropPaths, onRemove }: MediaInputProps): React.JSX.Element {
  const first = findInput(inputs, 'first_frame')
  const last = findInput(inputs, 'last_frame')
  const video = findInput(inputs, 'reference_video')

  if (mode === 'text') {
    return (
      <section className="panel media-panel">
        <div className="panel-heading compact">
          <div>
            <span className="panel-kicker">INPUT</span>
            <h2>画面素材</h2>
          </div>
          <span className="optional-pill">无需上传</span>
        </div>
        <div className="text-mode-note">
          <span className="note-icon">
            <Film size={20} />
          </span>
          <div>
            <strong>纯文字生成</strong>
            <p>LTX-2 会从描述中构建主体、运动、场景与声音。第一次创作建议先选一个灵感模板。</p>
          </div>
        </div>
      </section>
    )
  }

  if (mode === 'image') {
    return (
      <section className="panel media-panel">
        <div className="panel-heading compact">
          <div>
            <span className="panel-kicker">START FRAME</span>
            <h2>起始画面</h2>
          </div>
          <span className="count-pill">{first ? '1 / 1' : '0 / 1'}</span>
        </div>
        <FrameSlot
          label="起始帧"
          hint="图片会作为视频第一帧"
          input={first}
          onPick={() => onPick('image', 'first_frame')}
          onRemove={() => first && onRemove(first.asset.id)}
          onDropPaths={(paths) => onDropPaths(paths, 'first_frame')}
        />
        <p className="media-hint">
          建议主体清晰、构图留出运动空间。图片会按目标分辨率居中裁切，宽高比 0.4–2.5。
        </p>
      </section>
    )
  }

  if (mode === 'firstlast') {
    return (
      <section className="panel media-panel">
        <div className="panel-heading compact">
          <div>
            <span className="panel-kicker">KEY FRAMES</span>
            <h2>首尾帧</h2>
          </div>
          <span className="count-pill">{(first ? 1 : 0) + (last ? 1 : 0)} / 2</span>
        </div>
        <div className="firstlast-grid">
          <FrameSlot
            label="首帧"
            hint="故事开始的样子"
            input={first}
            onPick={() => onPick('image', 'first_frame')}
            onRemove={() => first && onRemove(first.asset.id)}
            onDropPaths={(paths) => onDropPaths(paths, 'first_frame')}
          />
          <div className="frame-connector">
            <span />
            <em>运动</em>
            <span />
          </div>
          <FrameSlot
            label="尾帧"
            hint="故事结束的样子"
            input={last}
            onPick={() => onPick('image', 'last_frame')}
            onRemove={() => last && onRemove(last.asset.id)}
            onDropPaths={(paths) => onDropPaths(paths, 'last_frame')}
          />
        </div>
        <p className="media-hint">
          首尾帧的主体、服装与场景尽量一致。文字里描述中间发生了什么；主体差异过大会产生变形。
        </p>
      </section>
    )
  }

  return (
    <section className="panel media-panel">
      <div className="panel-heading compact">
        <div>
          <span className="panel-kicker">SOURCE VIDEO</span>
          <h2>输入视频</h2>
        </div>
        <span className="count-pill">{video ? '1 / 1' : '0 / 1'}</span>
      </div>

      <DropZone className={clsx('video-slot', video && 'filled')} onDropPaths={(paths) => onDropPaths(paths, 'reference_video')}>
        {video ? (
          <div className="video-slot-inner">
            <video src={video.asset.url} muted controls preload="metadata" />
            <div className="video-slot-meta">
              <span>
                <Video size={13} />
                {video.asset.name}
              </span>
              <em>{formatDuration(video.asset.duration)} · {formatBytes(video.asset.size)}</em>
              <button type="button" onClick={() => onRemove(video.asset.id)} title="移除">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="video-empty" onClick={() => onPick('video', 'reference_video')}>
            <span className="upload-icon">
              <UploadCloud size={22} />
            </span>
            <strong>上传要转换的视频</strong>
            <span>MP4 / MOV / WEBM · 1–10 秒 · ≤400MB</span>
            <em>点击选择 · 或拖入视频</em>
          </button>
        )}
      </DropZone>

      <p className="media-hint">
        特效会保留输入视频的构图与运动，只替换画面风格。当前 IC-LoRA 权重仍需手动安装。
      </p>
    </section>
  )
}
