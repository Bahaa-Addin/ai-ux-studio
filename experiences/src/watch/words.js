/**
 * The page watch's words (voice-guide ADR-0078 point 8; phase 6 design §4.7), in English and Egyptian
 * Arabic, in their own file: the shared i18n.js chunk, which the Pocket and Reimagine's shell carry, does
 * not grow. The Arabic follows the Pocket's own (i18n.js: «في الجيب», «رجّعها», «اتحفظت {date}»).
 *
 * Arabic strings for O42's native review (added 2026-11-18, phase 6 step 4):
 *   tell        قولّي لما تتغيّر
 *   tellLabel   قولّي لما «{title}» تتغيّر
 *   watching    بنتابعها
 *   stop        وقّف المتابعة
 *   stopLabel   وقّف متابعة «{title}»
 *   noChange    مفيش تغيير من {date}
 *   changed     اتغيّرت
 *   changedOn   اتغيّرت {date}
 *   card        الكارت ده اتغيّر
 *   page        الصفحة اللي بتفتحها اتغيّرت
 *   link        بقت بتفتح صفحة تانية
 *   missing     مبقتش موجودة في صفحتها
 *   gone        صفحتها اتشالت
 *   back        رجعت لصفحتها
 *   open        افتح الصفحة
 *   script      صفحتها بتترسم بسكريبت، فبنتابع الكارت بس
 *   other-site  بتفتح موقع تاني، فبنتابع الكارت بس
 *   not-allowed صفحتها مينفعش نتابعها
 *   no-link     ملهاش صفحة نتابعها
 *   maxWatched  إنت بتتابع {max} حاجة، وده أقصى عدد
 *   unavailable المتابعة مش متاحة دلوقتي
 *   button      {base}، {count} اتغيّرت
 *   linerLabel  «{title}» اتغيّرت. شوفها في جيبك
 */
export const WORDS = {
  en: {
    tell: 'Tell me when this changes',
    tellLabel: 'Tell me when {title} changes',
    watching: 'Watching',
    stop: 'Stop watching',
    stopLabel: 'Stop watching {title}',
    noChange: 'No change since {date}',
    changed: 'Changed',
    changedOn: 'Changed {date}',
    card: 'This card changed',
    page: 'The page it opens changed',
    link: 'It now opens a different page',
    missing: 'No longer on its page',
    gone: 'Its page is gone',
    back: 'Back on its page',
    open: 'Open the page',
    script: 'Its page is drawn by script, so only the card is watched',
    'other-site': 'It opens another site, so only the card is watched',
    'not-allowed': 'Its page can’t be watched',
    'no-link': 'It has no page to watch',
    maxWatched: 'You are watching {max}, the most at once',
    unavailable: 'Watching isn’t available right now',
    button: '{base}, {count} changed',
    linerLabel: '{title} changed. See it in your pocket',
  },
  ar: {
    tell: 'قولّي لما تتغيّر',
    tellLabel: 'قولّي لما «{title}» تتغيّر',
    watching: 'بنتابعها',
    stop: 'وقّف المتابعة',
    stopLabel: 'وقّف متابعة «{title}»',
    noChange: 'مفيش تغيير من {date}',
    changed: 'اتغيّرت',
    changedOn: 'اتغيّرت {date}',
    card: 'الكارت ده اتغيّر',
    page: 'الصفحة اللي بتفتحها اتغيّرت',
    link: 'بقت بتفتح صفحة تانية',
    missing: 'مبقتش موجودة في صفحتها',
    gone: 'صفحتها اتشالت',
    back: 'رجعت لصفحتها',
    open: 'افتح الصفحة',
    script: 'صفحتها بتترسم بسكريبت، فبنتابع الكارت بس',
    'other-site': 'بتفتح موقع تاني، فبنتابع الكارت بس',
    'not-allowed': 'صفحتها مينفعش نتابعها',
    'no-link': 'ملهاش صفحة نتابعها',
    maxWatched: 'إنت بتتابع {max} حاجة، وده أقصى عدد',
    unavailable: 'المتابعة مش متاحة دلوقتي',
    button: '{base}، {count} اتغيّرت',
    linerLabel: '«{title}» اتغيّرت. شوفها في جيبك',
  },
}

/**
 * The day and short month in the page's language (18 Nov; ١٨ نوفمبر with Latin digits, as the Pocket's
 * own "Saved {date}" line writes them in Arabic). '' when the date cannot be written.
 */
export const dayOf = (ms, lang) => {
  try {
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' }).format(ms)
  } catch {
    return ''
  }
}

/** w(key, vars): the words of `lang` ('ar', else English), {name} filled from vars; w.date(ms) and w.lang. */
export const wordsFor = (lang) => {
  const own = lang === 'ar' ? 'ar' : 'en'
  const w = (key, vars = {}) => (WORDS[own][key] ?? WORDS.en[key] ?? key).replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m))
  w.lang = own
  w.date = (ms) => dayOf(ms, own)
  return w
}
