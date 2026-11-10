import { useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  AudioLines,
  BookOpen,
  Camera,
  CheckCircle2,
  Copy,
  Focus,
  GraduationCap,
  Lightbulb,
  Move,
  RotateCw,
  Sparkles,
  Volume2,
  Wand2
} from 'lucide-react'
import clsx from 'clsx'
import { useAppStore } from '../store'

const FORMULA = [
  { key: '主体', detail: '谁 / 什么，外观、年龄、材质', tone: 'warm' },
  { key: '动作', detail: '一个连续、可拍摄的动作', tone: 'blue' },
  { key: '场景', detail: '地点、时间、天气、环境细节', tone: 'green' },
  { key: '镜头', detail: '景别、机位、推拉摇移', tone: 'violet' },
  { key: '光线', detail: '主光方向、色温、对比度', tone: 'amber' },
  { key: '声音', detail: '环境声、动作音效、音乐情绪', tone: 'rose' }
]

const CAMERA_TERMS = [
  { term: '推近', en: 'Dolly in', desc: '镜头缓慢靠近主体，情绪逐渐收紧。适合发现、凝视、告白。' },
  { term: '拉远', en: 'Dolly out', desc: '从细节退到环境，交代关系与空间。适合结尾、孤独感。' },
  { term: '环绕', en: 'Orbit', desc: '围绕主体旋转，展示体积与状态。适合产品、人物登场。' },
  { term: '跟拍', en: 'Tracking', desc: '镜头与主体同步移动，保持距离。适合行走、奔跑、追逐。' },
  { term: '手持', en: 'Handheld', desc: '轻微晃动与呼吸感，真实、临场。适合纪实与冲突。' },
  { term: '航拍', en: 'Aerial', desc: '高空俯瞰或掠过，建立地理尺度。适合开场与转场。' },
  { term: '微距', en: 'Macro', desc: '贴近细节，放大纹理与材质。适合美食、珠宝、昆虫。' },
  { term: '低角度', en: 'Low angle', desc: '从下往上拍，主体更有压迫感与力量感。' }
]

const SOUND_LAYERS = [
  { title: '环境底噪', desc: '雨声、风声、街道远处车流、室内空调低鸣。先铺空间，再放动作。', icon: Volume2 },
  { title: '动作音效', desc: '脚步踩水、布料摩擦、杯子落在桌面。声音要与画面动作对得上。', icon: Move },
  { title: '音乐情绪', desc: '用“低沉大提琴”“稀疏钢琴”描述质感，不写具体版权歌曲名。', icon: AudioLines },
  { title: '混响空间', desc: '山谷、浴室、空旷仓库的声音反射不同，用混响交代空间大小。', icon: RotateCw }
]

const MISTAKES = [
  { bad: '一个非常震撼、电影感十足的唯美画面', good: '雨夜车站，暖黄顶灯在湿地面上拉出长反光，女人停在台阶前回头' },
  { bad: '镜头快速运动，同时保持完全静止', good: '镜头从手部特写缓慢拉远，最后停在人物全景' },
  { bad: '让画面里出现很多文字和品牌 logo', good: '画面干净，不出现文字、字幕与水印' },
  { bad: '参考图里的女孩变成另一个人，但保持一致', good: '保持参考图女孩的脸型、发型与米色风衣，只改变背景为夜晚街道' }
]

const SAMPLE_PROMPT = `雨夜的旧车站，穿米色风衣的女人拖着行李箱走向站台。她在大理石台阶前停下，回头看向雨幕。镜头从行李箱轮子碾过湿地面开始，缓慢上移并推近到她的侧脸。暖黄站灯与冷蓝夜色对撞，玻璃顶棚上雨水不断滑落。声音：雨声、远处列车低鸣、鞋跟踩水声，低沉大提琴缓慢进入。画面中不出现文字、水印和 logo。`

