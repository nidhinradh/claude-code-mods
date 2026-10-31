import type { Register } from 'claude-code'

// A safety net: it reads the command's text, so aliases, scripts and `$(...)`
// can get past it. Permission rules are the hard block.
const RISKY: readonly (readonly [RegExp, string])[] = [
  [/\brm\s+(-\S+\s+)*-\w*[rR]/, 'deletes a folder and everything in it'],
  [/\bgit\s+push\b.*(\s--force\b|\s--force-with-lease\b|\s-\w*f\b)/, 'overwrites history on the remote'],
  [/\bgit\s+reset\s+--hard\b/, 'throws away uncommitted work'],
  [/\bgit\s+clean\s+-\w*f/, 'deletes untracked files'],
  [/\bdrop\s+(table|database)\b/i, 'deletes database data'],
  [/\bmkfs\b|\bdd\s.*\bof=\/dev\//, 'can wipe a disk'],
]

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const match = RISKY.find(([pattern]) => pattern.test(e.command))

    if (match === undefined) {
      return next(e)
    }

    // Starts on the safe answer, so a dismissed question refuses the command.
    let answer = 'Cancel'

    try {
      answer = await $.ui.ask(`This ${match[1]}. Run it?\n\n${e.command}`, ['Cancel', 'Run it'])
    } catch {
      // Dismissed, or nobody is there to ask.
    }

    return answer === 'Run it'
      ? next(e)
      : { deny: 'The user cancelled this risky command. Ask before trying another way.' }
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: 'The risky command guard failed, so this command did not run.' },
  )
}
