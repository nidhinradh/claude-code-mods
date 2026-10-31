# Claude Code mods

Five small mods for [Claude Code](https://code.claude.com/docs/en/plugins/mods/overview.md), from the Instagram channel nidhin.explains. They help you avoid common mistakes, like sending a password to Claude by accident, and show you what your session is using.

| Mod | What it does |
| --- | --- |
| `token-meter` | A live card above the prompt: how full your context is, what fills it, estimated cost and plan limits |
| `send-guard` | Asks before common private details are sent to Claude, read by it, saved into a file, or sent elsewhere |
| `risky-guard` | Asks before commands like `rm -rf` and force pushes |
| `email-hider` | Hides email addresses in replies until you hover |
| `model-switcher` | Picks Haiku, Sonnet or Opus for a task, and stops switching once a chat gets long |

You need Claude Code 2.1.309 or later. Mods don't work in the Claude app or website.

## Install

Read the code first. Then run these in your terminal. They install for every project on your computer, and the mods load in your next session.

```bash
claude plugin marketplace add nidhinradh/claude-code-mods
```

```bash
claude plugin install token-meter@claude-code-mods
```

```bash
claude plugin install risky-guard@claude-code-mods
```

```bash
claude plugin install email-hider@claude-code-mods
```

```bash
claude plugin install model-switcher@claude-code-mods
```

```bash
claude plugin install send-guard@claude-code-mods
```

Install only the ones you want.

## Check send-guard works

Do this before relying on it, using a fake key.

1. Make an empty folder and go into it. Create `notes.txt` holding the line `OPENAI_API_KEY=fake-key-for-testing-only`.
2. Start `claude` there and ask: `Use the Read tool on notes.txt and quote the value`.
3. You should get a question before Claude sees the result. Choose **Don't show Claude**, and the value should stay hidden from it.
4. Delete the folder.

## Good to know

- **`model-switcher` overrides your model** in short chats. Send `/auto-model off` to turn it off for the session.
- **`send-guard` asks about some harmless things,** and asks every time data is uploaded with `curl`, `scp` or a connected app. Add client names with `/send-guard add <name>`.
- **`email-hider` only changes the screen.** Claude still has the real address.
- **`token-meter`'s cost is an estimate** at API prices. On a subscription it isn't what you pay.

## Limits

These catch common mistakes, not everything.

- They match patterns. They can't read images or judge meaning, and aliases, scripts, typos and unusual secrets can get past them.
- `send-guard` checks a tool's output after the tool has run. It can keep the output from Claude, but it can't undo the command.
- For a hard block, use [permission rules](https://code.claude.com/docs/en/permissions). A guard that matters shouldn't rest on these mods alone.
- Mods aren't sandboxed. They run with your permissions and can reach your files and the network, so read any mod before you trust it.
- The mods API can change between Claude Code releases, so a mod may need updating.

`send-guard`'s full pattern test file isn't in this repository, because its fake keys look like real ones to secret scanners. The other tests are here. Run them with `claude plugin test <mod folder>`.

## Turn them off

Disable or uninstall one in `/plugin`, or from your shell:

```bash
claude plugin uninstall send-guard@claude-code-mods
```

MIT licensed. Provided as is, with no guarantee.
