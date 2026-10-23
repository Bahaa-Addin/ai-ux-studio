/**
 * Minimal robots.txt support for the crawlers (SPEC-04 §4): the `User-agent: *` group (or one
 * naming our agent), Allow and Disallow with `*` and `$`, longest match wins. Pure: bundled
 * into the in-browser crawler too.
 */

export interface RobotsRules {
	allow: string[]
	disallow: string[]
}

export function parseRobots(text: string, agent = '*'): RobotsRules {
	const groups: { agents: string[]; allow: string[]; disallow: string[] }[] = []
	let current: (typeof groups)[number] | null = null
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

function toRegex(rule: string): RegExp {
	const anchored = rule.endsWith('$')
	const body = (anchored ? rule.slice(0, -1) : rule).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
	return new RegExp(`^${body}${anchored ? '$' : ''}`)
}

/** True when `pathAndQuery` (for example `/en/cart?x=1`) may be crawled. */
export function robotsAllows(rules: RobotsRules, pathAndQuery: string): boolean {
	let best = { len: -1, allow: true }
	for (const r of rules.allow) if (toRegex(r).test(pathAndQuery) && r.length > best.len) best = { len: r.length, allow: true }
	for (const r of rules.disallow) if (toRegex(r).test(pathAndQuery) && r.length >= best.len) best = { len: r.length, allow: false }
	return best.allow
}
