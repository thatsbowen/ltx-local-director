import { spawn, type ChildProcess } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import type {
  EffectId,
  EngineStatus,
  GenerationRequest,
  Resolution,
  TaskStageEvent
} from '@shared/types'
import { RESOLUTIONS } from '@shared/types'

// ------------------------------------------------------------
// 配置
// ------------------------------------------------------------

export interface ComfyConfig {
  /** ComfyUI 根目录（含 main.py） */
  engineRoot: string
  /** 模型根目录（含 unet / text_encoders / vae / loras） */
  modelRoot: string
  /** ComfyUI venv 的 python.exe */
  pythonPath: string
  port: number
}

export interface ModelPaths {
  transformer: string
  textEncoder: string
  textProjection: string
  videoVae: string
  audioVae: string
  /** 特效 IC-LoRA 文件名（可选） */
  effectLora?: string
}

export interface RunResult {
  outputs: string[]
  elapsedSec: number
  peakVramMb?: number
}

// ------------------------------------------------------------
// 极简 HTTP 客户端
// ------------------------------------------------------------

function request(
  method: string,
  url: string,
  body?: unknown,
  timeoutMs = 30000
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body), 'utf-8')
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        timeout: timeoutMs,
        headers: payload
          ? { 'Content-Type': 'application/json', 'Content-Length': payload.length }
          : undefined
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf-8') })
        )
      }
    )
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

// ------------------------------------------------------------
// 引擎桥
// ------------------------------------------------------------

export class ComfyBridge {
  private proc: ChildProcess | null = null
  private status: EngineStatus = { state: 'stopped', port: 0, message: '未启动' }
  private cfg: ComfyConfig | null = null
  private logBuffer: string[] = []
  private currentPromptId: string | null = null

  onStatus?: (s: EngineStatus) => void
  onLog?: (line: string) => void

  configure(cfg: ComfyConfig): void {
    this.cfg = cfg
  }

  getStatus(): EngineStatus {
    return { ...this.status }
  }

  getConfig(): ComfyConfig | null {
    return this.cfg ? { ...this.cfg } : null
  }

