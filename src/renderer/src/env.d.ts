/// <reference types="vite/client" />

import type { LtxApi } from '@shared/types'

declare global {
  interface Window {
    ltx: LtxApi
  }
}

export {}
