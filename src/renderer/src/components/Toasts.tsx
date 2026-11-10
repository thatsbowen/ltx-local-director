import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import clsx from 'clsx'
import { useAppStore } from '../store'

export function Toasts(): React.JSX.Element {
  const toasts = useAppStore((state) => state.toasts)
  const dismiss = useAppStore((state) => state.dismissToast)

  return (
    <div className="toast-stack">
      {toasts.map((toast) => {
        const Icon = toast.kind === 'success' ? CheckCircle2 : toast.kind === 'error' ? AlertTriangle : Info
        return (
          <div key={toast.id} className={clsx('toast', toast.kind)}>
            <span className="toast-icon">
              <Icon size={18} />
            </span>
            <div className="toast-copy">
              <strong>{toast.title}</strong>
              {toast.message && <p>{toast.message}</p>}
            </div>
            <button type="button" className="toast-close" onClick={() => dismiss(toast.id)} aria-label="关闭">
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
