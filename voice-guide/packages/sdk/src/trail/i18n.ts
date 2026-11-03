/**
 * The trail's words (SPEC-06 §8), in the same table-and-`t()` form as `../i18n.ts` but in the
 * trail's own chunk so `guide.js` does not grow. Calm and personal: "your journey", "you
 * explored"; never "we tracked", never times or counts of what someone did.
 */
const S = {
	journey: { ar: 'رحلتك', en: 'Your journey' },
	saved: { ar: 'محفوظة على الجهاز ده بس', en: 'Saved on this device' },
	offer: { ar: 'افتكر رحلتي', en: 'Remember my journey' },
	open: { ar: 'افتح رحلتك', en: 'Open your journey' },
	close: { ar: 'اقفل رحلتك', en: 'Close your journey' },
	consentTitle: { ar: 'افتكر رحلتي على الجهاز ده', en: 'Remember my journey on this device' },
	consentBody: {
		ar: 'نحفظ صورة خاصة للصفحات العامة اللي بتزورها. بتفضل على الجهاز ده بس، وتقدر تمسحها في أي وقت.',
		en: 'Save a private visual history of the public pages you explore. It stays on this device and can be cleared at any time.',
	},
	consentWhat: { ar: 'اللي بيتحفظ: شكل الصفحات العامة، مكان المؤشر والتمرير، والأجزاء اللي اهتميت بيها.', en: 'What is saved: how public pages looked, where the pointer moved and scrolled, and which parts you explored.' },
	consentNot: { ar: 'اللي مش بيتحفظ: أي حاجة بتكتبها، الحقول، تسجيل الدخول، حسابك، الدفع، والصفحات الخاصة.', en: 'Never saved: anything you type, form fields, sign-in, your account, payment, or private pages.' },
	consentWhere: { ar: 'بتفضل في المتصفح ده بس وبتتمسح لوحدها بعد {hours} ساعة.', en: 'It stays in this browser and deletes itself after {hours} hours.' },
	consentControl: { ar: 'تقدر توقفها مؤقتًا أو تمسحها من «رحلتك» في أي وقت.', en: 'Pause or clear it any time from “Your journey”.' },
	consentAggregateOff: { ar: 'مفيش أي إحصائيات مجهّلة بتتبعت.', en: 'No anonymous statistics are sent.' },
	consentAggregateOn: { ar: 'بيتبعت بس رقم مجهّل للأجزاء اللي اهتميت بيها، من غير أي حاجة عنك.', en: 'Only anonymous counts of the parts you explored are sent, with nothing about you.' },
	allow: { ar: 'افتكر رحلتي', en: 'Remember my journey' },
	notNow: { ar: 'مش دلوقتي', en: 'Not now' },
	pause: { ar: 'وقّف مؤقتًا', en: 'Pause' },
	resume: { ar: 'كمّل', en: 'Resume' },
	clear: { ar: 'امسح الرحلة دي', en: 'Clear journey' },
	clearAll: { ar: 'امسح كل الرحلات', en: 'Clear all saved journeys' },
	turnOff: { ar: 'اقفل الخاصية', en: 'Turn off' },
	more: { ar: 'خيارات الرحلة', en: 'Journey options' },
	paused: { ar: 'متوقفة مؤقتًا', en: 'Paused' },
	recording: { ar: 'بتتحفظ', en: 'Saving' },
	notHere: { ar: 'الصفحة دي مش بتتحفظ', en: 'This page is not saved' },
	full: { ar: 'المساحة خلصت، الصفحات القديمة اتشالت', en: 'Storage is full; older pages were removed' },
	failed: { ar: 'الرحلة مش متاحة دلوقتي', en: 'Your journey is not available right now' },
	empty: { ar: 'لسه مفيش صفحات. اتصفح وارجع هنا.', en: 'No pages yet. Explore, then come back here.' },
	step: { ar: 'صفحة {n} من {total}: {title}', en: 'Page {n} of {total}: {title}' },
	here: { ar: 'إنت هنا', en: 'You are here' },
	ledTo: { ar: 'فتحت {title}', en: 'Opened {title}' },
	privatePage: { ar: 'صفحة خاصة', en: 'A private page' },
	otherSite: { ar: 'روحت على {title}', en: 'Went to {title}' },
	memory: { ar: 'ذكرى من {title}، مش الصفحة الحالية', en: 'A memory of {title}, not the live page' },
	memoryShort: { ar: 'ذكرى', en: 'Memory' },
	loading: { ar: 'بنجهّز الذكرى…', en: 'Preparing the memory…' },
	noPreview: { ar: 'مفيش معاينة للصفحة دي', en: 'No preview for this page' },
	position: { ar: 'مكانك في {title}', en: 'Position in {title}' },
	positionValue: { ar: '{pct}٪ من {title}', en: '{pct}% through {title}' },
	play: { ar: 'شغّل', en: 'Play' },
	stop: { ar: 'وقّف', en: 'Pause' },
	explored: { ar: 'اللي اكتشفته', en: 'You explored' },
	why_explored: { ar: 'اكتشفت ده', en: 'You explored this' },
	why_returned: { ar: 'رجعت لده', en: 'You returned to this' },
	why_opened: { ar: 'فتحت ده', en: 'You opened this' },
	popular: { ar: 'زوار كتير بيدوروا عليه', en: 'Often explored by visitors' },
	ask: { ar: 'اسأل المرشد', en: 'Ask the guide' },
	nothingExplored: { ar: 'مفيش حاجة واضحة اكتشفتها في الصفحة دي.', en: 'Nothing in particular stood out on this page.' },
	resumeHint: { ar: 'كمّل من مكان ما وقفت', en: 'Pick up where you left off' },
	cleared: { ar: 'الرحلة اتمسحت.', en: 'Journey cleared.' },
	clearedAll: { ar: 'كل الرحلات اتمسحت.', en: 'All saved journeys cleared.' },
	turnedOff: { ar: 'الخاصية اتقفلت وكل الرحلات اتمسحت.', en: 'Turned off. Every saved journey was deleted.' },
	steps: { ar: 'صفحات رحلتك', en: 'Pages in your journey' },
} as const

export type TrailKey = keyof typeof S

export function tt(key: TrailKey, lang: string, vars: Record<string, string | number> = {}): string {
	const s = (S[key] as Record<string, string>)[lang.slice(0, 2)] ?? S[key].en
	return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
}
