/**
 * Normalized content model for https://web.vodafone.com.eg/ar/services (the Arabic Services page).
 *
 * Same sections, items, ids, images and layout as the English model (./vodafone-services.js);
 * only the copy and the links are Arabic. Built on the English model so the two pages can never
 * drift apart in structure, and so every item keeps the knowledge-base destination it recreates.
 *
 * Provenance
 * - Captured from the live page on 2026-11-05 (public, no sign-in; robots.txt allows it):
 *   copy, links and image URLs, aligned with the English page element by element.
 * - Every picture on the Arabic page is pixel-identical to the English clone's local asset
 *   (compared 2026-11-05), so the images are shared.
 * - Copy is kept exactly as published, including source typos ("معلوات", "ڤودافو",
 *   "تسمتع", "الدوليتواصل") and mixed spellings (فودافون / ڤودافون, شكرا / شكراً).
 *
 * Known source anomalies
 * - The Shokran carousel lists عالنوتة before كلمنى (English: Kallemny before 3alnota); the
 *   Arabic order is kept (ORDER below). Items were matched by meaning; the pictures confirm it.
 * - The live "خدمة الميني كول" card links to /spa/roaming; normalised to /ar/mini-call (checked
 *   2026-11-05), as the English clone normalises its malformed Edfa3ly link.
 * - "عالم ماما" links to a templated vf-live URL with unfilled %hashValue%; it uses the shared
 *   Ana Vodafone flow like its siblings, as in the English model.
 * - Like the English page, "اتحكم في حسابك" has a 5th card ("تحويل رصيد" → Shokran) not modelled.
 */
import { vodafoneServicesPage as en } from './vodafone-services.js'

const VF = 'https://web.vodafone.com.eg'
const ANA_VODAFONE = 'https://vf.eg/anavodafone'

const sections = {
  cash: { title: 'ڤودافون كاش', description: null },
  'stay-in-control': { title: 'اتحكم في حسابك', description: 'اتحكم فى كل ما يخص خطك من فواتير او شحن او خدمات' },
  'call-and-connect-abroad': { title: 'خليك على اتصال مع كل مكان في العالم', description: null },
  'great-entertainment': {
    title: 'ترفيه بلا حدود',
    description: 'استمتع بالخدمات الترفيهية من ڤودافون و اختار خدماتك المفضلة',
    cta: { label: 'حمّل تطبيق أنا ڤودافون', href: ANA_VODAFONE },
    aside: { title: 'حمّل تطبيق انا فودافون', description: 'صوّر الكود لتسمتع بالخدمة' },
  },
  'shokran-services': { title: 'خدمات شكرا', description: null },
  'other-services': { title: 'خدمات تهمك', description: null },
}

/** Where the Arabic page orders items differently from the English one. */
const ORDER = {
  'shokran-services': ['sallefny-shokran', '3alnota-shokran', 'kallemny-shokran', 'edfa3ly-shokran', 'rennely-shokran', 'wasalny-shokran'],
}

