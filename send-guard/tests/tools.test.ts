import { expect, test } from 'claude-code/testing'

// Stands for the engine: every tool returns `output`, and $.ui.ask is a tool
// call of AskUserQuestion answered with `label`.
function engine(on: any, output: string, label: string) {
  const counts = { asked: 0, ran: 0 }

  on('store.get', () => ({ value: [] }))
  on('tool.call', (_: unknown, e: any) => {
    if (e.tool === 'AskUserQuestion') {
      counts.asked += 1

      return { result: { questions: e.questions, answers: { [e.questions[0].question]: label } } }
    }

    counts.ran += 1

    return { result: {}, text: output }
  })

  return counts
}

const SECRET_OUTPUT = [
  'OPENAI_API_KEY=abcdefghijkl',
  '     1\tOPENAI_API_KEY=abcdefghijkl',
  '1→OPENAI_API_KEY=abcdefghijkl',
  'app/.env:3:OPENAI_API_KEY=abcdefghijkl',
  'export DB_PASSWORD=hunter2hunter2',
  'config = { "password": "hunter2" }',
  'const token = "abcd1234efgh"',
  'sk-ant-api03-abcdefghijklmnop',
  '-----BEGIN OPENSSH PRIVATE KEY-----',
  'postgres://admin:hunter2@db.example.com/app',
]

const ORDINARY_OUTPUT = [
  'commit 3f2a9c1e\nAuthor: Sam <sam@example.com>',
  'const token = getToken()',
  'password = request.form.password',
  'build id 9876543210 took 12s',
  '"integrity": "sha512-Qz7mPx2LvK9nRt4WbY8sJf3HdG6cNa1E5uXoQz7mPx2LvK9nRt4WbY8sJf3HdG6cNa1E5uXo"',
  'postgres://localhost/app',
  'ENV=production',
]

for (const output of SECRET_OUTPUT) {
  test(`withholds: ${output.slice(0, 40)}`, async ($, on) => {
    const counts = engine(on, output, "Don't show Claude")

    const answer = await $.tool.call({ tool: 'Bash', command: 'cat config' })

    expect(counts.asked).toBe(1)
    expect(JSON.stringify(answer)).not.toContain(output)
  })
}

for (const output of ORDINARY_OUTPUT) {
  test(`asks nothing about: ${output.slice(0, 40)}`, async ($, on) => {
    const counts = engine(on, output, "Don't show Claude")

    await $.tool.call({ tool: 'Bash', command: 'cat config' })

    expect(counts.asked).toBe(0)
  })
}

test('the user can let a result through', async ($, on) => {
  const counts = engine(on, 'OPENAI_API_KEY=abcdefghijkl', 'Show Claude')

  const answer = await $.tool.call({ tool: 'Bash', command: 'cat config' })

  expect(counts.asked).toBe(1)
  expect(answer.deny).toBeUndefined()
})

test('a secret file is not read unless allowed', async ($, on) => {
  const counts = engine(on, 'nothing', "Don't show Claude")

  for (const file_path of ['/app/.env', '/app/.env.local', '/home/n/.ssh/id_rsa', '/app/server.pem']) {
    await $.tool.call({ tool: 'Read', file_path })
  }

  expect(counts.asked).toBe(4)
  expect(counts.ran).toBe(0)
})

test('an allowed secret file is read and not asked about twice', async ($, on) => {
  const counts = engine(on, 'OPENAI_API_KEY=abcdefghijkl', 'Show Claude')

  await $.tool.call({ tool: 'Read', file_path: '/app/.env' })

  expect(counts.asked).toBe(1)
  expect(counts.ran).toBe(1)
})

test('an ordinary file is read with no question', async ($, on) => {
  const counts = engine(on, 'hello', "Don't show Claude")

  for (const file_path of ['/app/README.md', '/app/.env.example', '/app/src/env.ts']) {
    await $.tool.call({ tool: 'Read', file_path })
  }

  expect(counts.asked).toBe(0)
  expect(counts.ran).toBe(3)
})

test('a tool outside the list goes through unchecked', async ($, on) => {
  const counts = engine(on, 'OPENAI_API_KEY=abcdefghijkl', "Don't show Claude")

  await $.tool.call({ tool: 'Edit', file_path: '/app/a.ts', old_string: 'a', new_string: 'b' })

  expect(counts.asked).toBe(0)
  expect(counts.ran).toBe(1)
})
