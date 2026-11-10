import { useState } from 'react'
import { ArrowLeft, Heart, QrCode, ShieldCheck, Sparkles, X } from 'lucide-react'
import qrImage from '../assets/reward-qr.jpg'
import { useAppStore } from '../store'

export function RewardPage(): React.JSX.Element {
  const setView = useAppStore((state) => state.setView)
  const [zoom, setZoom] = useState(false)

  return (
    <div className="reward-page">
      <button type="button" className="back-to-studio" onClick={() => setView('studio')}>
        <ArrowLeft size={14} />
        返回创作台
      </button>

      <div className="reward-hero">
        <span className="page-eyebrow"><Heart size={12} /> SUPPORT THE STUDIO</span>
        <h1>如果它帮你拍出了<br /><span>喜欢的画面</span>。</h1>
        <p>导演台会一直保持免费、本地、无广告、无遥测。赞赏完全自愿，不影响任何功能。</p>
      </div>

      <div className="reward-layout">
        <div className="reward-card qr-card">
          <div className="qr-head">
            <span className="qr-icon"><QrCode size={18} /></span>
            <div>
              <strong>微信赞赏码</strong>
              <span>长按或截图保存后扫码</span>
            </div>
          </div>
          <button type="button" className="qr-frame" onClick={() => setZoom(true)} title="点击放大">
            <img src={qrImage} alt="微信赞赏码" />
            <span className="qr-hover">点击放大</span>
          </button>
          <div className="qr-footer">
            <Heart size={13} fill="currentColor" />
            感谢每一份心意，也感谢你认真创作
          </div>
        </div>

        <div className="reward-copy">
          <div className="reward-note">
            <span className="note-number">01</span>
            <div>
              <strong>完全自愿</strong>
              <p>不赞赏也能使用全部功能。生成完全由本机显卡完成，不产生任何云端费用。</p>
            </div>
          </div>
          <div className="reward-note">
            <span className="note-number">02</span>
            <div>
              <strong>本地安全</strong>
              <p>赞赏页不接入支付接口，不收集任何信息。二维码仅作为图片显示在本机。</p>
            </div>
          </div>
          <div className="reward-note">
            <span className="note-number">03</span>
            <div>
              <strong>持续打磨</strong>
              <p>你的支持会用于测试生成、改进提示词模板，以及打磨更顺手的导演体验。</p>
            </div>
          </div>

          <div className="reward-quote">
            <Sparkles size={15} />
            <p>“好作品不是参数堆出来的，是你知道自己想看什么。”</p>
          </div>

          <button type="button" className="btn-primary" onClick={() => setView('studio')}>
            <Sparkles size={15} />
            回去继续创作
          </button>
          <span className="reward-safe">
            <ShieldCheck size={12} />
            无支付集成 · 无数据上传 · 无强制赞赏
          </span>
        </div>
      </div>

      {zoom && (
        <div className="qr-zoom-backdrop" onClick={() => setZoom(false)}>
          <div className="qr-zoom" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setZoom(false)}>
              <X size={18} />
            </button>
            <img src={qrImage} alt="微信赞赏码" />
            <span>微信扫码赞赏</span>
          </div>
        </div>
      )}
    </div>
  )
}
