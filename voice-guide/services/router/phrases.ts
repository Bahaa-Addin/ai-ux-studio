/**
 * What the guide says, per language. Short, spoken style; Egyptian Arabic for
 * Arabic because the demo audience speaks it (ADR-0020). Values read from the
 * page fill the {placeholders} at runtime in the SDK.
 */
type Lang = 'ar' | 'en'

const P = {
	taking: { en: 'Taking you to {page}.', ar: 'هوديك على صفحة {page}.' },
	here: { en: 'Here it is.', ar: 'أهي.' },
	itemRead: { en: '{name}: {data} for {price}.', ar: '{name}: {data} بـ {price}.' },
	itemReadNoData: { en: '{name} for {price}.', ar: '{name} بـ {price}.' },
	minPrice: { en: 'The cheapest is {name}: {data} for {price}.', ar: 'أرخص واحدة {name}: {data} بـ {price}.' },
	maxPrice: { en: 'The most expensive is {name}: {data} for {price}.', ar: 'أغلى واحدة {name}: {data} بـ {price}.' },
	maxData: { en: 'The one with the most data is {name}: {data} for {price}.', ar: 'أكبر واحدة {name}: {data} بـ {price}.' },
	minData: { en: 'The smallest is {name}: {data} for {price}.', ar: 'أصغر واحدة {name}: {data} بـ {price}.' },
	clarify: { en: 'Did you mean {a} or {b}?', ar: 'تقصد {a} ولا {b}؟' },
	notFound: { en: "I couldn't find that on the site.", ar: 'مش لاقي ده على الموقع.' },
	closest: { en: "I couldn't find that exactly. The closest is {page}.", ar: 'مش لاقيها بالظبط. أقرب حاجة صفحة {page}.' },
	agent: { en: 'Let me look for that on the page.', ar: 'ثواني، هدور عليها في الصفحة.' },
	watchOffer: { en: 'Want me to tell you when {label} changes?', ar: 'تحب أعرفك لما {label} يتغير؟' },
	watchWhich: { en: 'Which part should I watch? For example an offer or a price.', ar: 'أراقب أنهي جزء؟ مثلًا عرض أو سعر.' },
	whichItem: { en: 'Which one? Tap a bundle or tell me its name.', ar: 'أنهي واحدة؟ اختار باقة أو قولي اسمها.' },
	commit: { en: 'This button completes the purchase. Press it yourself when you are ready.', ar: 'الزرار ده بيكمّل الشراء. دوس عليه بنفسك لما تكون جاهز.' },
	stopped: { en: 'Okay, stopped.', ar: 'تمام، وقفت.' },
	nothingToRepeat: { en: "I haven't said anything yet.", ar: 'لسه ماقلتش حاجة.' },
	help: {
		en: 'Ask me for anything on this site, like the cheapest bundle, how to subscribe, or what a banner says. I take you there and show you.',
		ar: 'اسألني عن أي حاجة في الموقع، زي أرخص باقة أو إزاي تشترك أو البانر بيقول إيه. هوديك وأوريك.',
	},
	signIn: { en: 'Please sign in first; I will continue after that.', ar: 'سجّل دخولك الأول وأنا هكمّل بعدها.' },
} satisfies Record<string, Record<Lang, string>>

export type PhraseKey = keyof typeof P

export function say(key: PhraseKey, lang: string, vars: Record<string, string> = {}): string {
	const l: Lang = lang === 'ar' ? 'ar' : 'en'
	return P[key][l].replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`)
}

/** Template with runtime placeholders left in place for the SDK to fill from the page. */
export function template(key: PhraseKey, lang: string): string {
	return P[key][lang === 'ar' ? 'ar' : 'en']
}
