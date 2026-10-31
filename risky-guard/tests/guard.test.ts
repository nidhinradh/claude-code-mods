import { expect, test } from 'claude-code/testing'

const RISKY = [
  'rm -rf build',
  'rm -r build',
  'rm -f -r build',
  'git push --force origin main',
  'git push -f',
  'git reset --hard HEAD~1',
  'git clean -fd',
  'psql -c "DROP TABLE users"',
]

const SAFE = ['ls -la', 'rm notes.txt', 'git push origin main', 'git reset HEAD file.txt', 'npm test']

// Stands for the engine: $.ui.ask is a tool call of AskUserQuestion, and the
// answer it gets back is the label given here.
function engine(on: any, label: string) {
  const counts = { asked: 0, ran: 0 }

  on('tool.call', (_: unknown, e: any) => {
    if (e.tool === 'AskUserQuestion') {
      counts.asked += 1

      return { result: { questions: e.questions, answers: { [e.questions[0].question]: label } } }
    }

    counts.ran += 1

    return { result: {} }
  })

  return counts
}

test('a risky command is cancelled unless the user allows it', async ($, on) => {
  const counts = engine(on, 'Cancel')

  for (const command of RISKY) {
    await $.tool.call({ tool: 'Bash', command })
  }

  expect(counts.asked).toBe(RISKY.length)
  expect(counts.ran).toBe(0)
})

test('a risky command runs once the user allows it', async ($, on) => {
  const counts = engine(on, 'Run it')

  await $.tool.call({ tool: 'Bash', command: 'rm -rf build' })

  expect(counts.ran).toBe(1)
})

test('an everyday command asks nothing', async ($, on) => {
  const counts = engine(on, 'Cancel')

  for (const command of SAFE) {
    await $.tool.call({ tool: 'Bash', command })
  }

  expect(counts.ran).toBe(SAFE.length)
  expect(counts.asked).toBe(0)
})