  /** ComfyUI 的 output 目录里的相对路径 → 绝对路径 */
  resolveOutput(relative: string): string {
    if (!this.cfg) throw new Error('引擎未配置')
    const root = path.resolve(this.cfg.modelRoot, 'output')
    const absolute = path.resolve(root, relative)
    if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
      throw new Error('非法的输出路径')
    }
    return absolute
  }

  private setStatus(patch: Partial<EngineStatus>): void {
    this.status = { ...this.status, ...patch }
    this.onStatus?.(this.getStatus())
  }

  private pushLog(line: string): void {
    if (!line.trim()) return
    this.logBuffer.push(line)
    if (this.logBuffer.length > 500) this.logBuffer.shift()
    this.onLog?.(line)
  }

  async health(): Promise<boolean> {
    if (!this.cfg) return false
    try {
      const r = await request('GET', `http://127.0.0.1:${this.cfg.port}/system_stats`, undefined, 3000)
      return r.status === 200
    } catch {
      return false
    }
  }

  async start(): Promise<EngineStatus> {
    if (!this.cfg) {
      this.setStatus({ state: 'error', message: '引擎未配置' })
      return this.getStatus()
    }
    if (await this.health()) {
      this.setStatus({ state: 'ready', port: this.cfg.port, message: '引擎已就绪' })
      return this.getStatus()
    }

    this.setStatus({ state: 'starting', port: this.cfg.port, message: '正在启动引擎…' })

    const mainPy = path.join(this.cfg.engineRoot, 'main.py')
    const args = [
      mainPy,
      '--base-directory',
      this.cfg.modelRoot,
      '--port',
      String(this.cfg.port),
      '--listen',
      '127.0.0.1'
    ]

    this.proc = spawn(this.cfg.pythonPath, args, {
      cwd: this.cfg.engineRoot,
      windowsHide: true,
      env: {
        ...process.env,
        PYTORCH_CUDA_ALLOC_CONF: 'expandable_segments:True',
        PYTHONUNBUFFERED: '1'
      }
    })

    this.proc.stdout?.on('data', (d: Buffer) => this.pushLog(d.toString('utf-8')))
    this.proc.stderr?.on('data', (d: Buffer) => this.pushLog(d.toString('utf-8')))
    this.proc.on('exit', (code) => {
      this.proc = null
      if (this.status.state !== 'stopped') {
        this.setStatus({ state: 'error', message: `引擎退出（code ${code ?? '?'}）`, lastError: this.logBuffer.slice(-20).join('\n') })
      }
    })

    const deadline = Date.now() + 180_000
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500))
      if (await this.health()) {
        this.setStatus({ state: 'ready', pid: this.proc?.pid, startedAt: Date.now(), message: '引擎已就绪' })
        return this.getStatus()
      }
      if (!this.proc) break
    }

    this.setStatus({
      state: 'error',
      message: '引擎启动超时',
      lastError: this.logBuffer.slice(-20).join('\n')
    })
    return this.getStatus()
  }

  async stop(): Promise<EngineStatus> {
    if (this.proc) {
      try {
        this.proc.kill()
      } catch {
        /* ignore */
      }
      this.proc = null
    }
    this.setStatus({ state: 'stopped', message: '已停止' })
    return this.getStatus()
  }

  // ----------------------------------------------------------
  // 输入文件：复制到 ComfyUI 的 input 目录
  // ----------------------------------------------------------

  async stageInput(srcPath: string): Promise<string> {
    if (!this.cfg) throw new Error('引擎未配置')
    const dir = path.join(this.cfg.modelRoot, 'input', 'ltx-director')
    await fs.mkdir(dir, { recursive: true })
    const ext = path.extname(srcPath) || '.png'
    const hash = crypto.createHash('sha1').update(srcPath + String(Date.now())).digest('hex').slice(0, 12)
    const name = `${hash}${ext}`
    await fs.copyFile(srcPath, path.join(dir, name))
    return `ltx-director/${name}`
  }

  // ----------------------------------------------------------
  // 提交与等待
  // ----------------------------------------------------------

  async submit(workflow: Record<string, unknown>): Promise<string> {
    if (!this.cfg) throw new Error('引擎未配置')
    const r = await request('POST', `http://127.0.0.1:${this.cfg.port}/prompt`, { prompt: workflow }, 60000)
    if (r.status !== 200) {
      throw new Error(`提交失败 HTTP ${r.status}: ${r.text.slice(0, 800)}`)
    }
    const parsed = JSON.parse(r.text) as { prompt_id?: string; error?: unknown }
    if (!parsed.prompt_id) throw new Error(`提交失败: ${r.text.slice(0, 800)}`)
    this.currentPromptId = parsed.prompt_id
    return parsed.prompt_id
  }

  async waitFor(
    promptId: string,
    opts: { estimatedSec: number; onStage?: (e: TaskStageEvent) => void }
  ): Promise<RunResult> {
    if (!this.cfg) throw new Error('引擎未配置')
    const t0 = Date.now()
    let lastStage = ''
    let peakVramMb = 0

    for (;;) {
      await new Promise((r) => setTimeout(r, 1000))
      const elapsed = (Date.now() - t0) / 1000

      try {
        const stats = await request('GET', `http://127.0.0.1:${this.cfg.port}/system_stats`, undefined, 5000)
        if (stats.status === 200) {
          const parsed = JSON.parse(stats.text) as {
            devices?: Array<{ vram_total?: number; vram_free?: number }>
          }
          const device = parsed.devices?.[0]
          if (device?.vram_total && typeof device.vram_free === 'number') {
            peakVramMb = Math.max(peakVramMb, Math.round((device.vram_total - device.vram_free) / 1024 / 1024))
          }
        }
      } catch {
        /* 统计失败不影响生成 */
      }

      let hist: Record<string, { status?: { status_str?: string; messages?: unknown[] }; outputs?: Record<string, { images?: { filename: string; subfolder?: string }[] }> }> = {}
      try {
        const r = await request('GET', `http://127.0.0.1:${this.cfg.port}/history/${promptId}`, undefined, 15000)
        if (r.status === 200) hist = JSON.parse(r.text)
      } catch {
        /* 引擎忙时可能超时，继续等 */
      }

      if (hist[promptId]) {
        const entry = hist[promptId]
        const ok = entry.status?.status_str === 'success'
        if (!ok) {
          const msg = JSON.stringify(entry.status?.messages ?? []).slice(0, 1200)
          throw new Error(`生成失败: ${msg}`)
        }
        const files: string[] = []
        for (const node of Object.values(entry.outputs ?? {})) {
          for (const img of node.images ?? []) {
            files.push(img.subfolder ? `${img.subfolder}/${img.filename}` : img.filename)
          }
        }
        return { outputs: files, elapsedSec: Math.round(elapsed), peakVramMb: peakVramMb || undefined }
      }

      const ratio = Math.min(0.95, elapsed / Math.max(15, opts.estimatedSec))
      const stage: TaskStageEvent =
        ratio < 0.12
          ? { stage: 'loading', message: '加载模型…', progress: Math.round(ratio * 100) }
          : ratio < 0.8
            ? { stage: 'sampling', message: '采样中…', progress: Math.round(ratio * 100) }
            : { stage: 'decoding', message: '解码音视频…', progress: Math.round(ratio * 100) }

      if (stage.stage !== lastStage) lastStage = stage.stage
      opts.onStage?.(stage)

      if (elapsed > 3600) throw new Error('生成超时（超过 60 分钟）')
    }
  }

  async interrupt(): Promise<void> {
    if (!this.cfg) return
    try {
      await request('POST', `http://127.0.0.1:${this.cfg.port}/interrupt`, {}, 10000)
    } catch {
      /* ignore */
    }
    this.currentPromptId = null
  }
}

