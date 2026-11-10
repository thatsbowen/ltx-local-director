import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import fs from 'node:fs/promises'
import type { HardwareInfo, RecommendedProfile, Resolution, VramTier } from '@shared/types'

const execFileAsync = promisify(execFile)

function tierFromVram(vramMb: number): VramTier {
  if (vramMb >= 60000) return '64G'
  if (vramMb >= 30000) return '32G'
  if (vramMb >= 22000) return '24G'
  if (vramMb >= 14000) return '16G'
  return '8G'
}

function resolutionFor(tier: VramTier): { def: Resolution; max: Resolution } {
  switch (tier) {
    case '8G':
      return { def: '832x480', max: '832x480' }
    case '16G':
      return { def: '960x544', max: '1216x704' }
    case '24G':
      return { def: '1216x704', max: '1280x720' }
    default:
      return { def: '1216x704', max: '1280x720' }
  }
}

/** 以 16GB 档实测为基准的耗时倍率 */
const SPEED_FACTOR: Record<VramTier, number> = {
  '8G': 4.0,
  '16G': 1.0,
  '24G': 0.6,
  '32G': 0.45,
  '64G': 0.35
}

export function speedFactorFor(tier: VramTier): number {
  return SPEED_FACTOR[tier]
}

function recommendedFor(tier: VramTier): RecommendedProfile {
  const { def, max } = resolutionFor(tier)
  const factor = SPEED_FACTOR[tier]
  const base = 76 // 16GB / 960x544 / 4s / T2V 实测
  const notes: Record<VramTier, string> = {
    '8G': '实验档：仅建议 480p / 3 秒，且关闭音频以节省显存',
    '16G': '主力档：544p / 4~5 秒带音频，704p 可尝试',
    '24G': '甜点档：704p / 6 秒，显存压力小',
    '32G': '推荐档：720p / 6~10 秒，可开 2× 放大',
    '64G': '最佳画质：720p 以上，BF16 全精度'
  }
  return {
    tier,
    resolution: def,
    duration: tier === '8G' ? 3 : tier === '16G' ? 4 : 6,
    steps: 9,
    estimatedSec: Math.round(base * factor),
    maxResolution: max,
    note: notes[tier]
  }
}

async function queryNvidiaSmi(): Promise<{
  gpuName: string
  vramMb: number
  computeCap: string
  driver: string
} | null> {
  try {
    const { stdout } = await execFileAsync(
      'nvidia-smi',
      ['--query-gpu=name,memory.total,compute_cap,driver_version', '--format=csv,noheader,nounits'],
      { timeout: 8000, windowsHide: true }
    )
    const line = stdout.trim().split(/\r?\n/)[0]
    if (!line) return null
    const parts = line.split(',').map((s) => s.trim())
    if (parts.length < 4) return null
    return {
      gpuName: parts[0],
      vramMb: Number(parts[1]) || 0,
      computeCap: parts[2],
      driver: parts[3]
    }
  } catch {
    return null
  }
}

async function freeDiskGb(dir: string): Promise<number> {
  try {
    const st = await fs.statfs(dir)
    return Math.round(((st.bavail * st.bsize) / 1024 ** 3) * 10) / 10
  } catch {
    return 0
  }
}

function isWin11(): boolean {
  if (process.platform !== 'win32') return true
  const build = Number(os.release().split('.')[2] ?? 0)
  return build >= 22000
}

export async function detectHardware(dataDir: string): Promise<HardwareInfo> {
  const gpu = await queryNvidiaSmi()
  const vramMb = gpu?.vramMb ?? 0
  const capMajor = Number((gpu?.computeCap ?? '0').split('.')[0]) || 0
  const tier = tierFromVram(vramMb)

  return {
    gpuName: gpu?.gpuName ?? '未检测到 NVIDIA 显卡',
    vramMb,
    computeCap: gpu?.computeCap ?? '0.0',
    driver: gpu?.driver ?? '-',
    ramMb: Math.round(os.totalmem() / 1024 / 1024),
    diskFreeGb: await freeDiskGb(dataDir),
    tier,
    supportsNvfp4: capMajor >= 12,
    supportsFp8: capMajor >= 8.9,
    needsWin11Hint: !isWin11() && capMajor >= 12,
    recommended: recommendedFor(tier)
  }
}
