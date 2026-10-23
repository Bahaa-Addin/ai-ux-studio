/** What the crawler records per page (ADR-0012). Plain data, saved per crawl. */

export interface RevealSnap {
	css: string[]
	text: string
	role: string
}

export interface SectionSnap {
	css: string[]
	kind: 'section' | 'faq' | 'tabpanel' | 'figure' | 'form'
	heading: string
	text: string
	hidden: boolean
	reveal: RevealSnap[]
	annotations: Record<string, string>
}

export interface FieldSnap {
	css: string
	type: 'text' | 'money' | 'data'
}

export interface CollectionSnap {
	containerCss: string[]
	itemCss: string
	keyAttr?: string
	heading: string
	hidden: boolean
	reveal: RevealSnap[]
	fields: Record<string, FieldSnap>
	items: { key?: string; name: string; values: Record<string, string> }[]
}

export interface VisualMeta {
	alt?: string
	title?: string
	ariaLabel?: string
	labelledBy?: string
	describedBy?: string
	figcaption?: string
	svgTitle?: string
	svgDesc?: string
	svgText?: string
	heading?: string
	linkHref?: string
	linkText?: string
	src?: string
	kbDescribe?: Record<string, string>
}

export interface VisualSnap {
	index: number
	css: string[]
	kind: 'image' | 'canvas' | 'svg' | 'webgl' | 'video'
	width: number
	height: number
	hidden: boolean
	meta: VisualMeta
	/** Set by the crawler after the element screenshot is saved. */
	screenshot?: { file: string; sha256: string }
}

export interface ActionSnap {
	css: string[]
	text: string
	tag: string
	type?: string
	href?: string
	inForm: boolean
	commit: boolean
	reason?: string
	hidden: boolean
}

export interface LinkSnap {
	href: string
	text: string
	hreflang?: string
	inNav: boolean
}

export interface AnnotationSnap {
	css: string[]
	attrs: Record<string, string>
	text: string
}

export interface PageSnap {
	url: string
	lang: string
	dir: 'rtl' | 'ltr'
	title: string
	h1: string
	alternates: Record<string, string>
	sections: SectionSnap[]
	collections: CollectionSnap[]
	visuals: VisualSnap[]
	actions: ActionSnap[]
	links: LinkSnap[]
	annotations: AnnotationSnap[]
	textLength: number
	/** Relative path of the saved HTML snapshot inside the crawl folder. */
	snapshot?: string
	status: number
}

export interface CrawlResult {
	id: string
	siteId: string
	startedAt: string
	finishedAt: string
	dir: string
	pages: PageSnap[]
	errors: { url: string; error: string }[]
}
