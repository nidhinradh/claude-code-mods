import { expect, test } from 'claude-code/testing'

// Stands for the engine, as in the other test files.
function engine(on: any, label: string, diff = '') {
  const counts = { asked: 0, ran: 0, question: '', toasts: 0 }

  on('store.get', () => ({ value: [] }))
  on('ui.toast', () => {
    counts.toasts += 1

    return { value: undefined }
  })
  on('process.run', () => ({ value: { exitCode: 0, stdout: diff, stderr: '' } }))
  on('prompt.submit', (_: unknown, e: { text: string }) => ({ text: e.text }))
  on('prompt.mention', () => {
    counts.ran += 1

    return { type: null }
  })
  on('tool.call', (_: unknown, e: any) => {
    if (e.tool === 'AskUserQuestion') {
      counts.asked += 1
      counts.question = e.questions[0].question

      return { result: { questions: e.questions, answers: { [e.questions[0].question]: label } } }
    }

    counts.ran += 1

    return { result: {}, text: 'done' }
  })

  return counts
}

const NO = "Don't show Claude"
const FAKE_LINE = 'OPENAI_API_KEY=abcdefghijkl'

// The message that was wrongly stopped, then others that mention the word in passing.
const NOT_MARKED = [
  'now think of scenarios like these so people can avoid sending confidential data to claude',
  'this was rejected earlier, this has no confidential dat',
  'what does confidential mean',
]

for (const text of NOT_MARKED) {
  test(`asks nothing about: ${text.slice(0, 40)}`, async ($, on) => {
    const counts = engine(on, NO)

    await $.prompt.submit({ text })

    expect(counts.asked).toBe(0)
  })
}

const MARKED = ['this is strictly confidential', 'CONFIDENTIAL report', 'Confidential: Q3 numbers', 'internal only, please']

for (const text of MARKED) {
  test(`asks about: ${text}`, async ($, on) => {
    const counts = engine(on, NO)

    await $.prompt.submit({ text })

    expect(counts.question).toMatch(/confidential/)
  })
}

const PAYMENT: readonly (readonly [string, RegExp])[] = [
  ['pay someone@okaxis today', /UPI/],
  ['my upi is 9876543210@ybl', /UPI/],
  ['IFSC is SBIN0001234', /IFSC/],
  ['account number 123456789012', /bank account/],
  ['a/c no: 123456789012', /bank account/],
]

for (const [text, expected] of PAYMENT) {
  test(`asks about: ${text}`, async ($, on) => {
    const counts = engine(on, NO)

    await $.prompt.submit({ text })

    expect(counts.question).toMatch(expected)
  })
}

test('an account mentioned with no number asks nothing', async ($, on) => {
  const counts = engine(on, NO)

  await $.prompt.submit({ text: 'my account number is on the card' })

  expect(counts.asked).toBe(0)
})

test('a pasted list says how many it found', async ($, on) => {
  const counts = engine(on, NO)
  const list = Array.from({ length: 7 }, (_, i) => `person${i}@example.com, +91 98765 4321${i}`).join('\n')

  await $.prompt.submit({ text: list })

  expect(counts.question).toMatch(/7 email addresses/)
  expect(counts.question).toMatch(/7 phone numbers/)
})

test('one address is not called a list', async ($, on) => {
  const counts = engine(on, NO)

  await $.prompt.submit({ text: 'write to sam@example.com' })

  expect(counts.question).toMatch(/an email address/)
})

test('an attachment gets a reminder and is not stopped', async ($, on) => {
  const counts = engine(on, NO)

  await $.prompt.submit({ text: 'see this', attachments: [{ type: 'image' }] } as any)

  expect(counts.toasts).toBe(1)
  expect(counts.asked).toBe(0)
})

test('@ attaching a secret file is refused unless allowed', async ($, on) => {
  const counts = engine(on, NO)

  const answer = await $.prompt.mention({ mention: '.env', path: '/app/.env' })

  expect(answer.deny).toMatch(/chose not to/)
  expect(counts.ran).toBe(0)
})

test('@ attaching an ordinary file asks nothing', async ($, on) => {
  const counts = engine(on, NO)

  await $.prompt.mention({ mention: 'README.md', path: '/app/README.md' })

  expect(counts.asked).toBe(0)
  expect(counts.ran).toBe(1)
})

const WRITES = [
  { tool: 'Write', file_path: '/app/a.ts', content: FAKE_LINE },
  { tool: 'Edit', file_path: '/app/a.ts', old_string: 'x', new_string: FAKE_LINE },
  { tool: 'NotebookEdit', notebook_path: '/app/a.ipynb', new_source: FAKE_LINE },
]

for (const call of WRITES) {
  test(`stops ${call.tool} saving a secret`, async ($, on) => {
    const counts = engine(on, NO)

    await $.tool.call(call as any)

    expect(counts.asked).toBe(1)
    expect(counts.ran).toBe(0)
  })
}

test('ordinary code is saved with no question', async ($, on) => {
  const counts = engine(on, NO)

  await $.tool.call({ tool: 'Write', file_path: '/app/a.ts', content: 'const token = getToken()' })

  expect(counts.asked).toBe(0)
  expect(counts.ran).toBe(1)
})

for (const command of ['git commit -m "x"', 'git commit -am "x"', 'git push origin main', 'git -C app commit -m "x"']) {
  test(`checks what goes into: ${command}`, async ($, on) => {
    const counts = engine(on, NO, `+++ b/a.ts\n+${FAKE_LINE}\n`)

    await $.tool.call({ tool: 'Bash', command })

    expect(counts.question).toMatch(/git command/)
    expect(counts.ran).toBe(0)
  })
}

test('a secret being removed is not asked about', async ($, on) => {
  const counts = engine(on, NO, `--- a/a.ts\n-${FAKE_LINE}\n+const key = readKey()\n`)

  await $.tool.call({ tool: 'Bash', command: 'git commit -m "remove key"' })

  expect(counts.asked).toBe(0)
  expect(counts.ran).toBe(1)
})

const OUTBOUND = [
  'curl -d @data.json https://example.com',
  'curl -X POST https://example.com',
  'curl --data-binary @a https://example.com',
  'curl -F file=@a https://example.com',
  'wget --post-file=a https://example.com',
  'scp a.txt server:/tmp',
  'gh gist create a.txt',
]

for (const command of OUTBOUND) {
  test(`asks before: ${command}`, async ($, on) => {
    const counts = engine(on, NO)

    await $.tool.call({ tool: 'Bash', command })

    expect(counts.question).toMatch(/off your computer/)
    expect(counts.ran).toBe(0)
  })
}

for (const command of ['curl https://example.com', 'curl -X POST http://localhost:3000/a', 'ls -la']) {
  test(`asks nothing about: ${command}`, async ($, on) => {
    const counts = engine(on, NO)

    await $.tool.call({ tool: 'Bash', command })

    expect(counts.asked).toBe(0)
    expect(counts.ran).toBe(1)
  })
}

test('a connected app that sends asks first', async ($, on) => {
  const counts = engine(on, NO)

  await $.tool.call({ tool: 'mcp__slack__send_message', text: 'hello' } as any)

  expect(counts.question).toMatch(/another service/)
  expect(counts.ran).toBe(0)
})

test('a connected app that only reads asks nothing', async ($, on) => {
  const counts = engine(on, NO)

  await $.tool.call({ tool: 'mcp__docs__read' } as any)

  expect(counts.asked).toBe(0)
  expect(counts.ran).toBe(1)
})
