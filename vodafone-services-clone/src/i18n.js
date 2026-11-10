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
  'Opening {title}': 'بنفتح {title}',
  // Reimagine this page (the composer)
  'Reimagine this page': 'غيّر شكل الصفحة',
  'Describe how you’d like to experience this page…': 'اوصف إزاي تحب تشوف الصفحة…',
  Reimagine: 'غيّر الشكل',
  Cancel: 'إلغاء',
  'Composing your page…': 'بنجهّز صفحتك…',
  'Ready-made experiences': 'أشكال جاهزة',
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
