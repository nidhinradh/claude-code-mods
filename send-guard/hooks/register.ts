import type { EngineInterface, Register } from 'claude-code'

// Patterns only: details in images, or with no recognisable shape, get past it.
// The question names what it found and never repeats the value.
const PRIVATE: readonly (readonly [RegExp, string])[] = [
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/, 'an email address'],

  // Phone numbers: any international number, then the common national shapes.
  // A bare 10 digits starting with 1 is left out, as that's usually a timestamp.
  [/(?<![\w.])(?:\+|00)[1-9](?:[\s().-]?\d){7,14}(?![\w.])/, 'a phone number'],
  [/(?<![\w.])(?:[2-9]\d{9}|1[2-9]\d{9}|0\d{9,10})(?![\w.])/, 'a phone number'],
  [/(?<![\w.])(?:\(\d{2,5}\)[\s.-]?\d{3,4}[\s.-]?\d{3,4}|[2-9]\d{2}[\s.-]\d{3}[\s.-]\d{4}|[6-9]\d{4}[\s-]\d{5})(?![\w.])/, 'a phone number'],

  // Known API key and token formats.
  [
    /(?<![\w-])(?:sk-ant-[\w-]{16,}|sk-[\w-]{16,}|sk_[a-f0-9]{32,}|(?:sk|rk|pk)_(?:live|test)_\w{16,}|gh[pousr]_\w{20,}|github_pat_\w{20,}|glpat-[\w-]{16,}|xox[abeprs]-[\w-]{10,}|(?:AKIA|ASIA)[A-Z0-9]{16}|AIza[\w-]{30,}|ya29\.[\w-]{20,}|SG\.[\w-]{16,}\.[\w-]{16,}|npm_\w{30,}|pypi-[\w-]{30,}|hf_\w{30,}|r8_\w{30,}|gsk_\w{30,}|xai-\w{30,}|pplx-\w{30,}|apify_api_\w{20,}|rzp_(?:live|test)_\w{10,}|shp(?:at|ss|ca|pa)_\w{20,}|dop_v1_\w{30,}|ntn_\w{30,}|secret_\w{30,}|lin_api_\w{20,}|key-[a-f0-9]{32}|\d{6,12}:AA[\w-]{30,})(?![\w-])/,
    'an API key',
  ],
  [/hooks\.slack\.com\/services\/\S+|discord(?:app)?\.com\/api\/webhooks\/\S+/, 'a webhook address'],

  // Private keys and tokens.
  [/-----BEGIN [A-Z ]*PRIVATE KEY/, 'a private key'],
  [/\beyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{5,}/, 'a login token'],
  [/\b[Bb]earer\s+[\w.~+/-]{16,}/, 'a login token'],
  [/\b(?:api[_-]?key|api[_-]?secret|secret[_-]?key|client[_-]?secret|access[_-]?key|access[_-]?token|auth[_-]?token|aws_secret_access_key|token|secret)\b["']?\s*[:=]\s*["']?\S{8,}/i, 'a secret'],

  // Passwords, written out or inside an address.
  [/\b(?:password|passwd|passphrase|passcode|pwd)\b["']?\s*(?:[:=]|is\b)\s*["']?\S+/i, 'a password'],
  [/പാസ്\S*വേഡ്/, 'a password'],
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]*:[^\s/@]+@/i, 'a password in an address'],

  // Database addresses, other than one on this computer.
  [/\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqps?|mssql|sqlserver):\/\/(?!(?:localhost|127\.0\.0\.1)\b)\S+/i, 'a database address'],

  // Payment details. A bare account number looks like any long number, so it
  // needs its label.
  [/(?<![\w.-])[\w.-]{2,}@(?:ok(?:axis|sbi|hdfcbank|icici)|ybl|ibl|axl|apl|yapl|paytm|upi|sbi|icici|hdfcbank|axisbank|kotak|yesbank|federal|fbl|jupiteraxis|pt(?:hdfc|sbi|yes|axis))(?![\w.-])/i, 'a UPI ID'],
  [/\b[A-Z]{4}0[A-Z0-9]{6}\b/, 'an IFSC code'],
  [/(?:\ba\/c(?:\s*no)?|\baccount\s*(?:no|num(?:ber)?)|\bacc\s*(?:no|num(?:ber)?))\b\.?\s*(?:is\s*|[:=#-]\s*)?\d{9,18}\b/i, 'a bank account number'],

  // Identity numbers. Cards are checked separately.
  [/(?<![\w.-])[2-9]\d{3}[\s-]\d{4}[\s-]\d{4}(?![\w.-])/, 'an Aadhaar number'],
  [/\b[A-Z]{3}[PCHFATBLJG][A-Z]\d{4}[A-Z]\b/, 'a PAN number'],

  // Words that usually mark something as private. Patterns can't judge meaning,
  // so client names and the like go on the user's own list.
  [/\b(?:(?:this|it|that|these)\s+(?:is|are)\s+(?:strictly\s+)?confidential|strictly confidential|internal only|do not share|don't share|trade secret|business plan|pitch deck|term sheet|under embargo|salary)\b/i, 'something marked confidential'],
  [/\bconfidential\s*[:–-]/i, 'something marked confidential'],
  [/\bCONFIDENTIAL\b/, 'something marked confidential'],
  [/\bNDA\b/, 'something marked confidential'],
]

// What a tool returns is held to a stricter list. Code and logs are full of
// emails, long numbers and words like `token = getToken()`, so asking about those
// would interrupt nearly every command. Only secrets with a clear shape count.
const IN_TOOL_OUTPUT: readonly (readonly [RegExp, string])[] = [
  ...PRIVATE.filter(([, name]) =>
    ['an API key', 'a webhook address', 'a private key', 'a login token', 'a password in an address', 'a database address', 'an Aadhaar number', 'a PAN number'].includes(name),
  ),
  [/\b(?:api[_-]?key|api[_-]?secret|secret[_-]?key|client[_-]?secret|access[_-]?key|access[_-]?token|auth[_-]?token|aws_secret_access_key|token|secret)\b["']?\s*[:=]\s*["'][^"'\s]{8,}["']/i, 'a secret'],
  [/\b(?:password|passwd|passphrase|pwd)\b["']?\s*[:=]\s*["'][^"'\s]{4,}["']/i, 'a password'],
  // Read numbers its lines and Grep prefixes the path, so the name may not start one.
  [/(?:^|[\s:→|])(?:export\s+)?[A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|PWD)[A-Z0-9_]*=[^\s$"'][^\s]{5,}\s*$/m, 'a secret'],
]

const SECRET_FILE = /(?:^|\/)(?:\.env(?:\.(?!example$|sample$|template$)[\w.-]+)?|\.npmrc|\.pypirc|\.netrc|credentials(?:\.json)?|id_(?:rsa|dsa|ecdsa|ed25519)|[^/]+\.(?:pem|key|p12|pfx))$/

// Edits between two words, counting swapped neighbours as one.
function editDistance(a: string, b: string) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)])
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost)

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1)
      }
    }
  }

  return rows[a.length][b.length]
}

// Catches "passwors us x" and "pasword: x". Real words this close are left out.
function hasMisspeltPassword(text: string) {
  const labelled = /(\p{L}{5,11})["']?\s*(?:[:=]|(?:is|iz|si|us|was)(?!\p{L}))\s*["']?\S+/giu

  return [...text.matchAll(labelled)].some(([, word]) => {
    const lower = word.toLowerCase()

    return lower !== 'passport' && editDistance(lower, 'password') <= 2
  })
}

function isCardNumber(digits: string) {
  let sum = 0

  for (let i = 0; i < digits.length; i += 1) {
    const digit = Number(digits[digits.length - 1 - i])
    const doubled = i % 2 === 1 ? digit * 2 : digit
    sum += doubled > 9 ? doubled - 9 : doubled
  }

  return sum % 10 === 0
}

function hasCardNumber(text: string) {
  return (text.match(/(?<![\w.])\d(?:[ -]?\d){12,18}(?![\w.])/g) ?? []).some(match =>
    isCardNumber(match.replace(/\D/g, '')),
  )
}

// Catches keys in no known format: long, random and mixing letter case and digits.
function hasRandomKey(text: string) {
  return (text.match(/[A-Za-z0-9+_=-]{32,}/g) ?? []).some(word => {
    if (!/[a-z]/.test(word) || !/[A-Z]/.test(word) || !/\d/.test(word)) {
      return false
    }

    const counts = new Map<string, number>()
    for (const char of word) {
      counts.set(char, (counts.get(char) ?? 0) + 1)
    }

    let entropy = 0
    for (const count of counts.values()) {
      const share = count / word.length
      entropy -= share * Math.log2(share)
    }

    return entropy >= 4
  })
}

// A pasted list is a bigger mistake than one address, so the question says so.
const BULK_LIST_FROM = 5

// Rules can overlap on one number, so matches that touch count once.
function countOf(text: string, name: string) {
  const spans = PRIVATE.filter(([, itemName]) => itemName === name)
    .flatMap(([pattern]) => [...text.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))])
    .map(match => [match.index, match.index + match[0].length] as const)
    .sort((a, b) => a[0] - b[0])

  let count = 0
  let end = -1

  for (const [from, to] of spans) {
    if (from >= end) {
      count += 1
    }

    end = Math.max(end, to)
  }

  return count
}

function escaped(word: string) {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function wordsOf($: EngineInterface) {
  const stored = await $.store.get('words')

  return Array.isArray(stored) ? stored.filter((word): word is string => typeof word === 'string') : []
}

async function findIn($: EngineInterface, text: string) {
  const found = new Set(PRIVATE.filter(([pattern]) => pattern.test(text)).map(([, name]) => name))

  for (const [name, plural] of [['an email address', 'email addresses'], ['a phone number', 'phone numbers']] as const) {
    const count = countOf(text, name)

    if (count >= BULK_LIST_FROM) {
      found.delete(name)
      found.add(`${count} ${plural}`)
    }
  }

  if (hasMisspeltPassword(text)) {
    found.add('a password')
  }

  if (hasCardNumber(text)) {
    found.add('a card number')
  }

  if (hasRandomKey(text)) {
    found.add('what looks like a secret key')
  }

  for (const word of await wordsOf($)) {
    if (new RegExp(`(?<![\\p{L}\\p{N}])${escaped(word)}(?![\\p{L}\\p{N}])`, 'iu').test(text)) {
      found.add('a word on your private list')
    }
  }

  return [...found]
}

async function findInToolOutput($: EngineInterface, text: string) {
  const found = new Set(IN_TOOL_OUTPUT.filter(([pattern]) => pattern.test(text)).map(([, name]) => name))

  for (const word of await wordsOf($)) {
    if (new RegExp(`(?<![\\p{L}\\p{N}])${escaped(word)}(?![\\p{L}\\p{N}])`, 'iu').test(text)) {
      found.add('a word on your private list')
    }
  }

  return [...found]
}

// Only an explicit yes lets it through. A dismissed question counts as no.
async function allowsTool($: EngineInterface, question: string, no = "Don't show Claude", yes = 'Show Claude') {
  try {
    return (await $.ui.ask(question, [no, yes])) === yes
  } catch {
    return false
  }
}

const HIDDEN_ARGS = '(hidden)'

export const register: Register = on => {
  // A message the user chose to resend after the question couldn't be shown.
  let allowedText: string | null = null

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'send-guard',
      description: 'Keep a private list of words the send guard asks about, such as client names',
      argumentHint: 'add <word> | remove <word> | list',
    })

    return next(e)
  })

  // The command's line is kept in the conversation, where Claude can read it, so
  // the words on the list are swapped out here, before it's recorded.
  let realArgs = ''

  on('command.run', { command: 'send-guard' }, ($, e, next) => {
    realArgs = e.args

    return next({ ...e, args: HIDDEN_ARGS })
  })

  on('command.run', { command: 'send-guard', args: HIDDEN_ARGS }, async ($, e) => {
    const [action = 'list', ...rest] = realArgs.trim().split(/\s+/)
    const word = rest.join(' ')
    const words = await wordsOf($)

    if (action === 'add' && word !== '') {
      await $.store.set('words', [...new Set([...words, word])])

      return { text: 'Added to your private list.' }
    }

    if (action === 'remove' && word !== '') {
      await $.store.set('words', words.filter(item => item.toLowerCase() !== word.toLowerCase()))

      return { text: 'Removed from your private list.' }
    }

    return { text: words.length === 0 ? 'Your private list is empty.' : `Your private list has ${words.length} entries.` }
  })

  // Subagents' tool calls come through here too. Images aren't checked.
  on('tool.call', { tool: /^(?:Read|Bash|BashOutput|Grep|Glob|WebFetch|WebSearch|NotebookRead|mcp__.*)$/ }, async ($, e, next) => {
    const path = e.tool === 'Read' ? e.file_path : undefined
    let isApproved = false

    if (path !== undefined && SECRET_FILE.test(path)) {
      isApproved = await allowsTool($, `Claude wants to read ${path}, which usually holds secrets. Allow it?`)

      if (!isApproved) {
        return { deny: `The user did not allow reading ${path}. Don't try to read it another way.` }
      }
    }

    const ran = await next(e)

    if (isApproved || ran.deny !== undefined || ran.text === undefined) {
      return ran
    }

    const found = await findInToolOutput($, ran.text)

    if (found.length === 0 || (await allowsTool($, `${String(e.tool)} returned ${found.join(', ')}. Show it to Claude?`))) {
      return ran
    }

    return { deny: `The output held ${found.join(', ')}, so the user kept it from you. Don't try to get it another way.` }
  }).catch(() => ({ deny: 'The send guard failed, so this result was kept from Claude.' }))

  on('prompt.mention', async ($, e, next) => {
    if (!SECRET_FILE.test(e.path) || (await allowsTool($, `Your message attaches ${e.mention}, which usually holds secrets. Show it to Claude?`, "Don't attach", 'Attach it'))) {
      return next(e)
    }

    return { deny: `You chose not to show ${e.mention} to Claude.` }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'The send guard failed, so this file was not attached.' }))

  // Claude saving a secret into a file, where it can end up committed.
  on('tool.call', { tool: ['Write', 'Edit', 'NotebookEdit'] }, async ($, e, next) => {
    const written = e.tool === 'Write' ? e.content : e.tool === 'Edit' ? e.new_string : e.new_source
    const found = await findInToolOutput($, written)
    const path = e.tool === 'NotebookEdit' ? e.notebook_path : e.file_path

    if (found.length === 0 || (await allowsTool($, `Claude is about to save ${found.join(', ')} into ${path}. Allow it?`, "Don't save", 'Save it'))) {
      return next(e)
    }

    return { deny: `The text held ${found.join(', ')}, so the user stopped this write. Use an environment variable instead.` }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'The send guard failed, so this file was not changed.' }))

  // Commits and pushes: checks only lines being added, from the session's folder.
  on('tool.call', { tool: 'Bash', command: /\bgit\b.*\b(?:commit|push)\b/ }, async ($, e, next) => {
    const argv = /\bpush\b/.test(e.command)
      ? ['git', 'log', '-p', '--format=', '@{upstream}..HEAD']
      : /\bcommit\b.*\s-\w*a/.test(e.command)
        ? ['git', 'diff', 'HEAD']
        : ['git', 'diff', '--cached']
    const diff = await $.process.run(argv)
    const added = diff.stdout
      .split('\n')
      .filter(line => line.startsWith('+') && !line.startsWith('+++'))
      .map(line => line.slice(1))
      .join('\n')
    const found = await findInToolOutput($, added)

    if (found.length === 0 || (await allowsTool($, `This git command would include ${found.join(', ')}. Run it?`, 'Cancel', 'Run it'))) {
      return next(e)
    }

    return { deny: `The change holds ${found.join(', ')}, so the user stopped this. Remove it before committing.` }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'The send guard failed, so this git command did not run.' }))

  // Data leaving this computer. Asks every time, as it can't tell what matters.
  on('tool.call', { tool: 'Bash', command: /\b(?:curl|wget|xh)\b[^|;&]*(?:\s-d\b|\s--data|\s-F\b|\s--form|\s-T\b|\s--upload-file|\s-X\s*(?:POST|PUT|PATCH)|\s--request\s+(?:POST|PUT|PATCH)|\s--post-)|\b(?:scp|sftp|ncat|nc)\s|\bgh\s+gist\s+create\b/ }, async ($, e, next) => {
    if (/\b(?:localhost|127\.0\.0\.1)\b/.test(e.command) || (await allowsTool($, `This command sends data off your computer:\n\n${e.command.slice(0, 300)}\n\nRun it?`, 'Cancel', 'Send it'))) {
      return next(e)
    }

    return { deny: 'The user stopped this command from sending data out.' }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'The send guard failed, so this command did not run.' }))

  on('tool.call', { tool: /^mcp__.*(?:send|post|message|reply|publish|upload|share|email|comment)/i }, async ($, e, next) => {
    if (await allowsTool($, `${String(e.tool)} sends data to another service. Allow it?`, 'Cancel', 'Send it')) {
      return next(e)
    }

    return { deny: 'The user stopped this tool from sending data out.' }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'The send guard failed, so this tool did not run.' }))

  on('prompt.submit', async ($, e, next) => {
    // The command's own line holds the word being added, so it isn't asked about.
    if (e.isMeta === true || e.command?.name === 'send-guard') {
      return next(e)
    }

    if ((e.attachments?.length ?? 0) > 0) {
      $.ui.toast("The send guard can't read images. Check this one holds nothing private.")
    }

    const found = await findIn($, e.text)

    if (found.length === 0 || e.text === allowedText) {
      allowedText = null

      return next(e)
    }

    let answer: string

    try {
      answer = await $.ui.ask(`Your message contains ${found.join(', ')}. Send it to Claude?`, [
        "Don't send",
        'Send anyway',
      ])
    } catch {
      // Dismissed, or no question can be shown here. Nothing has been sent.
      allowedText = e.text

      return { drop: `This message contains ${found.join(', ')}. Press Enter again to send it anyway.` }
    }

    return answer === 'Send anyway' ? next(e) : { drop: 'Not sent. Edit your message and send it again.' }
  }).catch(($, e, next) =>
    next.called ? next(e) : { drop: 'The send guard failed, so this message was not sent.' },
  )
}
