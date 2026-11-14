/** UI strings. Spoken lines come from the server (services/router/phrases.ts). */
const S = {
	open: { ar: 'اسأل المرشد', en: 'Ask the guide' },
	close: { ar: 'إغلاق', en: 'Close' },
	listen: { ar: 'اتكلم', en: 'Speak' },
	listening: { ar: 'سامعك…', en: 'Listening…' },
	thinking: { ar: 'ثواني…', en: 'One moment…' },
	placeholder: { ar: 'اكتب سؤالك هنا', en: 'Type your question' },
	send: { ar: 'إرسال', en: 'Send' },
	hint: { ar: 'جرّب: «إيه أرخص باقة نت؟»', en: 'Try: "What\'s the cheapest internet bundle?"' },
	watch: { ar: 'عرّفني لما يتغير', en: 'Notify me when it changes' },
	watching: { ar: 'تمام، هعرفك لما «{label}» يتغير.', en: 'Done. I will tell you when "{label}" changes.' },
	watchFailed: { ar: 'مقدرتش أراقب الجزء ده.', en: "I couldn't watch that section." },
	xray: { ar: 'أشعة إكس', en: 'X-ray' },
	mute: { ar: 'كتم الصوت', en: 'Mute' },
	unmute: { ar: 'تشغيل الصوت', en: 'Unmute' },
	noMic: { ar: 'الميكروفون مش متاح. اكتب سؤالك.', en: 'The microphone is not available. Type your question.' },
	error: { ar: 'حصلت مشكلة. جرّب تاني.', en: 'Something went wrong. Please try again.' },
	agentUnavailable: { ar: 'مش قادر أدور دلوقتي. جرّب تسأل بطريقة تانية.', en: "I can't search the page right now. Try asking another way." },
	talk: { ar: 'اتكلم مع مساعد ڤودافون', en: 'Talk to the Vodafone guide' },
	stopListening: { ar: 'وقف الاستماع', en: 'Stop listening' },
	stopSpeaking: { ar: 'وقف الكلام واسمعني', en: 'Stop talking and listen' },
	keyboard: { ar: 'اكتب بدل ما تتكلم', en: 'Type instead' },
	allowMic: { ar: 'اسمح للميكروفون علشان نتكلم', en: 'Allow the microphone to talk to me' },
	micDenied: { ar: 'الميكروفون مقفول. تقدر تكتب سؤالك.', en: 'The microphone is blocked. You can type instead.' },
	noSpeech: { ar: 'مسمعتكش كويس، جرّب تاني', en: "I didn't catch that. Try again" },
	speechUnavailable: { ar: 'التعرّف على الصوت مش متاح هنا دلوقتي. تقدر تكتب سؤالك.', en: 'Speech recognition is not available here right now. You can type instead.' },
	switchLang: { ar: 'English', en: 'عربي' },
	planStopped: { ar: 'وقفت. قولي عايز إيه.', en: 'Stopped. Tell me what you need.' },
	guide: { ar: 'المرشد', en: 'Guide' },
	tapToHear: { ar: 'اضغط علشان تسمع الرد', en: 'Tap to hear the reply' },
	hear: { ar: 'اسمع', en: 'Hear it' },
} as const

export type UiKey = keyof typeof S

export function t(key: UiKey, lang: string, vars: Record<string, string> = {}): string {
	const s = (S[key] as Record<string, string>)[lang.slice(0, 2)] ?? S[key].en
	return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '')
}
