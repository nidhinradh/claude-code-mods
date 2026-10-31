import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const chosen = atom({ plugin: 'model-switcher', key: 'chosen' } as const, null)
const isOff = atom({ plugin: 'model-switcher', key: 'isOff' } as const, false)

// Each model has its own cache, so a switch re-reads the whole chat uncached.
// Past this size the current choice is held, because switching could cost more.
const HOLD_ABOVE_TOKENS = 30_000

const MODEL_FOR: Readonly<Record<string, string>> = {
  simple: 'haiku',
  standard: 'sonnet',
  complex: 'opus',
}

// Clear cases need no model call. The rest get one call to the small fast model.
async function tierOf($: EngineInterface, text: string) {
  if (text.length < 80 && /^\s*(hi|hello|thanks|thank you|ok|okay|yes|no)\b/i.test(text)) {
    return 'simple'
  }

  if (/\b(architecture|race condition|security review|migrate|migration)\b/i.test(text)) {
    return 'complex'
  }

  return $.model.classify(
    `Coding assistant request. simple: quick question, typo, rename, one small edit. ` +
      `standard: normal feature or bug fix. complex: design, hard debugging, work across many files.\n\n` +
      text.slice(0, 2000),
    ['simple', 'standard', 'complex'],
  )
}

async function choose($: EngineInterface, text: string) {
  const { context } = await $.session.usage()
  const current = await read($, chosen)

  if ((context.tokens ?? 0) > HOLD_ABOVE_TOKENS) {
    $.ui.status(current === null ? 'auto model: holding session model' : `auto model: ${current} (held)`)

    return
  }

  try {
    const tier = await tierOf($, text)
    const model = tier === undefined ? undefined : MODEL_FOR[tier]

    if (model !== undefined) {
      await update($, chosen, () => model)
      $.ui.status(`auto model: ${model}`)
    }
  } catch {
    // The classifier failed, so this turn keeps the model it already had.
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'auto-model',
      description: 'Turn automatic model switching on or off',
      argumentHint: 'on|off',
    })

    return next(e)
  })

  on('command.run', { command: 'auto-model' }, async ($, e) => {
    const off = e.args.trim() === 'off'
    await update($, isOff, () => off)
    await update($, chosen, () => null)
    $.ui.status(off ? undefined : 'auto model: on')

    return { text: off ? 'Automatic model switching is off.' : 'Automatic model switching is on.' }
  })

  // Only remembered here. Other mods, like a guard, may still stop this message,
  // and classifying it now would send it to a model before they've had their say.
  let pendingText: string | null = null

  on('prompt.submit', async ($, e, next) => {
    if (e.command === undefined && e.isMeta !== true) {
      pendingText = e.text
    }

    const entered = await next(e)

    if (entered.drop !== undefined) {
      pendingText = null
    }

    return entered
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined && pendingText !== null) {
      const text = pendingText
      pendingText = null

      if (!(await read($, isOff))) {
        await choose($, text)
      }
    }

    const model = e.agentId === undefined ? await read($, chosen) : null

    return yield* next(model === null ? e : { ...e, model })
  })
}
