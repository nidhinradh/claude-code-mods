import { expect, test } from 'claude-code/testing'

const STEP = { turnId: 't1', index: 0, model: 'session-model', messageCount: 1 }
const HARD = 'Why does this crash only on the second login?'

function usage(tokens: number) {
  return { value: { startedAt: 0, context: { tokens, window: 200_000, percent: 1 }, rateLimits: [], cost: {} } }
}

// Stands for the engine: answers the prompt and records the model a step names.
function engine(on: any) {
  const seen = { model: '' }

  on('prompt.submit', (_: unknown, e: { text: string }) => ({ text: e.text }))
  on('ui.status', () => ({ value: undefined }))
  on('turn.step', async function* (_: unknown, e: { model: string; turnId: string; index: number }) {
    seen.model = e.model

    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] }
  })

  return seen
}

async function step($: any) {
  for await (const _ of $.turn.step(STEP)) {
    // The stub sends no chunks.
  }
}

test('a clear small request goes to Haiku with no model call', async ($, on) => {
  let classified = 0
  const seen = engine(on)
  on('session.usage', () => usage(0))
  on('model.classify', () => {
    classified += 1

    return { value: 'complex' }
  })

  await $.prompt.submit({ text: 'thanks' })
  await step($)

  expect(classified).toBe(0)
  expect(seen.model).toBe('haiku')
})

test('the classifier decides everything else', async ($, on) => {
  const seen = engine(on)
  on('session.usage', () => usage(0))
  on('model.classify', () => ({ value: 'complex' }))

  await $.prompt.submit({ text: HARD })
  await step($)

  expect(seen.model).toBe('opus')
})

test('a long chat holds the model it already chose', async ($, on) => {
  let tokens = 0
  const seen = engine(on)
  on('session.usage', () => usage(tokens))
  on('model.classify', () => ({ value: 'complex' }))

  await $.prompt.submit({ text: HARD })
  await step($)
  tokens = 90_000
  await $.prompt.submit({ text: 'thanks' })
  await step($)

  expect(seen.model).toBe('opus')
})

test('a chat already long when the mod loads keeps the session model', async ($, on) => {
  const seen = engine(on)
  on('session.usage', () => usage(90_000))
  on('model.classify', () => ({ value: 'simple' }))

  await $.prompt.submit({ text: HARD })
  await step($)

  expect(seen.model).toBe('session-model')
})

test('a failed classifier leaves the session model alone', async ($, on) => {
  const seen = engine(on)
  on('session.usage', () => usage(0))
  on('model.classify', () => {
    throw new Error('no network')
  })

  await $.prompt.submit({ text: HARD })
  await step($)

  expect(seen.model).toBe('session-model')
})

test('/auto-model off leaves the session model alone', async ($, on) => {
  const seen = engine(on)
  on('session.usage', () => usage(0))
  on('model.classify', () => ({ value: 'complex' }))

  await $.command.run({ command: 'auto-model', args: 'off' })
  await $.prompt.submit({ text: HARD })
  await step($)

  expect(seen.model).toBe('session-model')
})

test('a message another mod stops is never classified', async ($, on) => {
  let classified = 0
  on('session.usage', () => usage(0))
  on('ui.status', () => ({ value: undefined }))
  on('model.classify', () => {
    classified += 1

    return { value: 'complex' }
  })
  on('prompt.submit', () => ({ drop: 'stopped by a guard' }))
  const seen = { model: '' }
  on('turn.step', async function* (_: unknown, e: any) {
    seen.model = e.model

    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] }
  })

  await $.prompt.submit({ text: 'my password is abc123' })
  await step($)

  expect(classified).toBe(0)
  expect(seen.model).toBe('session-model')
})
