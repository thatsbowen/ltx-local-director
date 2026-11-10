import type { GenerationMode } from '@shared/types'

export interface PromptDraft {
  subject: string
  action: string
  scene: string
  style: string
  camera: string
  light: string
  audio: string
  constraints: string
  negative: string
}

export const emptyDraft: PromptDraft = {
  subject: '',
  action: '',
  scene: '',
  style: '电影写实',
  camera: '缓慢推近',
  light: '自然光，柔和层次',
  audio: '',
  constraints: '',
  negative: ''
}

export const STYLE_OPTIONS = [
  '电影写实',
  '广告质感',
  '日系动画',
  '3D 渲染',
  '纪录片',
  '复古胶片',
  '赛博朋克',
  '东方水墨',
  '定格动画',
  '超现实'
]

export const CAMERA_OPTIONS = [
  '固定镜头',
  '缓慢推近',
  '缓慢拉远',
  '横向摇移',
  '环绕主体',
  '跟随拍摄',
  '手持纪实',
  '航拍俯瞰',
  '微距特写',
  '低角度仰拍'
]

export const LIGHT_OPTIONS = [
  '自然光，柔和层次',
  '黄金时刻，温暖逆光',
  '阴天柔光，低对比',
  '霓虹夜景，冷暖对撞',
  '顶光硬朗，戏剧阴影',
  '烛光暖调，轻微闪烁',
  '冷色月光，静谧氛围',
  '影棚柔光，干净通透'
]

export const INSPIRATION_TEMPLATES = [
  {
    id: 'cinema',
    tag: '电影感',
    title: '雨夜重逢',
    idea: '雨夜的旧车站，一位穿米色风衣的女人拖着行李箱走向站台。她停下脚步，另一位撑黑伞的人从雨幕中走来。镜头缓慢推近两人之间被雨水打湿的地面，远处列车灯光由虚变实。雨声、列车低鸣与鞋跟踩水声。'
  },
  {
    id: 'product',
    tag: '产品广告',
    title: '香水与光',
    idea: '高级香水瓶放在黑色石面上，晨光从百叶窗缝隙扫过，瓶中琥珀色液体折射出细碎光斑。镜头围绕瓶身缓慢旋转，最后一滴水珠沿玻璃滑落。极轻的环境声与一声清亮的玻璃回响。'
  },
  {
    id: 'anime',
    tag: '动画',
    title: '云上列车',
    idea: '宫崎骏风格的云海之上，一列老式蒸汽列车沿着看不见的轨道前行。穿黄色雨衣的少年趴在车窗边，伸手触碰飘过的云。镜头从车厢外跟随，再拉到广阔天空。风声、蒸汽声与远处汽笛。'
  },
  {
    id: 'doc',
    tag: '纪录片',
    title: '清晨的面馆',
    idea: '清晨五点半的老街面馆，师傅把面团摔在案板上，蒸汽从大锅升起。镜头从手部特写慢慢拉开，展示狭小温暖的店面与窗外刚亮的天色。面团拍打声、锅水沸腾声与街道远处的车流。'
  },
  {
    id: 'pet',
    tag: '萌宠',
    title: '纸箱探险',
    idea: '一只橘猫发现客厅里新放的空纸箱，先警惕地绕行，再突然跳进去，只露出两只耳朵和一条晃动的尾巴。镜头以低角度跟随猫咪，最后定格在它得意的表情。爪子挠纸箱的沙沙声与一声轻叫。'
  },
  {
    id: 'food',
    tag: '美食',
    title: '拉面慢镜',
    idea: '一双木筷从热气腾腾的拉面碗中夹起面条，汤汁沿面条缓缓滴落，叉烧与溏心蛋在暖光下泛着油润光泽。镜头贴近碗沿，缓慢横移，最后定格在升腾的蒸汽。汤汁滴落声与轻微的环境嘈杂。'
  }
]