// ------------------------------------------------------------
// 工作流构建（与 Phase 0a 验证过的图完全一致）
// ------------------------------------------------------------

const NEGATIVE_DEFAULT =
  'blurry, low quality, still frame, frames, watermark, overlay, titles, has blurbox, has subtitles'

/** 帧数对齐到 8n+1 */
export function framesFor(duration: number, fps: number): number {
  const raw = Math.max(9, Math.round(duration * fps))
  const n = Math.max(1, Math.round((raw - 1) / 8))
  return n * 8 + 1
}

export interface BuildContext {
  req: GenerationRequest
  models: ModelPaths
  /** 已 stage 的输入图（相对 ComfyUI input 目录） */
  firstImage?: string
  lastImage?: string
  /** 输出文件名前缀 */
  prefix: string
}

function baseNodes(ctx: BuildContext): Record<string, unknown> {
  const { models, req } = ctx
  return {
    '1': { class_type: 'UnetLoaderGGUF', inputs: { unet_name: models.transformer } },
    '2': {
      class_type: 'DualClipLoaderGGUF',
      inputs: {
        clip_name1: models.textEncoder,
        clip_name2: models.textProjection,
        type: 'ltxv',
        device: 'default'
      }
    },
    '3': { class_type: 'VAELoader', inputs: { vae_name: models.videoVae } },
    '4': { class_type: 'VAELoader', inputs: { vae_name: models.audioVae } },
    '5': {
      class_type: 'CLIPTextEncode',
      inputs: { text: req.prompt, clip: ['2', 0] }
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: { text: req.negativePrompt || NEGATIVE_DEFAULT, clip: ['2', 0] }
    },
    '7': {
      class_type: 'LTXVConditioning',
      inputs: { positive: ['5', 0], negative: ['6', 0], frame_rate: req.fps }
    }
  }
}

function tailNodes(
  ctx: BuildContext,
  latentSource: [string, number],
  audioSource: [string, number],
  frames: number,
  cfgOut: [string, number] = ['7', 0]
): Record<string, unknown> {
  const { req } = ctx
  const res: Resolution = req.resolution
  const { width, height } = RESOLUTIONS[res]

  return {
    '20': {
      class_type: 'EmptyLTXVLatentVideo',
      inputs: { width, height, length: frames, batch_size: 1 }
    },
    '22': {
      class_type: 'LTXVEmptyLatentAudio',
      inputs: { frames_number: frames, frame_rate: req.fps, batch_size: 1, audio_vae: ['4', 0] }
    },
    '23': {
      class_type: 'LTXVConcatAVLatent',
      inputs: { video_latent: latentSource, audio_latent: ['22', 0] }
    },
    '30': {
      class_type: 'ManualSigmas',
      inputs: { sigmas: '1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0' }
    },
    '31': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    '32': {
      class_type: 'CFGGuider',
      inputs: {
        model: ['1', 0],
        positive: [cfgOut[0], 0],
        negative: [cfgOut[0], 1],
        cfg: 1.0
      }
    },
    '33': { class_type: 'RandomNoise', inputs: { noise_seed: req.seed } },
    '34': {
      class_type: 'SamplerCustomAdvanced',
      inputs: {
        noise: ['33', 0],
        guider: ['32', 0],
        sampler: ['31', 0],
        sigmas: ['30', 0],
        latent_image: ['23', 0]
      }
    },
    '40': { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['34', 1] } },
    '41': {
      class_type: 'VAEDecodeTiled',
      inputs: {
        samples: ['40', 0],
        vae: ['3', 0],
        tile_size: 512,
        overlap: 64,
        temporal_size: 64,
        temporal_overlap: 8
      }
    },
    '42': {
      class_type: 'LTXVAudioVAEDecode',
      inputs: { samples: ['40', 1], audio_vae: ['4', 0] }
    },
    '43': {
      class_type: 'CreateVideo',
      inputs: { images: ['41', 0], audio: ['42', 0], fps: req.fps }
    },
    '44': {
      class_type: 'SaveVideo',
      inputs: {
        video: ['43', 0],
        filename_prefix: ctx.prefix,
        format: 'mp4',
        codec: 'h264'
      }
    }
  }
}

