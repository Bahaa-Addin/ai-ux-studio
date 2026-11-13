/** Structured JSON logs, one line per event; every field cleaned like a trace (`clean.ts`; AGENTS.md 4.3). */
import { cleanAttrs } from './clean.ts'

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const
type Level = keyof typeof LEVELS

let threshold: number = LEVELS[(process.env.VG_LOG_LEVEL as Level) || 'info'] ?? LEVELS.info

export function setLogLevel(l: Level) {
	threshold = LEVELS[l]
}

export function log(level: Level, msg: string, fields: Record<string, unknown> = {}) {
	if (LEVELS[level] < threshold) return
	const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...cleanAttrs(fields, 1000) })
	if (level === 'error' || level === 'warn') console.error(line)
	else console.log(line)
}