const items = {
  'vodafone-cash': { title: 'ڤودافون كاش', description: 'ڤودافون كاش هي محفظة الكترونية على موبايلك تقدر تسيب فيها فلوسك وتسحبها أو تستخدمها في آي وقت ومن آي مكان بدوسة.', cta: { label: 'اعرف اكتر', href: `${VF}/ar/vodafone-cash` } },
  'balance-transfer': { title: 'تحويل الرصيد', description: null, cta: { label: 'اعرف اكتر', href: `${VF}/spa/balanceTransfer` } },
  'end-of-call-notifications': { title: 'معرفة الرصيد بعد انتهاء المكالمة', description: null, cta: { label: 'اعرف اكتر', href: `${VF}/ar/end-of-call` } },
  'calls-services': { title: 'خدمات المكالمات', description: null, cta: { label: 'اعرف اكتر', href: `${VF}/spa/vodafone-services` } },
  'international-balance-transfer': { title: 'تحويل الرصيد الدولي', description: null, cta: { label: 'اعرف اكتر', href: `${VF}/ar/international-balance-transfer` } },
  'roaming': { title: 'خدمات التجوال', description: 'خليك دايماً على اتصال مع حبايبك وأسرتك بالمكالمات والرسائل والانترنت الغير محدود من غير قلق وبأفضل الأسعار', cta: { label: null, href: `${VF}/spa/roaming` } },
  'visiting-egypt': { title: 'زيارة مصر', description: 'خليك دايما على اتصال بحبايبك واستمتع بخدمات أقوى شبكة في العالم وانت بتزور مصر', cta: { label: null, href: `${VF}/ar/visiting-egypt` } },
  'international-standard-rates': { title: 'الاتصال الدولي', description: 'الاتصال الدوليتواصل مع جميع أنحاء العالم من خلال خدماتنا للاتصال الدولي. وسيتم محاسبتك وفقا لتعريفة النظام الخاص بك والدولة التي تتصل بها', cta: { label: null, href: `${VF}/ar/international-calls` } },
  'mo-salah-world': { title: 'عالم محمد صلاح', description: 'اشترك واتفرج على فيديوهات صلاح و قناة ليفربول الرسمية', cta: { label: 'اشترك الان', href: ANA_VODAFONE } },
  '3alam-mama': { title: 'عالم ماما', description: 'معلوات تهمك من بداية الحمل لحد ما ابنك يكبر', cta: { label: 'اشترك الان', href: ANA_VODAFONE } },
  'henedy-world': { title: 'عالم هنيدي', description: 'اشترك و تابع كل أخبار و كواليس محمد هنيدي', cta: { label: 'اشترك الان', href: ANA_VODAFONE } },
  'vf-play': { title: 'VF Play', description: 'استمتع بتجربة العاب جديدة على VF Play ببلاش', cta: { label: 'اشترك الان', href: ANA_VODAFONE } },
  '90-mins': { title: '90 دقيقة', description: 'تابع اخر اخبار الدوري الاوروبي', cta: { label: 'اشترك الان', href: ANA_VODAFONE } },
  'play-and-win': { title: 'العب و اكسب', description: 'جاوب صح على 10 أسئلة واكسب 10,000 جنيه', cta: { label: 'اشترك الان', href: `${VF}/ar/play-win` } },
  'el-hadaba-world': { title: 'عالم الهضبة', description: 'اعرف اخر اخبار عمرو دياب', cta: { label: 'اشترك الان', href: ANA_VODAFONE } },
  'sallefny-shokran': { title: 'سلفنى شكراً', description: 'دلوقتى ممكن تستلف من اول 4 جنيه لحد 32 جنية على حسب استخدامك.', cta: { label: null, href: `${VF}/ar/shokran-services` } },
  'kallemny-shokran': { title: 'كلمنى شكراً', description: 'لكل عملاء ڤودافون الكارت، رسالتين "كلمنى شكراً " مجاناً يومياً لأى رقم ڤودافون', cta: { label: null, href: `${VF}/ar/shokran-services` } },
  '3alnota-shokran': { title: 'عالنوتة شكراً', description: 'الكلام مش هيخلص حتى لو رصيدك خلص', cta: { label: null, href: `${VF}/ar/shokran-services` } },
  'edfa3ly-shokran': { title: 'ادفعلي شكرا', description: 'مع خدمة "ادفعلي شكراً" تقدر تكلم أي رقم ڤودافون على حسابه', cta: { label: null, href: `${VF}/ar/shokran-services` } },
  'rennely-shokran': { title: 'رنلى شكراً', description: 'رصيدك لو خلص الكلام مخلصش مع خدمة “رنلي شكراً” هتقدر ترن لأي رقم بدون رصيد', cta: { label: null, href: `${VF}/ar/shokran-services` } },
  'wasalny-shokran': { title: 'وصلني شكراً', description: 'مع ڤودافون متخليش الزحمة توقفك', cta: { label: null, href: `${VF}/ar/shokran-services` } },
  'mini-call': { title: 'خدمة الميني كول', description: 'عايز توصل رسالة من غير ما تكتبها أو تتصل بحد؟ ابعت ميني كول', cta: { label: null, href: `${VF}/ar/mini-call` } },
  'multi-sim': { title: 'خدمة الشرائح المتعددة', description: 'تتيح خدمة البطاقات المتعددة من فودافون تشغيل بطاقتي SIM إضافيتين SIM1 وSIM2 من هاتفك المحمول الحالي (SIM 0)', cta: { label: null, href: `${VF}/ar/multi-sim` } },
  'short-numbers': { title: 'الأرقام المختصرة', description: 'اوصل لمجموعة كبيرة من النغمات والصور والأغاني ودليل السينما بأرقام مختصرة وسهلة', cta: { label: null, href: `${VF}/ar/short-numbers` } },
  'visa-appointment': { title: 'مواعيد الفيزا في السفارات', description: 'إذا كنت تفكر في السفر للخارج، وتريد التقدم للحصول على تأشيرة لأوروبا، يمكنك مع فودافون تسهيل الإجراءات', cta: { label: null, href: `${VF}/ar/visa-appointment` } },
  'park-your-line': { title: 'خدمة اركن خطك', description: 'وقف خطك مؤقتا مع فودافون', cta: { label: null, href: `${VF}/ar/park-your-line` } },
  'vodafone-advertising': { title: 'خدمة إعلاناتي', description: 'اعرف آخر العروض والتخفيضات في المحلات المفضلة لديك في مصر بالاشتراك في خدمة إعلاناتي من ڤودافو', cta: { label: null, href: `${VF}/ar/vodafone-advertising` } },
  'vodafone-arabeety': { title: 'خدمة عربيتى', description: 'تقدم شركة ڤودافون بالتعاون مع شركة (ETIT) لتتبع المركبات الحل المثالي للتتبع اللحظي فى أي مكان و فى كل وقت', cta: { label: null, href: `${VF}/ar/3arabety` } },
  'join-without-changing-number': { title: 'التحويل لڤودافون بنفس رقمك', description: 'دلوقتي تقدر تحول لڤودافون بنفس رقمك بسهولة وتستمتع بكل الخدمات والعروض.', cta: { label: null, href: `${VF}/ar/join-us-without-changing-your-number` } },
}

