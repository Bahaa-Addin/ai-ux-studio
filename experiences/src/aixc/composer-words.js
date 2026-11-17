/**
 * The clone composer's own words in Arabic: what only src/aixc/controller.js says (its prompt, its Gemini, key and
 * model settings, what it says about a composition) and the templates' prompt lines (./templates.js). Kept out of
 * ../i18n.js, which Reimagine's shell on Vodafone's own pages shares with the Pocket (voice-guide ADR-0076): no word
 * of Gemini, a key or a prompt reaches a live page (voice-guide tests/unit/sdk-size.test.ts checks its chunks).
 *
 * As ../i18n.js: the English text is the key and the fallback; {name} placeholders take values. Every other word is
 * ../i18n.js's, so the controller asks this module for all of them.
 */
import { lang, t as words } from '../i18n.js'

const AR = {
  'Describe how you’d like to experience this page…': 'اوصف إزاي تحب تشوف الصفحة…',
  Reimagine: 'غيّر الشكل',
  Cancel: 'إلغاء',
  'Composing your page…': 'بنجهّز صفحتك…',
  'Inspired by {title} by {author}': 'مستوحى من {title} لـ{author}',
  'Your current view is unchanged.': 'الشكل الحالي زي ما هو.',
  'Showing the built-in magazine layout instead.': 'وبدل كده بنعرض شكل المجلة المدمج.',
  'API key removed from this browser.': 'المفتاح اتمسح من المتصفح ده.',
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
  'Or describe your own': 'أو اوصف الشكل اللي تحبه',
  'Pick an experience or describe one. The same Vodafone services, descriptions and links are recomposed; nothing is added.':
    'اختار شكل أو اوصفه. نفس خدمات ڤودافون ووصفها ولينكاتها بتترتب من جديد، ومفيش حاجة بتتضاف.',
  'Key from .env.local': 'مفتاح من ‎.env.local',
  'Key added': 'المفتاح اتضاف',
  'Not configured': 'مش متظبط',
  'This page has no content that can be recomposed.': 'الصفحة دي مفيهاش محتوى ينفع يترتب من جديد.',
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
  'Gemini settings saved.': 'إعدادات Gemini اتحفظت.',
  'Model saved. Add an API key to use Gemini.': 'الموديل اتحفظ. ضيف مفتاح API عشان تستخدم Gemini.',
  "That exact experience isn't available yet, so your request was applied as {name}.": 'الشكل ده بالظبط لسه مش متاح، فطلبك اتطبّق كـ«{name}».',
  'Make it a streaming-style home with a cinematic logo intro and rows of services.': 'خليها زي صفحة منصة مشاهدة: مقدمة سينمائية للوجو وصفوف خدمات.',
  'Show each service as a full-screen split slideshow whose halves slide past each other as I scroll.': 'اعرض كل خدمة على الشاشة كلها، نصّين بيتحركوا عكس بعض وأنا بانزل.',
  'Fan the services out as a stack of numbered cards I can drag or scroll through.': 'افرد الخدمات كروت مترقمة أسحبها أو أقلّب فيها.',
  'Put the services on a 3D ring that turns as I scroll, stopping on each one.': 'حط الخدمات على حلقة ثلاثية الأبعاد بتلف وأنا بانزل وتقف عند كل واحدة.',
  'Fly me through a 3D tunnel of service cards that warps as I scroll faster.': 'طيّرني جوه نفق ثلاثي الأبعاد من كروت الخدمات، وكل ما أسرّع يتشكّل أكتر.',
  'Lay the services out on an endless canvas I can drag around, and zoom into any card.': 'افرد الخدمات على لوحة مالهاش آخر أسحبها في كل اتجاه وأقرّب على أي كارت.',
  'Let me flip through the services like album covers in a cover flow.': 'خليني أقلّب في الخدمات زي أغلفة الألبومات.',
  'Show each service as a full-screen spotlight, with the next services lined up as cards.': 'اعرض كل خدمة لوحدها على الشاشة كلها، واللي بعدها مستنية كروت.',
  'Turn the page into a parallax scroll journey through each service category.': 'حوّل الصفحة لرحلة بتتحرك طبقاتها وأنا بانزل في كل نوع خدمات.',
  'Present every service as a framed piece on a 3D gallery wall I can walk along.': 'اعرض كل خدمة في برواز على حيطة معرض ثلاثية الأبعاد أتمشى جنبها.',
  'Make the page a flipbook, with a two-page spread for each service category.': 'خلي الصفحة كتاب بيتقلّب، صفحتين لكل نوع خدمات.',
  'Put each service category on a face of a 3D cube that turns as I scroll.': 'حط كل نوع خدمات على وش من مكعب ثلاثي الأبعاد بيلف وأنا بانزل.',
  'Turn this into an editorial magazine.': 'حوّلها لمجلة.',
}

/** The composer's copy in the page's language: its own words here, every other word ../i18n.js's. */
export const t = (text, values = {}) => words((lang === 'ar' && AR[text]) || text, values)
