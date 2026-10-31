import type { Register } from 'claude-code'

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
const FENCE = /^\s*(```|~~~)/
const MASK = '•••@•••'
const HIDDEN = '#4a4a4a'
const REVEALED = '#ffffff'

// Runs of plain lines stay Markdown; a line holding an address is drawn in parts.
type Chunk = { kind: 'markdown'; text: string } | { kind: 'emails'; line: string }

function chunksOf(text: string) {
  const chunks: Chunk[] = []
  let plain: string[] = []
  let isInFence = false

  for (const line of text.split('\n')) {
    if (FENCE.test(line)) {
      isInFence = !isInFence
    }

    // A code block can't be split, so an address in one is masked with no hover.
    if (isInFence || FENCE.test(line) || !line.match(EMAIL)) {
      plain.push(line.replace(EMAIL, MASK))
      continue
    }

    if (plain.length > 0) {
      chunks.push({ kind: 'markdown', text: plain.join('\n') })
      plain = []
    }

    chunks.push({ kind: 'emails', line })
  }

  if (plain.length > 0) {
    chunks.push({ kind: 'markdown', text: plain.join('\n') })
  }

  return chunks
}

export const register: Register = on => {
  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
    const { text } = e.props

    if (!text.match(EMAIL)) {
      return next(e)
    }

    // VS Code and mobile don't draw hover, so these only ever show the mask.
    if (e.surface !== 'terminal' && e.surface !== 'desktop') {
      return next({ ...e, props: { ...e.props, text: text.replace(EMAIL, MASK) } })
    }

    const { Box, Markdown, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {chunksOf(text).map((chunk, row) =>
          chunk.kind === 'markdown' ? (
            <Markdown text={chunk.text} />
          ) : (
            <Box flexDirection="row" flexWrap="wrap">
              {chunk.line.split(/([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/).map((part, column) =>
                column % 2 === 0 ? (
                  <Text>{part}</Text>
                ) : (
                  // Raw colours, since the theme's names didn't hide the text
                  // in the Desktop app.
                  <Text
                    color={HIDDEN}
                    backgroundColor={HIDDEN}
                    hover={{ scope: `email-${row}-${column}`, color: REVEALED }}
                  >
                    {part}
                  </Text>
                ),
              )}
            </Box>
          ),
        )}
      </Box>
    )
  })
}
