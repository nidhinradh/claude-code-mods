import { expect, test } from 'claude-code/testing'

const message = (text: string) =>
  ({
    plugin: 'email-hider',
    component: 'AssistantMessage',
    requestId: 'm1',
    props: { text, isFirstOfReply: true },
  }) as const

test('an address is drawn hidden, with the words around it kept', async ($, on) => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...message('# Contact\n\nWrite to sam@example.com today'), surface })

    const email = await ui.find({ type: 'Text', text: 'sam@example.com' })
    expect(email?.props.color).toBe('#4a4a4a')
    expect(email?.props.backgroundColor).toBe('#4a4a4a')
    expect((await ui.find({ type: 'Text', text: /Write to/ }))?.text).toBe('Write to ')
    expect((await ui.find({ type: 'Markdown', text: /Contact/ }))?.text).toMatch(/# Contact/)
    await ui.unmount()
  }
})

test('an address inside a code block is masked', async ($, on) => {
  const ui = await $.ui.mount({ ...message('```\nsam@example.com\n```'), surface: 'desktop' })

  expect((await ui.find({ type: 'Markdown' }))?.text).toBe('```\n•••@•••\n```')
  await ui.unmount()
})

test('a reply with no address goes to the engine unchanged', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({ ...message('Nothing private here'), surface: 'desktop' })

  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})
