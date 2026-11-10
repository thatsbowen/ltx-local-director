import type { AssetRef, LocalAsset, MediaKind } from '@shared/types'

export interface MediaMeta {
  width?: number
  height?: number
  duration?: number
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), ms))
  ])
}

export async function probeMedia(url: string, kind: MediaKind): Promise<MediaMeta | null> {
  if (kind === 'image') {
    return withTimeout(
      new Promise<MediaMeta | null>((resolve) => {
        const image = new Image()
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
        image.onerror = () => resolve(null)
        image.src = url
      }),
      8000
    )
  }

  return withTimeout(
    new Promise<MediaMeta | null>((resolve) => {
      const element = document.createElement(kind === 'video' ? 'video' : 'audio')
      element.preload = 'metadata'
      element.onloadedmetadata = () =>
        resolve({
          width: kind === 'video' ? (element as HTMLVideoElement).videoWidth : undefined,
          height: kind === 'video' ? (element as HTMLVideoElement).videoHeight : undefined,
          duration: Number.isFinite(element.duration) ? element.duration : undefined
        })
      element.onerror = () => resolve(null)
      element.src = url
    }),
    9000
  )
}

export function validateMedia(asset: LocalAsset, _all: AssetRef[]): string[] {
  const errors: string[] = []

  if (asset.kind === 'image') {
    if (asset.width && asset.height) {
      if (asset.width < 256 || asset.height < 256) errors.push('图片分辨率低于 256px')
      if (asset.width > 8192 || asset.height > 8192) errors.push('图片分辨率超过 8192px')
      const aspect = asset.width / asset.height
      if (aspect < 0.4 || aspect > 2.5) errors.push('图片宽高比需在 0.4–2.5 之间')
    }
    if (asset.size > 40 * 1024 * 1024) errors.push('图片超过 40MB')
  }

  if (asset.kind === 'video') {
    if (asset.duration !== undefined) {
      if (asset.duration < 1) errors.push('视频时长不足 1 秒')
      if (asset.duration > 10.2) errors.push('特效输入视频不能超过 10 秒')
    }
    if (asset.size > 400 * 1024 * 1024) errors.push('视频超过 400MB')
  }

  return errors
}

export function formatDuration(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds)) return '--:--'
  const whole = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(whole / 60)
  const rest = whole % 60
  return `${minutes}:${rest.toString().padStart(2, '0')}`
}

export function roleLabel(role: AssetRef['role']): string {
  const labels: Record<AssetRef['role'], string> = {
    first_frame: '起始帧',
    last_frame: '结尾帧',
    reference_image: '参考图',
    reference_video: '输入视频'
  }
  return labels[role]
}