const MODE_HINTS: Record<GenerationMode, string> = {
  text: '',
  image: '以输入图作为第一帧，保持主体外观、服装、颜色和画面风格一致，从这一帧自然开始运动。',
  firstlast: '以首帧开始，在结尾自然过渡到尾帧；中间运动连续、物理合理，主体外观和场景保持一致。',
  effect: '保持输入视频的构图与运动节奏，只改变画面风格。'
}

export function compilePrompt(
  draft: PromptDraft,
  mode: GenerationMode,
  duration: number,
  soundDesign: boolean
): string {
  const blocks: string[] = []
  if (MODE_HINTS[mode]) blocks.push(MODE_HINTS[mode])
  if (draft.subject.trim()) blocks.push(`画面主体：${draft.subject.trim()}`)
  if (draft.action.trim()) blocks.push(`动作与叙事：${draft.action.trim()}`)
  if (draft.scene.trim()) blocks.push(`场景环境：${draft.scene.trim()}`)
  if (draft.style.trim()) blocks.push(`视觉风格：${draft.style.trim()}`)
  if (draft.camera.trim()) blocks.push(`镜头语言：${draft.camera.trim()}，运动平稳，构图有明确视觉中心`)
  if (draft.light.trim()) blocks.push(`光线与色彩：${draft.light.trim()}`)
  if (soundDesign) {
    blocks.push(
      draft.audio.trim()
        ? `声音：${draft.audio.trim()}`
        : `声音：与画面同步的环境声和动作音效，空间感自然，${duration} 秒内连续不断裂`
    )
  }
  if (draft.constraints.trim()) blocks.push(`额外要求：${draft.constraints.trim()}`)
  if (draft.negative.trim()) blocks.push(`需要避免：${draft.negative.trim()}`)
  blocks.push('画面中不出现字幕、水印、logo 和额外文字，人物手指与肢体结构自然。')
  return blocks.join('\n')
}

export function compileInspirationPrompt(
  idea: string,
  duration: number,
  soundDesign: boolean,
  negative: string
): string {
  const blocks = [idea.trim()]
  if (soundDesign) {
    blocks.push(`声音：与画面同步的环境声、动作音效与空间混响，声音自然连贯；${duration} 秒内完整呈现。`)
  }
  if (negative.trim()) blocks.push(`需要避免：${negative.trim()}`)
  blocks.push('画面中不出现字幕、水印、logo 和额外文字，人物手指与肢体结构自然。')
  return blocks.filter(Boolean).join('\n\n')
}

const VAGUE_WORDS = ['震撼', '大片', '唯美', '高级感', '极致', '绝美', '史诗级', '惊艳', '顶级']
const CONFLICTS: Array<[string, string, string]> = [
  ['白天', '夜晚', '同时出现了白天与夜晚'],
  ['室内', '室外', '同时出现了室内与室外'],
  ['静止', '高速运动', '静止与高速运动可能冲突'],
  ['晴天', '暴雨', '天气描述可能冲突'],
  ['黑白', '鲜艳色彩', '色彩描述可能冲突']
]

export interface PromptReview {
  score: number
  level: string
  issues: string[]
  suggestions: string[]
  chars: number
}

