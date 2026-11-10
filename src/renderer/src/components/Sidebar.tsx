import {
  Clapperboard,
  FolderKanban,
  GraduationCap,
  Heart,
  Settings,
  Sparkles,
  Cpu,
  ChevronRight
} from 'lucide-react'
import clsx from 'clsx'
import { useAppStore, type View } from '../store'

const NAV: Array<{ id: View; label: string; icon: typeof Clapperboard }> = [
  { id: 'studio', label: '创作台', icon: Clapperboard },
  { id: 'library', label: '作品库', icon: FolderKanban },
  { id: 'academy', label: '灵感学院', icon: GraduationCap },
  { id: 'settings', label: '设置', icon: Settings },
  { id: 'reward', label: '赞赏', icon: Heart }
]

export function Sidebar(): React.JSX.Element {
  const view = useAppStore((state) => state.view)
  const setView = useAppStore((state) => state.setView)
  const engine = useAppStore((state) => state.engine)
  const hardware = useAppStore((state) => state.hardware)
  const setEngineView = (): void => {
    setView('settings')
  }

  const ready = engine.state === 'ready'
  const label = ready ? '引擎已就绪' : engine.state === 'starting' ? '引擎启动中' : '引擎未启动'
  const sub = hardware?.gpuName
    ? hardware.gpuName.replace('NVIDIA GeForce ', '')
    : '打开设置检查引擎与模型'

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {NAV.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              className={clsx('nav-item', view === item.id && 'active', item.id === 'reward' && 'reward')}
              onClick={() => setView(item.id)}
              title={item.label}
            >
              <span className="nav-icon">
                <Icon size={20} strokeWidth={1.8} />
              </span>
              <span className="nav-label">{item.label}</span>
              {item.id === 'studio' && (
                <span className="nav-spark">
                  <Sparkles size={10} />
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="sidebar-bottom">
        <button type="button" className={clsx('key-card', ready ? 'ready' : 'empty')} onClick={setEngineView}>
          <span className="key-icon">
            <Cpu size={16} />
          </span>
          <span className="key-copy">
            <strong>{label}</strong>
            <span>{sub}</span>
          </span>
          <ChevronRight size={14} />
        </button>
        <p className="sidebar-footnote">LTX-2 本地渲染 · 无云端</p>
      </div>
    </aside>
  )
}
