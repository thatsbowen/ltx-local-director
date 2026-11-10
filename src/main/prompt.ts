import type { EnhanceResult, GenerationMode } from '@shared/types'

/**
 * 离线提示词润色。
 *
 * 当前版本使用确定性规则补齐 LTX 最吃的四类信息：主体动作、镜头、光线、声音。
 * 不联网、不调用任何 API。等本地 LLM（Qwen3-4B）接入后，这里会换成模型改写，
 * 但对渲染层的接口保持不变。
 */

const CAMERA_RE = /镜头|特写|近景|中景|远景|全景|俯拍|仰拍|跟拍|推近|拉远|摇移|环绕|手持|航拍|微距/
const LIGHT_RE = /光|色调|逆光|柔光|硬光|霓虹|晨|黄昏|日落|阴影|曝光|暖调|冷调/
const SOUND_RE = /声|音效|音乐|环境音|对白|台词|呼吸|风|雨|脚步|回响|安静/
const MOTION_RE = /走|跑|跳|转|推|拉|抬|低|飞|落|看|笑|说|拿|放|挥|坐|站|打开|关|拥抱|转身/

const MODE_ADDITION: Record<GenerationMode, string> = {
  text: '',
  image: '以输入图作为第一帧，保持人物外观、服装、颜色与场景一致，从这一帧自然开始运动。',
  firstlast: '以首帧开始、尾帧结束，中间运动连续、物理合理，主体外观与场景保持一致。',
  effect: '保持输入视频的构图与运动节奏，只改变画面风格。'
}

export function enhancePromptLocal(input: string, mode: GenerationMode): EnhanceResult {
  const text = input.trim()
  if (!text) {
    return { prompt: '', note: '先写一段基础描述，再来润色。' }
  }

  const blocks: string[] = []
  const additions: string[] = []

  if (MODE_ADDITION[mode]) blocks.push(MODE_ADDITION[mode])
  blocks.push(text)

  if (!MOTION_RE.test(text)) {
    additions.push('动作：主体有一个清晰、可在镜头时长内完成的连续动作')
  }
  if (!CAMERA_RE.test(text)) {
    additions.push('镜头：中景缓慢推近，构图稳定，主体位于三分线，运动平稳')
  }
  if (!LIGHT_RE.test(text)) {
    additions.push('光线：柔和自然光，明暗层次分明，轻微景深')
  }
  if (!SOUND_RE.test(text)) {
    additions.push('声音：与画面同步的环境声与动作音效，空间感自然，无背景音乐也能成立')
  }

  if (additions.length) blocks.push(additions.join('；'))
  blocks.push('画面中不出现字幕、水印、logo 与多余文字，人物手指与肢体结构自然。')

  return {
    prompt: blocks.join('\n\n'),
    note: additions.length
      ? `已补齐 ${additions.length} 类信息（本地规则，完全离线）`
      : '结构已经完整，仅补充了输出约束'
  }
}

export const DEFAULT_NEGATIVE =
  'blurry, low quality, still frame, frames, watermark, overlay, titles, has blurbox, has subtitles, distorted hands, extra limbs'