export function buildT2V(ctx: BuildContext): Record<string, unknown> {
  const frames = framesFor(ctx.req.duration, ctx.req.fps)
  return {
    ...baseNodes(ctx),
    ...tailNodes(ctx, ['20', 0], ['22', 0], frames)
  }
}

export function buildI2V(ctx: BuildContext): Record<string, unknown> {
  const { req } = ctx
  const { width, height } = RESOLUTIONS[req.resolution]
  const frames = framesFor(req.duration, req.fps)
  const nodes = baseNodes(ctx)

  nodes['8'] = { class_type: 'LoadImage', inputs: { image: ctx.firstImage } }
  nodes['9'] = {
    class_type: 'ImageScale',
    inputs: { image: ['8', 0], upscale_method: 'lanczos', width, height, crop: 'center' }
  }
  nodes['10'] = { class_type: 'LTXVPreprocess', inputs: { image: ['9', 0], img_compression: 0 } }

  const tail = tailNodes(ctx, ['21', 0], ['22', 0], frames)
  nodes['20'] = {
    class_type: 'EmptyLTXVLatentVideo',
    inputs: { width, height, length: frames, batch_size: 1 }
  }
  nodes['21'] = {
    class_type: 'LTXVImgToVideoInplace',
    inputs: { vae: ['3', 0], image: ['10', 0], latent: ['20', 0], strength: 1.0, bypass: false }
  }
  return { ...nodes, ...tail }
}

export function buildFLF(ctx: BuildContext): Record<string, unknown> {
  const { req } = ctx
  const { width, height } = RESOLUTIONS[req.resolution]
  const frames = framesFor(req.duration, req.fps)
  const nodes = baseNodes(ctx)

  nodes['8'] = { class_type: 'LoadImage', inputs: { image: ctx.firstImage } }
  nodes['9'] = {
    class_type: 'ImageScale',
    inputs: { image: ['8', 0], upscale_method: 'lanczos', width, height, crop: 'center' }
  }
  nodes['10'] = { class_type: 'LTXVPreprocess', inputs: { image: ['9', 0], img_compression: 0 } }

  nodes['11'] = { class_type: 'LoadImage', inputs: { image: ctx.lastImage } }
  nodes['12'] = {
    class_type: 'ImageScale',
    inputs: { image: ['11', 0], upscale_method: 'lanczos', width, height, crop: 'center' }
  }
  nodes['13'] = { class_type: 'LTXVPreprocess', inputs: { image: ['12', 0], img_compression: 0 } }

  nodes['20'] = {
    class_type: 'EmptyLTXVLatentVideo',
    inputs: { width, height, length: frames, batch_size: 1 }
  }

  // 先加尾帧，再加首帧（与官方模板一致）
  nodes['14'] = {
    class_type: 'LTXVAddGuide',
    inputs: {
      positive: ['7', 0],
      negative: ['7', 1],
      vae: ['3', 0],
      latent: ['20', 0],
      image: ['13', 0],
      frame_idx: -1,
      strength: 0.7
    }
  }
  nodes['15'] = {
    class_type: 'LTXVAddGuide',
    inputs: {
      positive: ['14', 0],
      negative: ['14', 1],
      vae: ['3', 0],
      latent: ['14', 2],
      image: ['10', 0],
      frame_idx: 0,
      strength: 0.7
    }
  }

  const tail = tailNodes(ctx, ['15', 2], ['22', 0], frames, ['15', 0])
  // 首尾帧必须裁剪 guide，且裁剪要在 AV 分离之后
  delete tail['41']
  delete tail['42']
  tail['45'] = { class_type: 'LTXVCropGuides', inputs: { positive: ['15', 0], negative: ['15', 1], latent: ['40', 0] } }
  tail['41'] = {
    class_type: 'VAEDecodeTiled',
    inputs: {
      samples: ['45', 2],
      vae: ['3', 0],
      tile_size: 512,
      overlap: 64,
      temporal_size: 64,
      temporal_overlap: 8
    }
  }
  tail['42'] = { class_type: 'LTXVAudioVAEDecode', inputs: { samples: ['40', 1], audio_vae: ['4', 0] } }

  return { ...nodes, ...tail }
}

export function buildWorkflow(ctx: BuildContext): Record<string, unknown> {
  switch (ctx.req.mode) {
    case 'text':
      return buildT2V(ctx)
    case 'image':
      return buildI2V(ctx)
    case 'firstlast':
      return buildFLF(ctx)
    case 'effect':
      throw new Error('特效模式将在 v1.1 接入 IC-LoRA 权重后启用')
    default:
      throw new Error(`未知模式: ${ctx.req.mode}`)
  }
}

export function effectAvailable(_id: EffectId, _hasLora: boolean): boolean {
  return false
}
