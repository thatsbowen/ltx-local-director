import fs from 'node:fs'
import path from 'node:path'
import type { ModelFile, ModelScanResult, ModelStatus } from '@shared/types'

// ------------------------------------------------------------
// 模型清单
// 文件名必须与 ComfyUI 里实际落盘的名字一致，否则工作流会加载失败
// ------------------------------------------------------------

const ALL_TIERS: ModelFile['tiers'] = ['8G', '16G', '24G', '32G', '64G']

export const MODEL_CATALOG: ModelFile[] = [
  {
    id: 'transformer-q4ks',
    role: 'transformer',
    name: 'LTX-2.3 主模型（蒸馏 Q4_K_S）',
    folder: 'unet',
    filename: 'LTX-2.3-distilled-Q4_K_S.gguf',
    sizeGb: 16.5,
    required: true,
    tiers: ALL_TIERS,
    description: 'GGUF 4-bit 量化的视频生成主模型，16GB 显存可跑 544p。'
  },
  {
    id: 'text-encoder-gemma3',
    role: 'text_encoder',
    name: 'Gemma 3 12B 文本编码器（Q3_K_XL）',
    folder: 'text_encoders',
    filename: 'gemma-3-12b-it-qat-UD-Q3_K_XL.gguf',
    sizeGb: 5.7,
    required: true,
    tiers: ALL_TIERS,
    description: '把提示词编码成 LTX 能理解的条件向量，必须与主模型配套。'
  },
  {
    id: 'text-projection',
    role: 'text_projection',
    name: 'LTX-2.3 文本投影层',
    folder: 'text_encoders',
    filename: 'ltx-2.3_text_projection_bf16.safetensors',
    sizeGb: 2.2,
    required: true,
    tiers: ALL_TIERS,
    description: '把 Gemma 的输出投影到 LTX 的隐空间，缺失会直接报错。'
  },
  {
    id: 'video-vae',
    role: 'video_vae',
    name: 'LTX-2.3 视频 VAE',
    folder: 'vae',
    filename: 'LTX23_video_vae_bf16.safetensors',
    sizeGb: 1.4,
    required: true,
    tiers: ALL_TIERS,
    description: '视频潜变量与像素之间的编解码器。'
  },
  {
    id: 'audio-vae',
    role: 'audio_vae',
    name: 'LTX-2.3 音频 VAE',
    folder: 'vae',
    filename: 'LTX23_audio_vae_bf16.safetensors',
    sizeGb: 0.4,
    required: true,
    tiers: ALL_TIERS,
    description: '生成同步音频所必需，缺失时只能出无声视频。'
  },
  {
    id: 'upscaler-x2',
    role: 'upscaler',
    name: 'LTX-2.3 空间放大 ×2',
    folder: 'latent_upscale_models',
    filename: 'ltx-2.3-spatial-upscaler-x2-1.0.safetensors',
    sizeGb: 0.9,
    required: false,
    tiers: ['24G', '32G', '64G'],
    description: '二阶段放大，把 704p 拉到 1080p 级别。16GB 档默认关闭。'
  },
  {
    id: 'effect-canny',
    role: 'effect_lora',
    name: '线稿控制 IC-LoRA（Canny）',
    folder: 'loras',
    filename: 'ltx-2-19b-ic-lora-canny-control.safetensors',
    sizeGb: 1.2,
    required: false,
    tiers: ALL_TIERS,
    description: '「线稿动画」特效所需。当前为 19B 版本，与 2.3 的 22B 兼容性待验证。'
  },
  {
    id: 'effect-depth',
    role: 'effect_lora',
    name: '深度控制 IC-LoRA（Depth）',
    folder: 'loras',
    filename: 'ltx-2-19b-ic-lora-depth-control.safetensors',
    sizeGb: 1.2,
    required: false,
    tiers: ALL_TIERS,
    description: '「景深强化」特效所需，还需要额外的深度估计模型。'
  },
  {
    id: 'depth-estimator',
    role: 'effect_lora',
    name: 'Lotus 深度估计模型',
    folder: 'depthanything',
    filename: 'lotus-depth-d-v1-1.safetensors',
    sizeGb: 1.1,
    required: false,
    tiers: ALL_TIERS,
    description: '把普通画面转成深度图，供景深特效使用。'
  },
  {
    id: 'assistant-llm',
    role: 'assistant_llm',
    name: '提示词助手 LLM（Qwen3-4B）',
    folder: 'llm',
    filename: 'Qwen3-4B-Q4_K_M.gguf',
    sizeGb: 2.5,
    required: false,
    tiers: ALL_TIERS,
    description: '离线提示词助手。未安装时使用内置规则润色，仍然完全离线。'
  }
]

/** 扫描时跳过的大目录，避免把 node_modules 也走一遍 */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.venv',
  'python_embeded',
  'custom_nodes',
  '__pycache__',
  'output',
  'input',
  'temp'
])

function walk(dir: string, index: Map<string, string>, depth = 0): void {
  if (depth > 6) return
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name.toLowerCase())) continue
      walk(path.join(dir, entry.name), index, depth + 1)
    } else if (entry.isFile()) {
      const lower = entry.name.toLowerCase()
      if (!index.has(lower)) index.set(lower, path.join(dir, entry.name))
    }
  }
}

function buildIndex(modelRoot: string): Map<string, string> {
  const index = new Map<string, string>()
  walk(path.join(modelRoot, 'models'), index)
  // 助手 LLM 可能放在自定义目录
  walk(path.join(modelRoot, 'llm'), index)
  return index
}

export function scanModels(modelRoot: string): ModelScanResult {
  const index = buildIndex(modelRoot)
  const models: ModelStatus[] = MODEL_CATALOG.map((item) => {
    const actualPath = index.get(item.filename.toLowerCase())
    let actualSizeGb: number | undefined
    if (actualPath) {
      try {
        actualSizeGb = Math.round((fs.statSync(actualPath).size / 1024 ** 3) * 10) / 10
      } catch {
        actualSizeGb = undefined
      }
    }
    return { ...item, present: Boolean(actualPath), actualPath, actualSizeGb }
  })

  return {
    models,
    missingRequired: models.filter((item) => item.required && !item.present).map((item) => item.name),
    modelRoot,
    scannedAt: Date.now()
  }
}

/** 把扫描结果整理成引擎需要的文件名，缺失必需项时抛错 */
export function resolveModelPaths(scan: ModelScanResult): {
  transformer: string
  textEncoder: string
  textProjection: string
  videoVae: string
  audioVae: string
} {
  const byId = new Map(scan.models.map((item) => [item.id, item]))
  const pick = (id: string): string => {
    const item = byId.get(id)
    if (!item?.present) throw new Error(`缺少模型：${item?.name ?? id}（请在设置里检查模型目录）`)
    return item.filename
  }
  return {
    transformer: pick('transformer-q4ks'),
    textEncoder: pick('text-encoder-gemma3'),
    textProjection: pick('text-projection'),
    videoVae: pick('video-vae'),
    audioVae: pick('audio-vae')
  }
}

export function findModel(scan: ModelScanResult, id: string): ModelStatus | undefined {
  return scan.models.find((item) => item.id === id)
}
