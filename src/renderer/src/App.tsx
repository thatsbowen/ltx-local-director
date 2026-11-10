import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { Onboarding } from './components/Onboarding'
import { Studio } from './components/Studio'
import { Library } from './components/Library'
import { PromptAcademy } from './components/PromptAcademy'
import { SettingsPage } from './components/SettingsPage'
import { RewardPage } from './components/RewardPage'
import { TaskDetail } from './components/TaskDetail'
import { Toasts } from './components/Toasts'
import { Logo } from './components/TitleBar'
import { useAppStore } from './store'

export default function App(): React.JSX.Element {
  const init = useAppStore((state) => state.init)
  const ready = useAppStore((state) => state.ready)
  const bootError = useAppStore((state) => state.bootError)
  const view = useAppStore((state) => state.view)
  const onboardingOpen = useAppStore((state) => state.onboardingOpen)
  const detailTaskId = useAppStore((state) => state.detailTaskId)
  const reduceMotion = useAppStore((state) => state.settings?.reduceMotion)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', Boolean(reduceMotion))
  }, [reduceMotion])

  if (!ready) {
    return (
      <div className="boot-screen">
        <div className="boot-orb" />
        <Logo size={62} />
        <h1>LTX 本地导演台</h1>
        <p>正在检测硬件与本地引擎…</p>
        <div className="boot-loader">
          <span />
        </div>
      </div>
    )
  }

  if (bootError) {
    return (
      <div className="fatal-screen">
        <AlertTriangle size={34} />
        <h1>工作区启动失败</h1>
        <p>{bootError}</p>
        <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
          重新加载
        </button>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-body">
        <Sidebar />
        <main className="main-area">
          {view === 'studio' && <Studio />}
          {view === 'library' && <Library />}
          {view === 'academy' && <PromptAcademy />}
          {view === 'settings' && <SettingsPage />}
          {view === 'reward' && <RewardPage />}
        </main>
      </div>
      {onboardingOpen && <Onboarding />}
      {detailTaskId && <TaskDetail taskId={detailTaskId} />}
      <Toasts />
    </div>
  )
}
