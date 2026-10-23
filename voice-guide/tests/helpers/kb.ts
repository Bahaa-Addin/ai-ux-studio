import fs from 'node:fs'
import path from 'node:path'

import YAML from 'yaml'

import type { Manifest } from '#kb'
import type { EvalCase } from '#services/router/eval.ts'
import { ROOT } from '#shared/config.ts'
import { buildKbIndex, type KbIndex } from '#shared/kb-index.ts'
import type { SessionState } from '#shared/store/index.ts'

export function fixtureManifest(): Manifest {
	return JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/demo-telco.manifest.json'), 'utf8'))
}

export function fixtureKb(): KbIndex {
	return buildKbIndex(fixtureManifest())
}

export function cases(file: string): EvalCase[] {
	return YAML.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures', file), 'utf8'))
}

export function emptySession(lang = 'ar'): SessionState {
	return { id: 'ses_test', siteId: 'demo-telco', lang, createdAt: '', updatedAt: '', turns: [], usage: { agentSteps: 0, agentTokens: 0 } }
}
