import type { Limit, Meter } from '../types'

const COLORS = {
  card: '#1d1927',
  track: '#35303c',
  text: '#f4eff0',
  muted: '#afa5a6',
  warning: '#f5c451',
  error: '#ff6b6b',
}

// Biggest part first, in the Freebuff Plum theme's colours.
export const PART_COLORS = ['#ffb38b', '#d66a5e', '#a74c69', '#7c5a9e', '#afa5a6']

const WIDTH = 640
const PADDING = 20
const TITLE_SIZE = 19
const TEXT_SIZE = 15
const BAR_HEIGHT = 12
const ROW_HEIGHT = 26
const FONT = '-apple-system, BlinkMacSystemFont, system-ui, sans-serif'

const LIMIT_NAMES: Readonly<Record<string, string>> = {
  five_hour: '5h',
  seven_day: 'Week',
  spend_limit: 'Spend',
}

export function short(tokens: number) {
  return tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : String(tokens)
}

export function levelColor(percent: number, normal: string) {
  return percent >= 90 ? COLORS.error : percent >= 70 ? COLORS.warning : normal
}

export function limitName(limit: Limit) {
  return LIMIT_NAMES[limit.kind] ?? limit.kind
}

export function resetsIn(limit: Limit) {
  const ms = limit.resetsInMs

  if (ms === undefined || ms <= 0) {
    return undefined
  }

  const hours = ms / 3_600_000

  return hours >= 24 ? `${Math.round(hours / 24)}d` : hours >= 1 ? `${Math.round(hours)}h` : `${Math.ceil(ms / 60_000)}m`
}

function escapeXml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function label(x: number, y: number, text: string, fill: string, size = TEXT_SIZE, extra = '') {
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" ${extra}>${escapeXml(text)}</text>`
}

// A rough width, enough to space items along a row.
function widthOf(text: string, size = TEXT_SIZE) {
  return text.length * size * 0.56
}

// The bar is split by what fills the context, scaled to the real percent used.
function segments(value: Meter, percent: number, barWidth: number) {
  const parts = value.parts ?? []
  const total = parts.reduce((sum, part) => sum + part.tokens, 0)
  const usedWidth = (Math.min(percent, 100) / 100) * barWidth

  if (total === 0) {
    return `<rect x="0" y="0" width="${usedWidth}" height="${BAR_HEIGHT}" fill="${PART_COLORS[0]}"/>`
  }

  let x = 0

  return parts
    .map((part, i) => {
      const width = (part.tokens / total) * usedWidth
      const rect = `<rect x="${x}" y="0" width="${width}" height="${BAR_HEIGHT}" fill="${PART_COLORS[i % PART_COLORS.length]}"/>`
      x += width

      return rect
    })
    .join('')
}

// Wraps to another row rather than running off the card.
function legend(value: Meter, top: number) {
  let x = PADDING
  let y = top
  const items = (value.parts ?? []).map((part, i) => {
    const text = `${part.name} ${short(part.tokens)}`
    const width = 18 + widthOf(text) + 18

    if (x > PADDING && x + width > WIDTH - PADDING) {
      x = PADDING
      y += ROW_HEIGHT
    }

    const item =
      `<circle cx="${x + 6}" cy="${y - 5}" r="6" fill="${PART_COLORS[i % PART_COLORS.length]}"/>` +
      label(x + 18, y, text, COLORS.muted)
    x += width

    return item
  })

  return { markup: items.join(''), bottom: y }
}

// Right-aligned small gauges, one per plan limit.
function limitGauges(limits: readonly Limit[], y: number) {
  let right = WIDTH - PADDING

  return limits
    .slice()
    .reverse()
    .map(limit => {
      const reset = resetsIn(limit)
      const after = `${Math.round(limit.percent)}%${reset === undefined ? '' : `, ${reset} left`}`
      const name = limitName(limit)
      const gauge = 56
      const afterWidth = widthOf(after)
      const nameWidth = widthOf(name)
      const left = right - afterWidth - 8 - gauge - 8 - nameWidth
      const barX = left + nameWidth + 8
      const fill = (Math.min(limit.percent, 100) / 100) * gauge
      const item =
        label(left, y, name, COLORS.muted) +
        `<rect x="${barX}" y="${y - 11}" width="${gauge}" height="9" rx="4.5" fill="${COLORS.track}"/>` +
        `<rect x="${barX}" y="${y - 11}" width="${fill}" height="9" rx="4.5" fill="${levelColor(limit.percent, PART_COLORS[0])}"/>` +
        label(barX + gauge + 8, y, after, COLORS.muted)
      right = left - 16

      return item
    })
    .join('')
}

export function meterSvg(value: Meter) {
  const percent = value.percent ?? 0
  const barWidth = WIDTH - PADDING * 2
  const model = value.model?.replace(/^claude-/, '') ?? ''
  const cost = value.usd === undefined ? '' : `~$${value.usd.toFixed(2)}`
  const barY = 44
  const parts = legend(value, barY + BAR_HEIGHT + 28)
  const hasLegend = (value.parts ?? []).length > 0
  const metricsY = (hasLegend ? parts.bottom : barY + BAR_HEIGHT) + 34
  const height = metricsY + 20
  const pillWidth = widthOf(model) + 22

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH}" height="${height}" font-family="${FONT}">` +
    `<rect width="${WIDTH}" height="${height}" rx="14" fill="${COLORS.card}"/>` +
    label(PADDING, 32, 'Context', COLORS.text, TITLE_SIZE, 'font-weight="600"') +
    `<text x="${WIDTH - PADDING}" y="32" text-anchor="end" font-size="${TITLE_SIZE}">` +
    `<tspan fill="${levelColor(percent, PART_COLORS[0])}" font-weight="600">${percent}%</tspan>` +
    `<tspan fill="${COLORS.muted}" dx="10">${short(value.tokens ?? 0)} / ${short(value.window)}</tspan></text>` +
    `<clipPath id="bar"><rect width="${barWidth}" height="${BAR_HEIGHT}" rx="${BAR_HEIGHT / 2}"/></clipPath>` +
    `<g transform="translate(${PADDING} ${barY})" clip-path="url(#bar)">` +
    `<rect width="${barWidth}" height="${BAR_HEIGHT}" fill="${COLORS.track}"/>${segments(value, percent, barWidth)}</g>` +
    parts.markup +
    (model === ''
      ? ''
      : `<rect x="${PADDING}" y="${metricsY - 17}" width="${pillWidth}" height="24" rx="12" fill="${COLORS.track}"/>` +
        label(PADDING + 11, metricsY, model, COLORS.text)) +
    (cost === '' ? '' : label(PADDING + pillWidth + 12, metricsY, cost, COLORS.muted)) +
    limitGauges(value.limits ?? [], metricsY) +
    '</svg>'
  )
}

export function meterAlt(value: Meter) {
  const limits = (value.limits ?? []).map(limit => `${limitName(limit)} limit ${Math.round(limit.percent)}%`)

  return [`Context ${value.percent ?? 0}% full`, value.model, ...limits].filter(Boolean).join(', ')
}
