/**
 * What changed between two knowledge-base versions, for the people who review a held sync
 * (SPEC-04 §5; ADR-0049 §6): a destination whose id is gone is either the same place under a new
 * name (its page, kind and label or locator still match one that appeared) or a place that is no
 * longer found. The reports list the two apart, so a rename is never mistaken for a loss, nor a loss
 * hidden among renames.
 */
import type { Manifest } from '#kb'

type Destination = Manifest['destinations'][number]

export interface Rename {
	from: string
	to: string
	/** How the two were matched: the same label, the same place in a renamed list, or (no label, or the very same labels) the same locator inside its portlet, in page order. */
	by: 'label' | 'parent' | 'locator'
}

export interface KbDiff {
	added: string[]
	removed: string[]
	/** Removed ids that are the same place under a new name. */
	renamed: Rename[]
	/** Removed ids with no counterpart: places the new version no longer has. */
	lost: string[]
	/** Added ids with no counterpart: places the old version did not have. */
	fresh: string[]
}

const norm = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()
const labelsOf = (d: Destination) => new Set(Object.values(d.labels || {}).flatMap((l) => (l || []).map(norm)).filter(Boolean))
const shares = (a: Set<string>, b: Set<string>) => [...a].some((x) => b.has(x))
/** A locator without the step that says which portlet it is in (the column's nth portlet, or the portlet's id). */
const tail = (d: Destination) => (d.target?.css?.[0] || '').replace(/^.*?div\.portlet-boundary[^>]*> /, '').replace(/^#p_p_id_\w+ > /, '')

export function diffKb(active: Manifest, next: Manifest): KbDiff {
	const before = new Map(active.destinations.map((d) => [d.id, d]))
	const after = new Map(next.destinations.map((d) => [d.id, d]))
	const removed = active.destinations.filter((d) => !after.has(d.id))
	const added = next.destinations.filter((d) => !before.has(d.id))
	const renamed: Rename[] = []
	const gone = new Set(removed)
	const come = new Set(added)
	const pair = (from: Destination, to: Destination, by: Rename['by']) => {
		renamed.push({ from: from.id, to: to.id, by })
		gone.delete(from)
		come.delete(to)
	}
	const same = (a: Destination, b: Destination) => a.pageId === b.pageId && a.kind === b.kind
	const match = (kinds: (d: Destination) => boolean) => {
		// The same label, on the same page, for the same kind of thing: one candidate on each side.
		for (const from of [...gone].filter(kinds)) {
			const mine = labelsOf(from)
			if (!mine.size) continue
			const labelled = [...come].filter((to) => same(from, to) && shares(mine, labelsOf(to)))
			// Several with that label (three lists headed alike): the one at the same place in its portlet.
			const here = labelled.filter((to) => tail(to) === tail(from))
			const pool = here.length ? here : labelled
			if (pool.length !== 1) continue
			const to = pool[0]
			const rivals = [...gone].filter((other) => same(other, to) && shares(labelsOf(other), labelsOf(to)) && (!here.length || tail(other) === tail(to)))
			if (rivals.length === 1) pair(from, to, 'label')
		}
		// What is left: no label, or twins with the very same labels (three lists headed alike). The
		// same locator inside the portlet, as many gone as come, in page order. Two labels that differ
		// are two places, never a pair.
		const groups = new Map<string, { from: Destination[]; to: Destination[] }>()
		const key = (d: Destination) => `${d.pageId}\n${d.kind}\n${tail(d)}\n${[...labelsOf(d)].sort().join('|')}`
		for (const d of [...gone].filter(kinds)) groups.set(key(d), { from: [...(groups.get(key(d))?.from || []), d], to: groups.get(key(d))?.to || [] })
		for (const d of [...come].filter(kinds)) if (groups.has(key(d))) groups.get(key(d))!.to.push(d)
		for (const g of groups.values()) if (tail(g.from[0]) && g.from.length === g.to.length) g.from.forEach((from, i) => pair(from, g.to[i], 'locator'))
	}
	match((d) => d.kind !== 'item')
	// A card of a renamed list is the same card: same place in the list.
	const parents = new Map(renamed.map((r) => [r.from, r.to]))
	for (const from of [...gone].filter((d) => d.kind === 'item')) {
		const parent = [...parents.keys()].filter((p) => from.id.startsWith(`${p}.`)).sort((a, b) => b.length - a.length)[0]
		const to = parent ? after.get(`${parents.get(parent)}${from.id.slice(parent.length)}`) : undefined
		if (to && come.has(to)) pair(from, to, 'parent')
	}
	match((d) => d.kind === 'item')
	return { added: added.map((d) => d.id), removed: removed.map((d) => d.id), renamed, lost: [...gone].map((d) => d.id), fresh: [...come].map((d) => d.id) }
}

/** The report's lines for a diff: renames first, then what is really gone and really new. */
export function diffLines(d: KbDiff): string[] {
	return [
		`- Renamed (${d.renamed.length}; the same place under a new id): ${d.renamed.map((r) => `${r.from} → ${r.to} (${r.by})`).join(', ') || 'none'}`,
		`- Removed with no counterpart (${d.lost.length}; places the new version no longer has): ${d.lost.join(', ') || 'none'}`,
		`- Added with no counterpart (${d.fresh.length}): ${d.fresh.join(', ') || 'none'}`,
	]
}