export function reviewPrompt(
  text: string,
  options: {
    structured?: boolean
    draft?: PromptDraft
    soundDesign?: boolean
    negative?: string
    mode?: GenerationMode
  } = {}
): PromptReview {
  const issues: string[] = []
  const suggestions: string[] = []
  let score = 100
  const chars = text.trim().length
  const draft = options.draft

  if (chars === 0) {
    return {
      score: 0,
      level: '等待描述',
      issues: ['还没有填写画面描述'],
      suggestions: ['先用一句话写下“谁在哪里做什么”，再补充镜头和光线。'],
      chars: 0
    }
  }

  if (options.structured && draft) {
    if (!draft.subject.trim()) {
      score -= 22
      issues.push('缺少画面主体')
      suggestions.push('补充主体：人物、动物、产品，或一个明确的环境主角。')
    }
    if (!draft.action.trim()) {
      score -= 20
      issues.push('缺少连续动作')
      suggestions.push('用一个可拍摄的动作替代静态描述，例如“转身推开木门”。')
    }
    if (!draft.scene.trim()) {
      score -= 12
      issues.push('场景不明确')
      suggestions.push('补充地点、时间与天气，让模型知道画面发生在哪里。')
    }
    if (!draft.camera.trim()) {
      score -= 10
      issues.push('没有镜头设计')
      suggestions.push('选择一种镜头运动，例如缓慢推近、环绕主体或固定镜头。')
    }
    if (!draft.light.trim()) {
      score -= 8
      issues.push('缺少光线描述')
      suggestions.push('用“黄金时刻逆光”“霓虹冷调”等词确定画面色调。')
    }
    if (options.soundDesign && !draft.audio.trim()) {
      score -= 8
      issues.push('声音描述留空')
      suggestions.push('描述环境声、动作音效或对白，LTX 会同步生成音频。')
    }
  } else {
    if (chars < 25) {
      score -= 30
      issues.push('描述过短，信息不足')
      suggestions.push('至少补充主体、动作、场景和镜头四类信息。')
    }
    if (!/[走跑跳转推拉抬低飞落看笑说拿放]/.test(text)) {
      score -= 12
      issues.push('缺少可执行的动作')
      suggestions.push('加入一个具体动作，让画面在时长内真正发生变化。')
    }
    if (!/(镜头|特写|近景|远景|俯拍|仰拍|跟拍|摇移|推近|拉远|画面)/.test(text)) {
      score -= 10
      issues.push('缺少镜头语言')
      suggestions.push('加入景别或运动，例如“中景，镜头缓慢跟随”。')
    }
    if (!/(光|色调|阴影|逆光|柔光|霓虹|晨曦|黄昏)/.test(text)) {
      score -= 8
      issues.push('缺少光线或色彩')
      suggestions.push('指定主光方向与色调，画面会更稳定。')
    }
    if (options.soundDesign && !/(声|音效|音乐|环境音|对白|呼吸|风|雨)/.test(text)) {
      score -= 8
      issues.push('没有声音线索')
      suggestions.push('补充环境声与动作音效，例如“雨声、远处列车低鸣”。')
    }
  }

  const vagueHits = VAGUE_WORDS.filter((word) => text.includes(word))
  if (vagueHits.length >= 2) {
    score -= Math.min(12, vagueHits.length * 3)
    issues.push(`空洞形容词较多：${vagueHits.join('、')}`)
    suggestions.push('把“震撼、唯美”替换成具体的可见细节与摄影语言。')
  }

  for (const [a, b, label] of CONFLICTS) {
    if (text.includes(a) && text.includes(b)) {
      score -= 8
      issues.push(label)
    }
  }

  if (chars > 1500) {
    score -= 8
    issues.push('描述偏长，重点可能被稀释')
    suggestions.push('把 800 字以内的核心信息放在前面，删除重复形容。')
  }
  if (chars > 7000) {
    score = 0
    issues.push('超过 7000 字上限，无法提交')
  }

  if (options.mode === 'image' || options.mode === 'firstlast') {
    if (!/(保持|一致|起始|首帧|尾帧)/.test(text)) {
      score -= 5
      suggestions.push('图生视频建议写明需要保持的主体特征，减少外形漂移。')
    }
  }

  score = Math.max(0, Math.min(100, score))
  const level = score >= 85 ? '可直接生成' : score >= 65 ? '基本可用' : score >= 45 ? '建议完善' : '信息不足'
  if (!issues.length) issues.push('信息完整，可以开始生成')
  return { score, level, issues, suggestions: suggestions.slice(0, 4), chars }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)} 天前`
  return new Date(timestamp).toLocaleDateString('zh-CN')
}
