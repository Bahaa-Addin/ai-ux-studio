/** Writes docs/kb-standard.schema.json from the zod definition (the single source of truth). */
import fs from 'node:fs'
import path from 'node:path'

import * as z from 'zod/v4'

import { Manifest, Plan, STANDARD } from '#kb'
import { ROOT } from '#shared/config.ts'

const manifest = z.toJSONSchema(Manifest, { io: 'input' }) as Record<string, unknown>
const plan = z.toJSONSchema(Plan, { io: 'input' }) as Record<string, unknown>
fs.writeFileSync(path.join(ROOT, 'docs/kb-standard.schema.json'), JSON.stringify({ ...manifest, $id: `https://voice-guide.local/schemas/${STANDARD}.json`, title: `Site knowledge standard ${STANDARD}` }, null, 2) + '\n')
fs.writeFileSync(path.join(ROOT, 'docs/plan-contract.schema.json'), JSON.stringify({ ...plan, $id: 'https://voice-guide.local/schemas/plan-v1.json', title: 'Plan contract v1' }, null, 2) + '\n')
console.log('wrote docs/kb-standard.schema.json and docs/plan-contract.schema.json')
