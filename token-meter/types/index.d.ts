export type Limit = { kind: string; percent: number; resetsInMs?: number }

export type Part = { name: string; tokens: number }

export type Meter = {
  tokens?: number
  window: number
  percent?: number
  model?: string
  usd?: number
  limits?: Limit[]
  parts?: Part[]
}

declare module 'claude-code' {
  interface PluginState {
    'token-meter': { meter: Meter | null }
  }
}
