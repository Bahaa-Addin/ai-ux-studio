/**
 * The words Reimagine's shell says on Vodafone's own pages that the clone's copy (src/i18n.js) does not have
 * (live plan phase 4a; voice-guide ADR-0076). English is the key, as in i18n.js. The Arabic waits for the native
 * review (O17), which gates phase 4c's live check.
 */
import { lang } from '../../../i18n.js'

const AR = {
  'Original page': 'الصفحة الأصلية',
  'Continue to the page': 'كمّل لباقي الصفحة',
  'The page changed after this view was made. Choose an experience again to see it.': 'الصفحة اتغيّرت بعد ما العرض ده اتعمل. اختار الشكل تاني عشان تشوف التغيير.',
}

/** The shell's own words in the page's language. */
export const say = (text) => (lang === 'ar' && AR[text]) || text
