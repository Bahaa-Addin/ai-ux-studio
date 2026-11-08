/**
 * The clone's own UI copy in the page's language (the Arabic Services page, 2026-11-05).
 *
 * The English text is the key: t('Pocket it') is 'Pocket it' on the English page and 'في الجيب'
 * on the Arabic one, so English behaviour cannot change. {name} placeholders take values.
 * Vodafone's own copy is not here: it lives in src/content (page) and src/shell.js (header, footer).
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
  'Put back {title}': 'رجّع {title}',
  'Put back': 'رجّعها',
  'In your pocket': 'في جيبك',
  'View more': 'اعرف اكتر',
  'Remove {title} from your pocket': 'شيل {title} من جيبك',
  Remove: 'شيل',
  'Nothing here yet.': 'لسه مفيش حاجة هنا.',
  'Your pocket is empty.': 'جيبك فاضي.',
  'Your pocket, {count}.': 'جيبك، {count}.',
  'Play with the Pocket drone': 'العب مع درون الجيب',
  // Reimagine this page (the composer)
  'Reimagine this page': 'غيّر شكل الصفحة',
  'Describe how you’d like to experience this page…': 'اوصف إزاي تحب تشوف الصفحة…',
  Reimagine: 'غيّر الشكل',
  Cancel: 'إلغاء',
  'Composing your page…': 'بنجهّز صفحتك…',
  'Ready-made experiences': 'أشكال جاهزة',
  'Inspired by {title} by {author}': 'مستوحى من {title} لـ{author}',
  // Reimagined experiences: shared (src/aixc/experiences/shared.js)
  'More services': 'خدمات تانية',
  'From {sources}': 'من {sources}',
  'View service': 'شوف الخدمة',
  'QR code to download the Ana Vodafone app': 'كود QR لتحميل تطبيق أنا ڤودافون',
  'Your current view is unchanged.': 'الشكل الحالي زي ما هو.',
  'Showing the built-in magazine layout instead.': 'وبدل كده بنعرض شكل المجلة المدمج.',
  'API key removed from this browser.': 'المفتاح اتمسح من المتصفح ده.',
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
  "carousel": "عرض شرايح",
  "{n} of {total}: {title}": "{n} من {total}: {title}",
  "Show {title}": "اعرض {title}",
  "Up next": "اللي جاي",
  "Previous service": "الخدمة اللي قبلها",
  "Next service": "الخدمة اللي بعدها",
  "Pause automatic rotation": "وقّف التقليب التلقائي",
  "Start automatic rotation": "شغّل التقليب التلقائي",
  "Jump to a category": "روح لنوع خدمات",
  "Vodafone services spotlight": "خدمات ڤودافون تحت الضوء",
  "{title}, piece {n} of {total}": "{title}، برواز {n} من {total}",
  "Previous piece": "البرواز اللي قبله",
  "Next piece": "البرواز اللي بعده",
  "Scroll, or use the arrows, to walk along the wall.": "انزل أو استخدم الأسهم عشان تتمشى جنب الحيطة.",
  "Gallery of Vodafone services": "معرض خدمات ڤودافون",
  "No. {n}": "رقم {n}",
  "In this category": "في النوع ده",
  "{n} of {total}": "{n} من {total}",
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
  'One click, no API key. Each keeps every service, description and link.': 'بدوسة واحدة ومن غير مفتاح API. كل شكل بيحتفظ بكل خدمة ووصفها ولينكها.',
  'Paste a Gemini API key': 'الصق مفتاح Gemini API',
  'Save settings': 'احفظ الإعدادات',
  'Remove key': 'امسح المفتاح',
  'Use built-in layout': 'استخدم الشكل المدمج',
  'Gemini settings': 'إعدادات Gemini',
  Model: 'الموديل',
  'Remember the key in this browser': 'افتكر المفتاح في المتصفح ده',
  'This prototype calls Gemini straight from your browser, so the key is readable by anyone using this page. Use a restricted test key, and never deploy this publicly without a server-side proxy.':
    'النموذج ده بيكلم Gemini من متصفحك مباشرة، فأي حد بيستخدم الصفحة يقدر يقرا المفتاح. استخدم مفتاح تجريبي محدود، وما تنشرهاش للعامة من غير proxy على السيرفر.',
  'Close composer': 'اقفل',
  'Or describe your own': 'أو اوصف الشكل اللي تحبه',
  'Pick an experience or describe one. The same Vodafone services, descriptions and links are recomposed; nothing is added.':
    'اختار شكل أو اوصفه. نفس خدمات ڤودافون ووصفها ولينكاتها بتترتب من جديد، ومفيش حاجة بتتضاف.',
  Original: 'الأصلي',
  Reimagined: 'الشكل الجديد',
  Change: 'غيّر',
  Reset: 'رجّع الأصلي',
  'Page view': 'عرض الصفحة',
  'Page view controls': 'التحكم في عرض الصفحة',
  'Key from .env.local': 'مفتاح من ‎.env.local',
  'Key added': 'المفتاح اتضاف',
  'Not configured': 'مش متظبط',
  'This page has no content that can be recomposed.': 'الصفحة دي مفيهاش محتوى ينفع يترتب من جديد.',
  'Ready-made template, no AI call': 'شكل جاهز، من غير ذكاء اصطناعي',
  'Built-in layout, not AI-generated': 'شكل مدمج، مش من الذكاء الاصطناعي',
  'Composed by Gemini ({model})': 'اتعمل بـ Gemini ({model})',
  'Filtered view: {placed} of {total} items shown, as requested. Original shows everything.': 'عرض مفلتر: {placed} من {total} ظاهرين زي ما طلبت. الأصلي فيه كل حاجة.',
  '{count} left out by the layout was added back so nothing is lost.': '{count} كانت ناقصة من الشكل ورجّعناها، عشان مايضيعش حاجة.',
  '{count} left out by the layout were added back so nothing is lost.': '{count} كانت ناقصة من الشكل ورجّعناها، عشان مايضيعش حاجة.',
  'Your reimagined layout is ready. Choose Reimagined to see it.': 'الشكل الجديد جاهز. اختار «الشكل الجديد» عشان تشوفه.',
  'Gemini returned a layout that could not be used.': 'Gemini رجّع شكل مينفعش يتستخدم.',
  'Describe the presentation you want, or pick a suggestion.': 'اوصف العرض اللي عايزه، أو اختار اقتراح.',
  'Gemini is not configured, so your prompt was matched to the ready-made {name} experience.': 'Gemini مش متظبط، فطلبك اتطابق مع الشكل الجاهز «{name}».',
  'Showing the built-in layout. Add a Gemini API key in Gemini settings to compose from your prompt.': 'ده الشكل المدمج. ضيف مفتاح Gemini API من إعدادات Gemini عشان الصفحة تترتب من طلبك.',
  'Gemini is not configured, so the built-in magazine layout is shown. Add a key in Gemini settings to compose from your prompt.':
    'Gemini مش متظبط، فده شكل المجلة المدمج. ضيف مفتاح من إعدادات Gemini عشان الصفحة تترتب من طلبك.',
  'Composing your page.': 'بنجهّز صفحتك.',
  'Request cancelled. Your current view is unchanged.': 'الطلب اتلغى، والعرض الحالي زي ما هو.',
  'That experience is not available yet, so the built-in magazine layout is shown.': 'الشكل ده لسه مش متاح، فده شكل المجلة المدمج.',
  'Page reset to the original view.': 'الصفحة رجعت للشكل الأصلي.',
  'Gemini settings saved.': 'إعدادات Gemini اتحفظت.',
  'Model saved. Add an API key to use Gemini.': 'الموديل اتحفظ. ضيف مفتاح API عشان تستخدم Gemini.',
  '{name} ready.': '{name} جاهز.',
  "That exact experience isn't available yet, so your request was applied as {name}.": 'الشكل ده بالظبط لسه مش متاح، فطلبك اتطبّق كـ«{name}».',
  // ready-made experiences: names and the line under each
  'Reimagined view': 'الشكل الجديد',
  'Magazine experience': 'شكل المجلة',
  'Streaming showcase': 'عرض المنصات',
  'Make it a streaming-style home with a cinematic logo intro and rows of services.': 'خليها زي صفحة منصة مشاهدة: مقدمة سينمائية للوجو وصفوف خدمات.',
  'Split slideshow': 'شرائح مقسومة',
  'Show each service as a full-screen split slideshow whose halves slide past each other as I scroll.': 'اعرض كل خدمة على الشاشة كلها، نصّين بيتحركوا عكس بعض وأنا بانزل.',
  'Card fan': 'مروحة كروت',
  'Fan the services out as a stack of numbered cards I can drag or scroll through.': 'افرد الخدمات كروت مترقمة أسحبها أو أقلّب فيها.',
  'Service ring': 'حلقة الخدمات',
  'Put the services on a 3D ring that turns as I scroll, stopping on each one.': 'حط الخدمات على حلقة ثلاثية الأبعاد بتلف وأنا بانزل وتقف عند كل واحدة.',
  'Hyper tunnel': 'النفق السريع',
  'Fly me through a 3D tunnel of service cards that warps as I scroll faster.': 'طيّرني جوه نفق ثلاثي الأبعاد من كروت الخدمات، وكل ما أسرّع يتشكّل أكتر.',
  'Infinite canvas': 'لوحة مفتوحة',
  'Lay the services out on an endless canvas I can drag around, and zoom into any card.': 'افرد الخدمات على لوحة مالهاش آخر أسحبها في كل اتجاه وأقرّب على أي كارت.',
  'Cover flow': 'تقليب الأغلفة',
  'Let me flip through the services like album covers in a cover flow.': 'خليني أقلّب في الخدمات زي أغلفة الألبومات.',
  'Spotlight cards': 'كروت تحت الضوء',
  'Show each service as a full-screen spotlight, with the next services lined up as cards.': 'اعرض كل خدمة لوحدها على الشاشة كلها، واللي بعدها مستنية كروت.',
  'Scroll journey': 'رحلة بالنزول',
  'Turn the page into a parallax scroll journey through each service category.': 'حوّل الصفحة لرحلة بتتحرك طبقاتها وأنا بانزل في كل نوع خدمات.',
  'Gallery wall': 'حيطة معرض',
  'Present every service as a framed piece on a 3D gallery wall I can walk along.': 'اعرض كل خدمة في برواز على حيطة معرض ثلاثية الأبعاد أتمشى جنبها.',
  Flipbook: 'كتاب بيتقلّب',
  'Make the page a flipbook, with a two-page spread for each service category.': 'خلي الصفحة كتاب بيتقلّب، صفحتين لكل نوع خدمات.',
  'Service cube': 'مكعب الخدمات',
  'Put each service category on a face of a 3D cube that turns as I scroll.': 'حط كل نوع خدمات على وش من مكعب ثلاثي الأبعاد بيلف وأنا بانزل.',
  'Editorial magazine': 'مجلة',
  'Turn this into an editorial magazine.': 'حوّلها لمجلة.',
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
