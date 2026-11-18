/**
 * The clone's own UI copy in the page's language (the Arabic Services page, 2026-11-05).
 *
 * The English text is the key: t('Pocket it') is 'Pocket it' on the English page and 'في الجيب'
 * on the Arabic one, so English behaviour cannot change. {name} placeholders take values.
 * Vodafone's own copy is not here: it lives in src/content (page) and src/shell.js (header, footer). Nor are the clone
 * composer's own words (its prompt, Gemini, key and model): src/aixc/composer-words.js, which only the clone loads, as
 * this file also comes with the Pocket and Reimagine's shell on Vodafone's own pages.
 */

export const lang = typeof document !== 'undefined' && document.documentElement.lang?.startsWith('ar') ? 'ar' : 'en'

const AR = {
  // shell and page
  '(opens in a new tab)': '(تفتح في نافذة جديدة)',
  'Previous {title}': 'السابق: {title}',
  'Next {title}': 'التالي: {title}',
  'Vodafone sections': 'أقسام ڤودافون',
  Primary: 'القائمة الرئيسية',
  Profile: 'حسابي',
  // Pocket
  'Open your pocket': 'افتح جيبك',
  'Your pocket': 'جيبك',
  'Back to Services': 'ارجع للخدمات',
  'Empty pocket': 'فضّي الجيب',
  'Your pocket is empty': 'جيبك فاضي',
  'Peel services off the page with “Pocket it” and they wait here for later.': 'اقلع الخدمات من الصفحة بزرار «في الجيب»، وهتلاقيها مستنياك هنا.',
  'Open your pocket, {count}': 'افتح جيبك، {count}',
  'Pocket it: {title}': 'في الجيب: {title}',
  'Pocket it': 'في الجيب',
  // The name starts with the visible label (WCAG 2.5.3).
  'Put back {title}': 'رجّعها: {title}',
  'Put back': 'رجّعها',
  'In your pocket': 'في جيبك',
  'View more': 'اعرف اكتر',
  'Remove {title} from your pocket': 'شيل {title} من جيبك',
  Remove: 'شيل',
  'Nothing here yet.': 'لسه مفيش حاجة هنا.',
  'Your pocket is empty.': 'جيبك فاضي.',
  'Your pocket, {count}.': 'جيبك، {count}.',
  'Play with the Pocket drone': 'العب مع درون الجيب',
  'Opening {title}': 'بنفتح {title}',
  '{title} removed from your pocket. {count} left.': 'شلت {title} من جيبك. فاضل {count}.',
  '{title} is in your pocket. {count}.': '{title} بقت في جيبك. {count}.',
  '{title} is back on the page. {count} in your pocket.': '{title} رجعت للصفحة. في جيبك {count}.',
  // Pocket on Vodafone's own pages (the experience layer)
  'Back to the page': 'ارجع للصفحة',
  'Kept for later: {count}.': 'محفوظة لبعدين: {count}.',
  'Saved {date}': 'اتحفظت {date}',
  'No longer on this page': 'مش موجودة في الصفحة دي دلوقتي',
  'This page': 'الصفحة دي',
  'Pocket it on this page': 'زرار «في الجيب» لخدمات الصفحة دي',
  // Reimagine this page (the composer)
  'Reimagine this page': 'غيّر شكل الصفحة',
  'Ready-made experiences': 'أشكال جاهزة',
  // Reimagined experiences: shared (src/aixc/experiences/shared.js)
  'More services': 'خدمات تانية',
  'From {sources}': 'من {sources}',
  'View service': 'شوف الخدمة',
  'QR code to download the Ana Vodafone app': 'كود QR لتحميل تطبيق أنا ڤودافون',
  // Reimagined experiences: magazine, journey
  "Scroll to begin": "انزل عشان تبدأ",
  "Sections in this view": "الأقسام في العرض ده",
  "Inside": "جوّه العدد",
  "Services": "الخدمات",
  "{label}, scrollable list": "{label}، قايمة بتتحرك",
  "Scroll {label} back": "ارجع في {label}",
  "Scroll {label} forward": "كمّل في {label}",
  // Reimagined experiences: streaming
  "Home": "الرئيسية",
  "More info": "التفاصيل",
  "More info: {title}": "تفاصيل {title}",
  "Explore all": "شوف الكل",
  "Close": "اقفل",
  "Category": "النوع",
  "Link": "اللينك",
  "None on the source page": "مفيش لينك في الصفحة الأصلية",
  "More in {category}": "كمان من {category}",
  "View {title}": "شوف {title}",
  "Vodafone, back to the top": "ڤودافون، ارجع لأول الصفحة",
  "Skip intro": "تخطّي المقدمة",
  // Reimagined experiences: spotlight, gallery
  "slide": "شريحة",
  "{n} of {total}: {title}": "{n} من {total}: {title}",
  "Show {title}": "اعرض {title}",
  "Up next": "اللي جاي",
  "Previous service": "الخدمة اللي قبلها",
  "Next service": "الخدمة اللي بعدها",
  "Pause automatic rotation": "وقّف التقليب التلقائي",
  "Start automatic rotation": "شغّل التقليب التلقائي",
  "Jump to a category": "روح لنوع خدمات",
  "Vodafone services spotlight": "خدمات ڤودافون تحت الضوء",
  // Reimagined experiences on pages not about services (shared.js words(), copy 'items'; 'Next' is the tips' own)
  Previous: 'السابق',
  Spotlight: 'تحت الضوء',
  'View details': 'شوف التفاصيل',
  'More on this page': 'كمان في الصفحة دي',
  Items: 'العناصر',
  'Jump to a section': 'روح لقسم',
  // ... and the other eleven's (their labels are the composer's card names below, where those are neutral)
  Ring: 'حلقة',
  'Canvas. Use the arrow keys to pan, Tab to move between items.': 'اللوحة. اتحرّك بالأسهم، وTab عشان تنقل بين العناصر.',
  'Vodafone Egypt · {page}': 'ڤودافون مصر · {page}',
  "{title}, piece {n} of {total}": "{title}، برواز {n} من {total}",
  "Previous piece": "البرواز اللي قبله",
  "Next piece": "البرواز اللي بعده",
  "Scroll, or use the arrows, to walk along the wall.": "انزل أو استخدم الأسهم عشان تتمشى جنب الحيطة.",
  "Gallery of Vodafone services": "معرض خدمات ڤودافون",
  "No. {n}": "رقم {n}",
  "In this category": "في النوع ده",
  // Reimagined experiences: split, fan
  "{n} of {total}: {title}, {group}": "{n} من {total}: {title}، {group}",
  "Go to {title}": "روح لـ{title}",
  "Categories": "الأقسام",
  "Vodafone services, split slideshow": "خدمات ڤودافون، شرايح مقسومة",
  "Scroll, drag or use the arrow keys": "انزل، اسحب أو استخدم الأسهم",
  "{title}, card {n} of {total}": "{title}، كارت {n} من {total}",
  "Previous card": "الكارت اللي قبله",
  "Next card": "الكارت اللي بعده",
  "Drag the cards, scroll, or use the arrow keys": "اسحب الكروت، انزل، أو استخدم الأسهم",
  "{title} · {count} services · {groups} categories": "{title} · {count} خدمة · {groups} أقسام",
  "Vodafone services, card fan": "خدمات ڤودافون، كروت مفرودة",
  // Reimagined experiences: canvas, coverflow, flipbook, cube, ring, tunnel
  "Drag to explore": "اسحب واكتشف",
  "{title}, {group}. Open details": "{title}، {group}. افتح التفاصيل",
  "Services canvas. Use the arrow keys to pan, Tab to move between services.": "لوحة الخدمات. استخدم الأسهم عشان تتحرك، وTab عشان تنقل بين الخدمات.",
  "+Categories": "+الأقسام",
  "+On the canvas": "+على اللوحة",
  "+Controls": "+التحكم",
  "Drag or arrow keys to pan": "اسحب أو استخدم الأسهم عشان تتحرك",
  "Click or Enter to open": "دوس أو Enter عشان تفتح",
  "Press {enter} to open, {esc} to close": "دوس {enter} عشان تفتح، و{esc} عشان تقفل",
  "Vodafone Egypt · Services": "ڤودافون مصر · الخدمات",
  "Vodafone services, infinite canvas": "خدمات ڤودافون، لوحة مفتوحة",
  "{title}, {n} of {total}": "{title}، {n} من {total}",
  "Vodafone services, cover flow": "خدمات ڤودافون، تقليب الأغلفة",
  "Previous page": "الصفحة اللي قبلها",
  "Next page": "الصفحة اللي بعدها",
  "Vodafone services flipbook": "كتاب خدمات ڤودافون",
  "book": "كتاب",
  "Turn back a page": "ارجع صفحة",
  "Turn the page": "قلّب الصفحة",
  "Contents": "المحتويات",
  "Pages {from}–{to} of {total}": "صفحة {from}–{to} من {total}",
  "Page {page} of {total}": "صفحة {page} من {total}",
  "{count} categories": "{count} أقسام",
  "Overview": "نظرة عامة",
  "Turn the cube": "لفّ المكعب",
  "Face {number}": "الوش {number}",
  "Go to {label}": "روح لـ{label}",
  "Vodafone services, ring": "خدمات ڤودافون، حلقة",
  "Scroll to turn the ring": "انزل عشان تلف الحلقة",
  "CAT: {n}/{total}": "القسم: {n}/{total}",
  "LINK: {domain}": "اللينك: {domain}",
  "LINK: IN THE APP": "اللينك: في التطبيق",
  "Speed": "السرعة",
  "Scroll velocity": "سرعة النزول",
  "Depth": "العمق",
  "Vodafone services, hyper tunnel": "خدمات ڤودافون، النفق السريع",
  "Scroll to fly through": "انزل عشان تطير جوه النفق",
  "{group}, category": "{group}، قسم",
  // end of reimagined experiences
  'Close composer': 'اقفل',
  Original: 'الأصلي',
  Reimagined: 'الشكل الجديد',
  Change: 'غيّر',
  Reset: 'رجّع الأصلي',
  'Page view': 'عرض الصفحة',
  'Page view controls': 'التحكم في عرض الصفحة',
  'Ready-made template, no AI call': 'شكل جاهز، من غير ذكاء اصطناعي',
  '{count} left out by the layout was added back so nothing is lost.': '{count} كانت ناقصة من الشكل ورجّعناها، عشان مايضيعش حاجة.',
  '{count} left out by the layout were added back so nothing is lost.': '{count} كانت ناقصة من الشكل ورجّعناها، عشان مايضيعش حاجة.',
  'Page reset to the original view.': 'الصفحة رجعت للشكل الأصلي.',
  '{name} ready.': '{name} جاهز.',
  // ready-made experiences: names and the line under each
  'Reimagined view': 'الشكل الجديد',
  'Magazine experience': 'شكل المجلة',
  'Streaming showcase': 'عرض المنصات',
  'Split slideshow': 'شرائح مقسومة',
  'Card fan': 'مروحة كروت',
  'Service ring': 'حلقة الخدمات',
  'Hyper tunnel': 'النفق السريع',
  'Infinite canvas': 'لوحة مفتوحة',
  'Cover flow': 'تقليب الأغلفة',
  'Spotlight cards': 'كروت تحت الضوء',
  'Scroll journey': 'رحلة بالنزول',
  'Gallery wall': 'حيطة معرض',
  Flipbook: 'كتاب بيتقلّب',
  'Service cube': 'مكعب الخدمات',
  'Editorial magazine': 'مجلة',
  // Tips: the walkthrough of the four demos (src/tips, voice-guide ADR-0045)
  Tips: 'نصايح',
  'Tips: four new ways to explore this page': 'نصايح: أربع طرق جديدة تستكشف بيها الصفحة دي',
  'New on this page': 'جديد في الصفحة دي',
  'Four new ways to explore Services. Take the two-minute tour?': 'أربع طرق جديدة تستكشف بيها الخدمات. تاخد جولة في دقيقتين؟',
  'Show me': 'وريني',
  'Not now': 'مش دلوقتي',
  'Voice guide': 'المرشد الصوتي',
  Pocket: 'الجيب',
  'Your journey': 'رحلتك',
  'Four new ways to explore Services': 'أربع طرق جديدة تستكشف بيها الخدمات',
  'Ask out loud, keep what you like for later, change how the page looks, and pick up where you left off.':
    'اسأل بصوتك، احتفظ باللي يعجبك لبعدين، غيّر شكل الصفحة، وكمّل من مكان ما وقفت.',
  'Just ask, out loud': 'اسأل بصوتك وبس',
  'Press the red microphone and ask in Arabic or English. Your words appear as you speak. Rather type? The keyboard button is right beside it.':
    'دوس على المايك الأحمر واسأل بالعربي أو بالإنجليزي. كلامك بيظهر وانت بتتكلم. تحب تكتب؟ زرار الكيبورد جنبه على طول.',
  'It takes you there, and points': 'بيوديك للإجابة ويشاور عليها',
  'The guide finds the answer on Vodafone’s pages, opens the right one and highlights it. It never presses pay or subscribe for you: that tap is always yours.':
    'المرشد بيلاقي الإجابة في صفحات ڤودافون، يفتح الصفحة الصح ويحددها لك. عمره ما بيدوس دفع أو اشتراك بدالك: الدوسة دي دايمًا بتاعتك.',
  'Peel it off for later': 'اقلعها وخليها لبعدين',
  'Press “Pocket it” on any service. It peels off like a sticker and drops into your pocket. Changed your mind? “Put back” sticks it right back.':
    'دوس «في الجيب» على أي خدمة. هتتقلع زي الاستيكر وتنزل في جيبك. غيّرت رأيك؟ «رجّعها» بتلزقها مكانها تاني.',
  'Turn the page to your pocket': 'اقلب الصفحة على جيبك',
  'While you keep something, the corner of the page lifts. Press the pocket to turn the page and see everything you kept, with its link. It stays in this browser.':
    'طول ما في حاجة في جيبك، ركن الصفحة بيترفع. دوس على الجيب تقلب الصفحة وتشوف كل اللي احتفظت بيه بلينكه. وبيفضل في المتصفح ده.',
  'See the page another way': 'شوف الصفحة بشكل تاني',
  'Press “Reimagine this page” and pick a ready-made view: a cover flow, a flipbook, a 3D cube and more. One click, no AI call.':
    'دوس «غيّر شكل الصفحة» واختار شكل جاهز: تقليب الأغلفة، كتاب بيتقلّب، مكعب الخدمات وغيرهم. بدوسة واحدة ومن غير ذكاء اصطناعي.',
  'Same services in every view': 'نفس الخدمات في كل شكل',
  'Every view keeps each service, its description and its link, and adds nothing. “Original” brings the familiar page back whenever you like.':
    'كل شكل بيحتفظ بكل خدمة ووصفها ولينكها، ومفيش حاجة بتتضاف. «الأصلي» بيرجّعلك الصفحة المعتادة وقت ما تحب.',
  'Your journey stays with you': 'رحلتك معاك انت وبس',
  'Say yes to “Remember my journey” and the pages you explore are kept only in this browser, never sent anywhere. Pause or clear it any time; it deletes itself after 24 hours.':
    'لو وافقت على «افتكر رحلتي»، الصفحات اللي بتستكشفها بتتحفظ في المتصفح ده بس، ومش بتتبعت لأي مكان. تقدر توقفها مؤقتًا أو تمسحها في أي وقت، وبتتمسح لوحدها بعد 24 ساعة.',
  'Questions from where you’ve been': 'أسئلة من الأماكن اللي زرتها',
  'Open “Your journey” to look back through the pages you visited. It picks out what you explored and offers questions; press one and the guide answers on the page.':
    'افتح «رحلتك» وارجع للصفحات اللي زرتها. هتلاقي اللي اكتشفته وأسئلة جاهزة عنه؛ دوس على سؤال والمرشد يجاوبك على الصفحة.',
  'You’re all set': 'كده انت جاهز',
  'Try any of them now, or come back to these tips from the Tips button at the bottom of the page.':
    'جرّب أي واحدة دلوقتي، أو ارجع للنصايح دي من زرار «نصايح» تحت في الصفحة.',
  'Your journey needs the voice guide on this page, and it isn’t running here.': '«رحلتك» محتاجة المرشد الصوتي على الصفحة، وهو مش شغّال هنا.',
  'The voice guide isn’t running on this page, so there’s nothing to try here yet.': 'المرشد الصوتي مش شغّال على الصفحة دي، فمفيش حاجة تجرّبها هنا دلوقتي.',
  'Close tips': 'اقفل النصايح',
  carousel: 'عرض متتالي',
  tip: 'نصيحة',
  Back: 'رجوع',
  Next: 'التالي',
  'Get started': 'يلا نبدأ',
  Done: 'خلاص',
  '{n} of {total}': '{n} من {total}',
  'Go to {n} of {total}': 'روح لـ {n} من {total}',
  '{count} tips · about 2 minutes': '{count} نصايح · حوالي دقيقتين',
  'Try it': 'جرّبها',
  'Try it again': 'جرّبها تاني',
  'Not on this page': 'مش على الصفحة دي',
  // the scenes: the clone's own words, the trail's own words (voice-guide trail/i18n.ts), page names
  'Internet bundles': 'باقات النت',
  Subscribe: 'اشترك',
  'You press it': 'انت اللي تدوس',
  'Every service, every link': 'كل خدمة وكل لينك',
  'Remember my journey on this device': 'افتكر رحلتي على الجهاز ده',
  'It stays in this browser and deletes itself after {hours} hours.': 'بتفضل في المتصفح ده بس وبتتمسح لوحدها بعد {hours} ساعة.',
  'Remember my journey': 'افتكر رحلتي',
  Paused: 'متوقفة مؤقتًا',
  Pause: 'وقّف مؤقتًا',
  'Clear journey': 'امسح الرحلة دي',
  'You explored': 'اللي اكتشفته',
  'Only in this browser': 'في المتصفح ده بس',
  // the coach marks ("Try it")
  Skip: 'تخطّي',
  'Got it': 'تمام',
  'Back to tips': 'ارجع للنصايح',
  'Step {n} of {total}': 'خطوة {n} من {total}',
  'Press the microphone': 'دوس على المايك',
  'Then ask: “{example}”': 'وبعدين اسأل: «{example}»',
  'That’s the guide': 'ده المرشد',
  'Ask your question. Your words appear above the microphone as you speak.': 'اسأل سؤالك. كلامك بيظهر فوق المايك وانت بتتكلم.',
  'Press “Pocket it”': 'دوس «في الجيب»',
  'Watch {title} peel off and drop into your pocket.': 'اتفرّج على «{title}» وهي بتتقلع وتنزل في جيبك.',
  'Watch it peel off and drop into your pocket.': 'اتفرّج عليها وهي بتتقلع وتنزل في جيبك.',
  'Now open your pocket': 'افتح جيبك بقى',
  'The corner lifted because you kept something. Press it to turn the page.': 'ركن الصفحة اترفع عشان احتفظت بحاجة. دوس عليه تقلب الصفحة.',
  'This is your pocket': 'ده جيبك',
  'Everything you keep waits here, with its link. “Back to Services” turns the page back.': 'كل اللي بتحتفظ بيه مستنيك هنا بلينكه. «ارجع للخدمات» بيقلب الصفحة تاني.',
  'That’s your pocket': 'ده جيبك',
  'Peel off anything else you like. It stays in this browser.': 'اقلع أي حاجة تانية تعجبك. وبتفضل في المتصفح ده.',
  'Press “Reimagine this page”': 'دوس «غيّر شكل الصفحة»',
  'It opens the ready-made views.': 'هيفتحلك الأشكال الجاهزة.',
  'Pick “{name}”': 'اختار «{name}»',
  'Or any other view. One click, no AI call.': 'أو أي شكل تاني. بدوسة واحدة ومن غير ذكاء اصطناعي.',
  'Switch back any time': 'ارجع وقت ما تحب',
  '“Original” brings back the familiar page; “Reimagined” returns to this view.': '«الأصلي» بيرجّع الصفحة المعتادة، و«الشكل الجديد» بيرجّعك للشكل ده.',
  'That’s Reimagine': 'ده «غيّر شكل الصفحة»',
  'Try another view whenever you like. Every one keeps the same services.': 'جرّب شكل تاني وقت ما تحب. كل شكل فيه نفس الخدمات.',
  'Press “Your journey”': 'دوس «رحلتك»',
  'See the pages you visited, what you explored and the questions they lead to. The first time, it asks before remembering anything.':
    'شوف الصفحات اللي زرتها، واللي اكتشفته، والأسئلة اللي بتوديك ليها. أول مرة هتستأذنك قبل ما تفتكر أي حاجة.',
  'That’s your journey': 'دي رحلتك',
  'It stays in this browser. Pause or clear it from your journey whenever you like.': 'بتفضل في المتصفح ده. وقّفها أو امسحها من «رحلتك» وقت ما تحب.',
}

/** UI copy in the page's language; English is the key and the fallback. */
export const t = (text, values = {}) => {
  const s = (lang === 'ar' && AR[text]) || text
  return s.replace(/\{(\w+)\}/g, (match, name) => (name in values ? String(values[name]) : match))
}

/** "3 items" in the page's language (Arabic counts: one, two, 3–10, 11 and up). */
export const countItems = (n) => {
  if (lang !== 'ar') return `${n} ${n === 1 ? 'item' : 'items'}`
  if (n === 1) return 'خدمة واحدة'
  if (n === 2) return 'خدمتين'
  return n >= 3 && n <= 10 ? `${n} خدمات` : `${n} خدمة`
}

/** "12 services" / "12 خدمة" (English keeps the experiences' plain plural). */
export const countServices = (n) => (lang === 'ar' ? countItems(n) : `${n} services`)

/** "6 categories" / "6 أقسام", with Arabic number agreement. */
export const countCategories = (n) => {
  if (lang !== 'ar') return `${n} categories`
  if (n === 1) return 'قسم واحد'
  if (n === 2) return 'قسمين'
  return n >= 3 && n <= 10 ? `${n} أقسام` : `${n} قسم`
}
