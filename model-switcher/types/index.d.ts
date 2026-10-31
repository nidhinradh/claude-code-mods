declare module 'claude-code' {
  interface PluginState {
    'model-switcher': { chosen: string | null; isOff: boolean }
  }
}
