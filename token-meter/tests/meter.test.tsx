import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'token-meter',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false, maxRows: 5, bodyColumns: 80, scroll: { offset: 0, bodyRows: 5 }, view: {} },
} as const

const NOW = Date.parse('2026-10-31T10:00:00Z')

function engine(on: any, usage: object) {
  on('session.usage', () => ({ value: { startedAt: 0, rateLimits: [], ...usage } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('clock.now', () => ({ value: NOW }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
}

test('the band shows the meter, cost, limits and what fills the context', async ($, on) => {
  engine(on, {
    context: {
      tokens: 50_000,
      window: 200_000,
      percent: 25,
      breakdown: {
        categories: [
          { name: 'System prompt', tokens: 8_000, kind: 'used' },
          { name: 'Messages', tokens: 40_000, kind: 'used' },
          { name: 'Free space', tokens: 150_000, kind: 'free' },
        ],
      },
    },
    cost: { usd: 0.4 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 23.5, resetsAt: '2026-10-31T12:00:00Z' },
      { kind: 'seven_day', percentUsed: 7, resetsAt: '2026-11-03T10:00:00Z' },
    ],
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })

  expect((await terminal.find({ type: 'Text', text: /25%/ }))?.text).toBe('25%')
  expect((await terminal.find({ type: 'Text', text: /50k/ }))?.text).toBe('50k / 200k')
  expect((await terminal.find({ type: 'Text', text: /~\$/ }))?.text).toBe('~$0.40')
  expect((await terminal.find({ type: 'Text', text: /^5h/ }))?.text).toBe('5h 24% · 2h')
  expect((await terminal.find({ type: 'Text', text: /Messages/ }))?.text).toBe('Messages 40k')
  await terminal.unmount()

  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const svg = await desktop.find({ type: 'Svg' })

  expect(svg?.props.source).toContain('Messages 40k')
  expect(svg?.props.source).toContain('~$0.40')
  expect(svg?.props.source).toContain('25%')
  expect(svg?.props.alt).toBe('Context 25% full, claude-opus-5-5, 5h limit 24%, Week limit 7%')
  await desktop.unmount()
})

test('with no cost or limits it shows what it has', async ($, on) => {
  engine(on, { context: { window: 200_000 } })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const svg = await ui.find({ type: 'Svg' })

  expect(svg?.props.source).toContain('opus-5-5')
  expect(svg?.props.source).toContain('0%')
  await ui.unmount()
})
