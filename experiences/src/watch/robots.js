/**
 * The page watch's robots.txt rule (voice-guide ADR-0078 point 1 and 6; AGENTS §4.5): the crawler's own
 * (voice-guide/jobs/crawler/robots.ts, SPEC-04 §4), ported line for line because the layer cannot import
 * TypeScript from another package: the `User-agent: *` group (or one naming our agent), Allow and
 * Disallow with `*` and `$`, longest match wins, a tie goes to Disallow.
 * tests/watch-robots.test.mjs runs both over the same cases; change them together.
 */

/** { allow: string[], disallow: string[] } for `agent` from a robots.txt text. */
export function parseRobots(text, agent = '*') {
  const groups = []
  let current = null
  let lastWasAgent = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line)
    if (!m) continue
    const key = m[1].toLowerCase()
    const value = m[2].trim()
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
      continue
    }
    lastWasAgent = false
    if (!current) continue
    if (key === 'allow' && value) current.allow.push(value)
    if (key === 'disallow' && value) current.disallow.push(value)
  }
  const name = agent.toLowerCase()
  const own = groups.find((g) => g.agents.some((a) => a !== '*' && name.includes(a)))
  const star = groups.filter((g) => g.agents.includes('*'))
  const chosen = own ? [own] : star
  return { allow: chosen.flatMap((g) => g.allow), disallow: chosen.flatMap((g) => g.disallow) }
}

const toRegex = (rule) => {
  const anchored = rule.endsWith('$')
  const body = (anchored ? rule.slice(0, -1) : rule).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${body}${anchored ? '$' : ''}`)
}

/** True when `pathAndQuery` (for example `/en/cart?x=1`) may be fetched. */
export function robotsAllows(rules, pathAndQuery) {
  let best = { len: -1, allow: true }
  for (const r of rules.allow) if (toRegex(r).test(pathAndQuery) && r.length > best.len) best = { len: r.length, allow: true }
  for (const r of rules.disallow) if (toRegex(r).test(pathAndQuery) && r.length >= best.len) best = { len: r.length, allow: false }
  return best.allow
}
