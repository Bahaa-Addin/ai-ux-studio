import { createHash } from 'node:crypto'

import { checkIntegrity, type Issue } from './integrity.ts'
import { Manifest, type ManifestInput } from './manifest.ts'

export * from './manifest.ts'
export * from './plan.ts'
export * from './experience.ts'
export * from './commit.ts'
export { checkIntegrity, type Issue } from './integrity.ts'

export interface ValidationResult {
	ok: boolean
	manifest?: Manifest
	issues: Issue[]
}

/** Schema validation plus integrity checks. `ok` is false when there are errors. */
export function validateManifest(input: unknown): ValidationResult {
	const parsed = Manifest.safeParse(input)
	if (!parsed.success) {
		return {
			ok: false,
			issues: parsed.error.issues.map((i) => ({ level: 'error' as const, path: i.path.join('.'), message: i.message })),
		}
	}
	const issues = checkIntegrity(parsed.data)
	return { ok: !issues.some((i) => i.level === 'error'), manifest: parsed.data, issues }
}

/** Content hash of a manifest, ignoring its version block. Same content, same hash. */
export function manifestHash(m: Omit<ManifestInput, 'version'> | Manifest): string {
	const { version: _v, ...rest } = m as Manifest
	return createHash('sha256').update(stableStringify(rest)).digest('hex').slice(0, 16)
}

export function stableStringify(v: unknown): string {
	if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
	if (v && typeof v === 'object') {
		return `{${Object.keys(v)
			.sort()
			.filter((k) => (v as Record<string, unknown>)[k] !== undefined)
			.map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
			.join(',')}}`
	}
	return JSON.stringify(v)
}

/** Best text for a language: requested, then site default, then any. */
export function pick<T>(m: Partial<Record<string, T>> | undefined, lang: string, fallback?: string): T | undefined {
	if (!m) return undefined
	return m[lang] ?? (fallback ? m[fallback] : undefined) ?? Object.values(m).find((x) => x !== undefined)
}
