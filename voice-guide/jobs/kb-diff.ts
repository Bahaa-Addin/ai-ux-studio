/**
 * What changed between two knowledge-base versions, for the people who review a held sync
 * (SPEC-04 §5; ADR-0049 §6): a destination whose id is gone is either the same place under a new
 * name or a place that is no longer found. The reports list them apart, so a rename is never
 * mistaken for a loss, nor a loss hidden among renames:
 *
 * - renamed: the same page and kind, and a label of its own in common (not "banner" or "picture",
 *   which every picture has), or the same card of a renamed list by its name;
 * - by position: nothing to tell it by (no label, or twins with the very same labels), but the same
 *   locator inside its portlet and as many gone as come. Probably the same place; a person checks;
 * - lost and new: everything else. Two different labels are never a pair.
 */
import type { Manifest } from '#kb'

import { GENERIC_VISUAL_WORDS } from './kb-builder/build.ts'

type Destination = Manifest['destinations'][number]

export interface Rename {
	from: string
	to: string
	/** How the two were matched: a label of their own, the same-named card of a renamed list, or only their place. */
	by: 'label' | 'parent' | 'position'
}

export interface KbDiff {
	added: string[]
	removed: string[]
	/** Removed ids that are the same place under a new name (by `position`: probably, to be checked). */
	renamed: Rename[]
	/** Removed ids with no counterpart: places the new version no longer has. */
	lost: string[]
	/** Added ids with no counterpart: places the old version did not have. */
	fresh: string[]
}

const norm = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()
const GENERIC = new Set(Object.values(GENERIC_VISUAL_WORDS).flatMap((byLang) => Object.values(byLang).flat().map(norm)))
/** A destination's own labels: what tells it from its neighbours. */
const labelsOf = (d: Destination) => new Set(Object.values(d.labels || {}).flatMap((l) => (l || []).map(norm)).filter((l) => l && !GENERIC.has(l)))
const shares = (a: Set<string>, b: Set<string>) => [...a].some((x) => b.has(x))
const signature = (d: Destination) => [...labelsOf(d)].sort().join('|')
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

	/** Pairs by a label of their own within `from` and `to`: one candidate on each side, the one at the same place first. */
	const byLabel = (from: Destination[], to: Destination[], by: Rename['by']) => {
		for (const f of from) {
			if (!gone.has(f)) continue
			const mine = labelsOf(f)
			if (!mine.size) continue
			const labelled = to.filter((t) => come.has(t) && same(f, t) && shares(mine, labelsOf(t)))
			// Several with that label (three lists headed alike): the one at the same place in its portlet.
			const here = labelled.filter((t) => tail(t) === tail(f))
			const pool = here.length ? here : labelled
			if (pool.length !== 1) continue
			const t = pool[0]
			const rivals = from.filter((other) => gone.has(other) && same(other, t) && shares(labelsOf(other), labelsOf(t)) && (!here.length || tail(other) === tail(t)))
			if (rivals.length === 1) pair(f, t, by)
		}
	}
	/** What is left with nothing to tell it by: the same locator inside the portlet, as many gone as come, in page order. */
	const byPosition = (from: Destination[], to: Destination[]) => {
		const groups = new Map<string, { from: Destination[]; to: Destination[] }>()
		const key = (d: Destination) => `${d.pageId}\n${d.kind}\n${tail(d)}\n${signature(d)}`
		for (const d of from.filter((x) => gone.has(x))) groups.set(key(d), { from: [...(groups.get(key(d))?.from || []), d], to: groups.get(key(d))?.to || [] })
		for (const d of to.filter((x) => come.has(x))) if (groups.has(key(d))) groups.get(key(d))!.to.push(d)
		for (const g of groups.values()) if (tail(g.from[0]) && g.from.length === g.to.length) g.from.forEach((f, i) => pair(f, g.to[i], 'position'))
	}

	const notItem = (d: Destination) => d.kind !== 'item'
	const item = (d: Destination) => d.kind === 'item'
	byLabel(removed.filter(notItem), added.filter(notItem), 'label')
	byPosition(removed.filter(notItem), added.filter(notItem))
	// The cards of a renamed list: the same card is the one with the same name, wherever it now sits
	// in the list (a card that left the list is lost; the ones after it move up). Cards without a name
	// of their own are told by their place only.
	for (const r of [...renamed]) {
		const under = (list: Destination[], parent: string) => list.filter((d) => item(d) && d.id.startsWith(`${parent}.`))
		const from = under(removed, r.from)
		const to = under(added, r.to)
		byLabel(from, to, 'parent')
		for (const f of from) {
			const t = after.get(`${r.to}${f.id.slice(r.from.length)}`)
			if (gone.has(f) && t && come.has(t) && !labelsOf(f).size && !labelsOf(t).size) pair(f, t, 'position')
		}
	}
	byLabel(removed.filter(item), added.filter(item), 'label')
	byPosition(removed.filter(item), added.filter(item))
	return { added: added.map((d) => d.id), removed: removed.map((d) => d.id), renamed, lost: [...gone].map((d) => d.id), fresh: [...come].map((d) => d.id) }
}

/** The report's lines for a diff: renames, what was only matched by its place, then what is really gone and really new. */
export function diffLines(d: KbDiff): string[] {
	const sure = d.renamed.filter((r) => r.by !== 'position')
	const unsure = d.renamed.filter((r) => r.by === 'position')
	const show = (rs: Rename[]) => rs.map((r) => `${r.from} → ${r.to}${r.by === 'parent' ? ' (in its renamed list)' : ''}`).join(', ') || 'none'
	return [
		`- Renamed (${sure.length}; the same place under a new id, told by its own label): ${show(sure)}`,
		`- Paired by position only (${unsure.length}; nothing to tell them by but their place in the portlet: check each on the site): ${show(unsure)}`,
		`- Removed with no counterpart (${d.lost.length}; places the new version no longer has): ${d.lost.join(', ') || 'none'}`,
		`- Added with no counterpart (${d.fresh.length}): ${d.fresh.join(', ') || 'none'}`,
	]
}