export const vodafoneServicesPageAr = {
  ...en,
  pageId: 'vodafone-services-ar',
  lang: 'ar',
  sourceUrl: `${VF}/ar/services`,
  capturedOn: '2026-11-05',
  linksVerifiedOn: '2026-11-05',
  title: 'خدمات ڤودافون',
  intro: 'اتحكم فى كل ما يخص خطك من فواتير او شحن او خدمات',
  closingPromotion: {
    ...en.closingPromotion,
    title: 'حمّل أنا ڤودافون',
    lead: 'كل اللي ممكن تحتاجه من خدمات ڤودافون بقى حرفياً بين ايديك!',
    description: 'اتحكم في خطك وتابع فواتيرك واستهلاكك بأسهل طريقة',
    storesLabel: 'متاح على',
    qr: { ...en.closingPromotion.qr, title: 'صوّر الكود وحمّل التطبيق' },
  },
  sections: en.sections.map((section) => {
    const ar = sections[section.id]
    return {
      ...section,
      ...ar,
      aside: section.aside && ar.aside ? { ...section.aside, ...ar.aside } : section.aside,
      items: (ORDER[section.id] ? ORDER[section.id].map((id) => section.items.find((item) => item.id === id)) : section.items).map((item) => ({
        ...item,
        ...items[item.id],
        cta: item.cta && items[item.id].cta,
      })),
    }
  }),
}