export function PromptAcademy(): React.JSX.Element {
  const setView = useAppStore((state) => state.setView)
  const pushToast = useAppStore((state) => state.pushToast)
  const [tab, setTab] = useState<'formula' | 'camera' | 'sound'>('formula')

  const copy = (text: string, title: string): void => {
    void window.ltx.copyText(text)
    pushToast({ kind: 'success', title })
  }

  return (
    <div className="academy-page">
      <div className="academy-hero">
        <div className="academy-hero-copy">
          <span className="page-eyebrow"><GraduationCap size={12} /> PROMPT ACADEMY</span>
          <h1>不懂提示词，<br />也能拍出<span>好镜头</span>。</h1>
          <p>记住一个公式：主体 + 动作 + 场景 + 镜头 + 光线 + 声音。剩下的，交给 LTX 导演台。</p>
          <div className="academy-actions">
            <button type="button" className="btn-primary" onClick={() => setView('studio')}>
              <Wand2 size={16} />
              去创作台试试
            </button>
            <button type="button" className="btn-secondary" onClick={() => copy(SAMPLE_PROMPT, '示例提示词已复制')}>
              <Copy size={15} />
              复制示例
            </button>
          </div>
        </div>
        <div className="academy-hero-art">
          <div className="formula-orbit">
            <span className="orbit-core"><Sparkles size={19} /> LTX</span>
            {FORMULA.map((item, index) => (
              <span key={item.key} className={`orbit-chip chip-${index}`}>{item.key}</span>
            ))}
            <i className="orbit-ring r1" />
            <i className="orbit-ring r2" />
          </div>
          <div className="academy-quote">
            <Lightbulb size={14} />
            <span>描述“看得见的东西”，而不是“你想要的感觉”。</span>
          </div>
        </div>
      </div>

      <div className="academy-tabs">
        <button type="button" className={clsx(tab === 'formula' && 'active')} onClick={() => setTab('formula')}>
          <BookOpen size={15} /> 提示词公式
        </button>
        <button type="button" className={clsx(tab === 'camera' && 'active')} onClick={() => setTab('camera')}>
          <Camera size={15} /> 镜头词典
        </button>
        <button type="button" className={clsx(tab === 'sound' && 'active')} onClick={() => setTab('sound')}>
          <AudioLines size={15} /> 声音设计
        </button>
      </div>

      {tab === 'formula' && (
        <div className="academy-section">
          <div className="formula-grid">
            {FORMULA.map((item, index) => (
              <div key={item.key} className={`formula-card ${item.tone}`}>
                <span className="formula-index">0{index + 1}</span>
                <strong>{item.key}</strong>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>

          <div className="example-compare">
            <div className="example-panel bad">
              <div className="example-label"><AlertTriangle size={13} /> 模糊描述</div>
              <p>一个非常震撼、电影感十足、特别唯美的夜晚画面。</p>
              <span>模型不知道主体是谁、在哪里、做什么，也不知道镜头怎么运动。</span>
            </div>
            <div className="example-arrow"><ArrowRight size={18} /></div>
            <div className="example-panel good">
              <div className="example-label"><CheckCircle2 size={13} /> 导演描述</div>
              <p>{SAMPLE_PROMPT}</p>
              <button type="button" onClick={() => copy(SAMPLE_PROMPT, '示例提示词已复制')}>
                <Copy size={12} /> 复制这段
              </button>
            </div>
          </div>

          <div className="tips-heading">
            <span><Focus size={15} /> 四个让画面更稳的小习惯</span>
          </div>
          <div className="tips-grid">
            <div className="tip-card">
              <strong>只写一个主动作</strong>
              <p>6 秒里塞进三个动作，模型会平均分配时间，每个都做不完整。</p>
            </div>
            <div className="tip-card">
              <strong>用名词代替形容词</strong>
              <p>“高级感”不如“哑光黑石材、细金属反光、低饱和灰背景”。</p>
            </div>
            <div className="tip-card">
              <strong>先定光线，再定风格</strong>
              <p>光线决定体积和情绪；风格词只是最后的一层滤镜。</p>
            </div>
            <div className="tip-card">
              <strong>声音提前写进提示词</strong>
              <p>LTX 同步生成音频。环境声和动作音效能显著提升真实感。</p>
            </div>
          </div>

          <div className="mistake-section">
            <div className="section-title">
              <span>常见矛盾写法</span>
              <em>避开它们，成功率更高</em>
            </div>
            <div className="mistake-table">
              {MISTAKES.map((item) => (
                <div className="mistake-row" key={item.bad}>
                  <div className="bad"><AlertTriangle size={12} /> {item.bad}</div>
                  <ArrowRight size={13} />
                  <div className="good"><CheckCircle2 size={12} /> {item.good}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'camera' && (
        <div className="academy-section">
          <div className="camera-grid">
            {CAMERA_TERMS.map((item) => (
              <div className="camera-card" key={item.term}>
                <div className="camera-icon"><Camera size={18} /></div>
                <div>
                  <span className="camera-en">{item.en}</span>
                  <h3>{item.term}</h3>
                  <p>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="camera-note">
            <Lightbulb size={15} />
            <p>一个镜头只选一种主要运动。想要复杂运镜，拆成两个连续的短镜头，比一次性描述更稳定。</p>
          </div>
        </div>
      )}

      {tab === 'sound' && (
        <div className="academy-section">
          <div className="sound-layout">
            <div className="sound-cards">
              {SOUND_LAYERS.map((item) => {
                const Icon = item.icon
                return (
                  <div className="sound-card" key={item.title}>
                    <span className="sound-icon"><Icon size={17} /></span>
                    <div><strong>{item.title}</strong><p>{item.desc}</p></div>
                  </div>
                )
              })}
            </div>
            <div className="sound-example">
              <span className="page-eyebrow">SOUND RECIPE</span>
              <h3>一段可直接用的声音描述</h3>
              <div className="sound-recipe">
                雨声密集打在玻璃顶棚上，远处列车低鸣由远及近，鞋跟踩过浅水发出清脆声。人物停下时环境声短暂静下来，只保留呼吸。低沉大提琴从画面外缓慢进入。
              </div>
              <button type="button" className="btn-secondary small" onClick={() => copy('声音设计：雨声密集打在玻璃顶棚上，远处列车低鸣由远及近，鞋跟踩过浅水发出清脆声。人物停下时环境声短暂静下来，只保留呼吸。低沉大提琴从画面外缓慢进入。', '声音描述已复制')}>
                <Copy size={13} /> 复制声音描述
              </button>
              <div className="sound-warning">
                <AlertTriangle size={13} />
                不要写具体歌曲名或歌词，模型无法使用版权音乐，还可能触发审核。
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="academy-cta">
        <div>
          <span className="page-eyebrow"><Sparkles size={12} /> READY TO SHOOT</span>
          <h2>下一次，写一个能拍出来的镜头。</h2>
          <p>创作台内置结构编排与本地提示词润色，会替你补齐遗漏的信息。</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setView('studio')}>
          开始创作 <ArrowRight size={16} />
        </button>
      </div>
    </div>
  )
}
