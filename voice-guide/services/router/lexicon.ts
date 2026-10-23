/**
 * Built-in intent phrases (ADR-0014), in normalised form so matching is
 * spelling-tolerant. Sites extend them through `lexicon.intents` in their
 * curated overlay. Control intents (stop, repeat) are decided here, before any
 * model call, because they must be instant and must never be misread.
 */
import { normalize, words } from '#text'

export type IntentId = 'navigate' | 'flow' | 'watch' | 'describe' | 'act' | 'stop' | 'repeat' | 'help'

type Phrases = Record<string, string[]>

export const INTENT_PHRASES: Record<'watch' | 'describe' | 'stop' | 'repeat' | 'help', Phrases> = {
	watch: {
		en: ['tell me when', 'notify me', 'let me know when', 'let me know if', 'alert me', 'keep an eye on', 'watch this', 'watch it', 'when it changes', 'if it changes', 'when this changes', 'when the price changes'],
		ar: ['عرفني لما', 'عرفني لو', 'بلغني', 'نبهني', 'قولي لما', 'قولي لو', 'ابعتلي لما', 'لما يتغير', 'لو اتغير', 'لما تتغير', 'لو اتغيرت', 'راقب'],
	},
	describe: {
		en: ['what does this', 'what does the', 'what is in this', "what's in this", 'what is on this', 'describe', 'what does it say', 'what does it show', 'read the banner', 'read this banner', 'what is this banner', 'what is this picture', 'what is this image', 'what is this chart'],
		ar: ['بيقول ايه', 'بتقول ايه', 'فيه ايه', 'فيها ايه', 'معناه ايه', 'معناها ايه', 'بيوضح ايه', 'بتوضح ايه', 'اوصف', 'وصف', 'اقرا البانر', 'اقرالي'],
	},
	stop: {
		en: ['stop', 'cancel', 'never mind', 'nevermind', 'forget it', 'quit', 'be quiet'],
		ar: ['خلاص', 'وقف', 'اوقف', 'بطل', 'الغي', 'الغاء', 'كفايه', 'اسكت'],
	},
	repeat: {
		en: ['say that again', 'repeat', 'come again', 'what did you say', 'say it again'],
		ar: ['كرر', 'قول تاني', 'قولها تاني', 'عيد', 'تاني كده', 'قلت ايه'],
	},
	help: {
		en: ['what can you do', 'help me', 'how does this work', 'who are you'],
		ar: ['تقدر تعمل ايه', 'بتعمل ايه', 'ساعدني', 'انت مين'],
	},
}

/** Superlatives that select one item of a collection by a field. */
export const SELECTORS: { by: 'min' | 'max'; field: 'price' | 'data'; phrases: Phrases }[] = [
	{ by: 'min', field: 'price', phrases: { en: ['cheapest', 'lowest price', 'least expensive', 'most affordable', 'cheaper'], ar: ['ارخص', 'اقل سعر', 'الارخص', 'ارخص حاجه', 'اوفر', 'رخيصه', 'رخيص', 'الرخيصه'] } },
	{ by: 'max', field: 'price', phrases: { en: ['most expensive', 'priciest', 'highest price'], ar: ['اغلي', 'الاغلي', 'اعلي سعر'] } },
	{ by: 'max', field: 'data', phrases: { en: ['most data', 'biggest', 'largest', 'most gb', 'most gigabytes', 'highest data'], ar: ['اكبر', 'اكتر جيجا', 'اكثر داتا', 'اكتر داتا', 'اكبر باقه', 'اكتر نت'] } },
	{ by: 'min', field: 'data', phrases: { en: ['smallest', 'least data'], ar: ['اصغر', 'اقل داتا', 'اقل جيجا'] } },
]

/** Once a watch request is recognised, these only repeat it ("...when this changes"). */
export const WATCH_FILLER: Phrases = {
	en: ['change', 'changes', 'changed', 'update', 'updates', 'updated', 'when', 'if'],
	ar: ['يتغير', 'تتغير', 'اتغير', 'اتغيرت', 'يتحدث', 'لما', 'لو'],
}

/** Requests to do something on the page: the in-page agent's job, not the knowledge base's. */
export const ACT_PHRASES: Phrases = {
	en: ['select', 'choose the', 'pick the', 'tick', 'fill in', 'fill my', 'type my', 'enter my', 'click on', 'press the', 'switch to', 'change the payment', 'check the box', 'uncheck'],
	ar: ['اختار', 'اختر', 'اكتب', 'اكتبلي', 'دوس علي', 'اضغط علي', 'علم علي', 'حط', 'املا', 'غيرلي'],
}

/** "What's on this page?": a request about the page the person is on (SPEC-05 §1, T-303). */
export const THIS_PAGE: Phrases = {
	en: ["what's on this page", 'what is on this page', 'what is this page', "what's this page", 'what page is this', 'where am i', 'tell me about this page', 'what can i do here', 'what can i do on this page'],
	ar: ['ايه اللي في الصفحه دي', 'ايه اللي ف الصفحه دي', 'الصفحه دي فيها ايه', 'ايه الصفحه دي', 'الصفحه دي ايه', 'انا فين', 'انا في انهي صفحه', 'اقدر اعمل ايه هنا', 'قولي الصفحه دي فيها ايه'],
}

/** "the home page", "صفحة العروض": the person wants a page, not a section of it. */
export const PAGE_WORDS: Phrases = {
	en: ['page', 'the page', 'screen'],
	ar: ['صفحه', 'الصفحه'],
}

/** Words that point back at what was just shown ("subscribe to it"). */
export const BACK_REFERENCES: Phrases = {
	en: ['it', 'this', 'that', 'this one', 'that one', 'this offer', 'this bundle', 'that bundle', 'this plan', 'the same'],
	ar: ['فيها', 'فيه', 'ده', 'دي', 'دا', 'دى', 'الباقه دي', 'العرض ده', 'هيه', 'هي', 'هو', 'عليها', 'عليه'],
}

/** Normalised word sequence, padded with spaces for whole-word containment checks. */
export function padded(text: string): string {
	return ` ${words(normalize(text)).join(' ')} `
}

export function containsPhrase(paddedText: string, phrase: string): boolean {
	const p = padded(phrase)
	return p.trim().length > 0 && paddedText.includes(p)
}

/** Every phrase that matched, so callers can remove them before retrieval. */
export function matchPhrases(paddedText: string, phrases: Phrases, extra?: Phrases): string[] {
	const all = [...Object.values(phrases).flat(), ...Object.values(extra || {}).flat()]
	return all.filter((p) => containsPhrase(paddedText, p)).sort((a, b) => b.length - a.length)
}

export function stripPhrases(paddedText: string, phrases: string[]): string {
	let s = paddedText
	for (const p of phrases) s = s.split(padded(p)).join(' ')
	return s.replace(/\s+/g, ' ').trim()
}
