/**
 * What the guide says, per language. Short, spoken style; Egyptian Arabic for
 * Arabic because the demo audience speaks it (ADR-0020). Values read from the
 * page fill the {placeholders} at runtime in the SDK.
 */
type Lang = 'ar' | 'en'

const P = {
	taking: { en: 'Taking you to {page}.', ar: 'هوديك على صفحة {page}.' },
	here: { en: 'Here it is.', ar: 'أهي.' },
	pageSummary: { en: 'This is {title}. It has {sections}.', ar: 'دي صفحة {title}، وفيها {sections}.' },
	pageTitleOnly: { en: 'This is {title}.', ar: 'دي صفحة {title}.' },
	unknownPage: { en: "I don't know this page yet. Ask me for something on the site and I'll take you there.", ar: 'لسه معرفش الصفحة دي. اسألني عن أي حاجة في الموقع وأنا هوديك.' },
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
	// The guided commit step (ADR-0058; AIXC-70, 74): for steps other than buying, when there are several, and when there is none.
	// Two choices that differ only by a stored price: both shown and read from the page, then this (ADR-0059).
	clarifyBoth: { en: 'These two look alike. Which one: the first or the second?', ar: 'الاتنين شبه بعض. أنهي واحدة: الأولى ولا التانية؟' },
	theFirst: { en: 'The first', ar: 'الأولى' },
	theSecond: { en: 'The second', ar: 'التانية' },
	// What the guide calls something whose name was only a stored price, or a page with no other title (AIXC-100).
	thisOne: { en: 'this one', ar: 'ده' },
	thePage: { en: 'the page', ar: 'الصفحة' },
	commitYours: { en: "This step is yours: press this button yourself when you're ready.", ar: 'الخطوة دي بتاعتك: دوس على الزرار ده بنفسك لما تكون جاهز.' },
	commitNumber: { en: 'Pick the number you want, then press this button yourself.', ar: 'اختار الرقم اللي عايزه، وبعدين دوس على الزرار ده بنفسك.' },
	commitWhich: { en: "There are several of these here. Which one do you mean? Tell me its name and I'll show you its button.", ar: 'فيه أكتر من واحد هنا. تقصد أنهي واحد؟ قولي اسمه وأنا أوريك الزرار بتاعه.' },
	commitMissing: { en: "I can't see that button on this page. That step is yours to take.", ar: 'مش شايف الزرار ده في الصفحة دي. الخطوة دي بتاعتك.' },
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
