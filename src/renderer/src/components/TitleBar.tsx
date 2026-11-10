import { useEffect, useState } from 'react'
import { Minus, Square, X, ShieldCheck, Cpu } from 'lucide-react'
import { useAppStore } from '../store'
import clsx from 'clsx'

export function Logo({ size = 34, withText = false }: { size?: number; withText?: boolean }): React.JSX.Element {
  return (
    <div className="logo-wrap" style={{ gap: withText ? 10 : 0 }}>
      <div className="logo-mark" style={{ width: size, height: size }}>
        <span style={{ fontSize: size * 0.32 }}>LTX</span>
      </div>
      {withText && (
        <div className="logo-text">
          <strong>LTX 本地导演台</strong>
          <span>Local Director</span>
        </div>
      )}
    </div>
  )
}

export function TitleBar(): React.JSX.Element {
  const version = useAppStore((state) => state.version)
  const engine = useAppStore((state) => state.engine)
  const hardware = useAppStore((state) => state.hardware)
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    return window.ltx.onWindowState(setMaximized)
  }, [])

  const engineLabel =
    engine.state === 'ready'
      ? '引擎就绪'
      : engine.state === 'starting'
        ? '引擎启动中'
        : engine.state === 'error'
          ? '引擎异常'
          : '引擎未启动'

  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <Logo size={27} withText />
        <span className="titlebar-version">v{version || '1.0.0'}</span>
      </div>
      <div className="titlebar-center">
        <span className="local-pill">
          <ShieldCheck size={12} />
          纯本地运行 · 数据不出机
        </span>
      </div>
      <div className="titlebar-actions">
        <span className={clsx('api-mini', engine.state === 'ready' ? 'online' : 'offline')} title={engine.message}>
          <Cpu size={12} />
          {engineLabel}
          {hardware?.vramMb ? ` · ${Math.round(hardware.vramMb / 1024)}G` : ''}
        </span>
        <div className="window-controls">
          <button type="button" className="window-btn" title="最小化" onClick={() => window.ltx.windowMinimize()}>
            <Minus size={15} />
          </button>
          <button
            type="button"
            className="window-btn"
            title={maximized ? '还原' : '最大化'}
            onClick={() => void window.ltx.windowToggleMaximize().then(setMaximized)}
          >
            <Square size={12} />
          </button>
          <button type="button" className="window-btn close" title="关闭" onClick={() => window.ltx.windowClose()}>
            <X size={16} />
          </button>
        </div>
      </div>
    </header>
  )
}
