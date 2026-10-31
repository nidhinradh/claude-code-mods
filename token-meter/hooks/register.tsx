import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Meter } from '../types'
import { PART_COLORS, levelColor, limitName, meterAlt, meterSvg, resetsIn, short } from './svg.ts'

const meter = atom({ plugin: 'token-meter', key: 'meter' } as const, null)

const BAR_CELLS = 20
const MAX_PARTS = 4

// All local: the summary breakdown estimates and sends no request, so this
// costs no tokens.
async function refresh($: EngineInterface) {
  const { context, rateLimits, cost } = await $.session.usage({ breakdown: 'summary' })
  const now = await $.clock.now()
  const value: Meter = {
    tokens: context.tokens,
    window: context.window,
    percent: context.percent,
    model: await $.session.model(),
    usd: cost?.usd,
    limits: rateLimits.map(limit => ({
      kind: limit.kind,
      percent: limit.percentUsed,
      resetsInMs: limit.resetsAt === undefined ? undefined : Date.parse(limit.resetsAt) - now,
    })),
    parts: (context.breakdown?.categories ?? [])
      .filter(category => category.kind === 'used' && category.tokens > 0)
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, MAX_PARTS)
      .map(category => ({ name: category.name, tokens: category.tokens })),
  }

  await update($, meter, () => value)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await refresh($)

    return started
  })

  // A turn with tool calls has several requests, so the meter moves during it.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)

    if (e.agentId === undefined) {
      await refresh($)
    }

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const value = await read($, meter)

    if (e.props.hasSurvey || value === null) {
      return next(e)
    }

    // The Desktop app draws a real graphic. The terminal has no Svg, so it gets
    // the same layout in coloured blocks.
    if (e.surface !== 'terminal') {
      const { Svg } = $.ui.resolve(e)

      return <Svg source={meterSvg(value)} alt={meterAlt(value)} />
    }

    const { Box, Text } = $.ui.resolve(e)
    const percent = value.percent ?? 0
    const parts = value.parts ?? []
    const total = parts.reduce((sum, part) => sum + part.tokens, 0)
    const filled = Math.min(BAR_CELLS, Math.round((percent / 100) * BAR_CELLS))
    const cells = parts.map(part => Math.round((part.tokens / (total || 1)) * filled))
    const color = levelColor(percent, PART_COLORS[0])

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text weight="semibold">Context</Text>
          <Box flexDirection="row">
            {total === 0 ? <Text color={color}>{'█'.repeat(filled)}</Text> : null}
            {cells.map((count, i) => (
              <Text color={PART_COLORS[i % PART_COLORS.length]}>{'█'.repeat(count)}</Text>
            ))}
            <Text dimColor>{'░'.repeat(Math.max(0, BAR_CELLS - (total === 0 ? filled : cells.reduce((sum, count) => sum + count, 0))))}</Text>
          </Box>
          <Text color={color} weight="semibold">
            {percent}%
          </Text>
          <Text dimColor>
            {short(value.tokens ?? 0)} / {short(value.window)}
          </Text>
        </Box>
        <Box flexDirection="row" gap={2}>
          {value.model === undefined ? null : <Text>{value.model.replace(/^claude-/, '')}</Text>}
          {value.usd === undefined ? null : <Text dimColor>~${value.usd.toFixed(2)}</Text>}
          {(value.limits ?? []).map(limit => (
            <Text color={levelColor(limit.percent, 'inactive')}>
              {limitName(limit)} {Math.round(limit.percent)}%{resetsIn(limit) === undefined ? '' : ` · ${resetsIn(limit)}`}
            </Text>
          ))}
        </Box>
        <Box flexDirection="row" gap={2}>
          {parts.map((part, i) => (
            <Box flexDirection="row" gap={1}>
              <Text color={PART_COLORS[i % PART_COLORS.length]}>●</Text>
              <Text dimColor>
                {part.name} {short(part.tokens)}
              </Text>
            </Box>
          ))}
        </Box>
      </Box>
    )
  })
}
