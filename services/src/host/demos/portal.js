/**
 * The Pocket's portal on Vodafone's own pages (live plan phase 3 S13; experiences ADR-0005): a chunk of
 * its own, which the Pocket chunk (./pocket.js) loads when the album opens, or at once when this history
 * entry says the album was open (Back from a page the portal opened). A page whose album never opens
 * never loads it.
 *
 * It is the clone's portal (../../pocket/portal/portal.js) with the live options: only a sticker's own
 * link in the album leaves through it (Vodafone's header and footer stay native), to this page's origin
 * only, the destination fetched once and drawn in a frame that runs no scripts. Its stylesheet goes on
 * the page as text, once, in a marked <style> (the layer's ensureCss); every node it adds is marked.
 * The scene (../../pocket/portal/controller.js and what it imports) stays a chunk of its own, which the
 * portal loads when the album opens.
 *
 * No error of the portal stops the layer: every listener, timer and frame it registers runs through a
 * catch-all that reports and carries on, and a transition that fails ends in the link's own navigation.
 */
import css from '../../pocket/portal/portal.css'
import { initPocketPortal } from '../../pocket/portal/portal.js'

/** "Opening {title}" in the page's language, without the clone's dictionary. */
const OPENING = { en: 'Opening {title}', ar: 'بنفتح {title}' }

const warn = (error) => console.warn('[AIXC] the portal stopped; links navigate as usual', error)

/**
 * Builds the real portal for the Pocket chunk's stand-in (`standIn`: the object initPocket holds, which
 * then forwards current() and destroy() to it) with `args` as initPocket gave them ({ options,
 * isPocketPage, openPocket, viewEvents }), once the stickers are read (Back reopens the album at once,
 * which needs them), unless the layer has stopped. It never throws: a failure is reported and the
 * sticker links stay plain links.
 */
export async function attach(standIn, args, { guard, store, ensureCss, seams }) {
  try {
    await store.ready
    if (guard.stopped || standIn.real) return
    const real = (standIn.real = createPortal(args, { ensureCss, mark: seams.mark, checkpoint: seams.checkpoint }))
    standIn.current = () => real.current()
    standIn.destroy = () => real.destroy()
    // The layer stopped: the portal goes with it (initPocket's destroy also calls standIn.destroy; destroy is idempotent).
    guard.onStop(standIn.destroy)
  } catch (error) {
    warn(error)
  }
}

/**
 * `args` as above, and the layer's ensureCss, mark and checkpoint (test-only: `portal-start` makes a press fail). Returns the portal's { enabled, config, current(), destroy() }.
 */
export const createPortal = (args, { ensureCss, mark = (node) => node, report = warn, checkpoint = null }) => {
  const wrap =
    (fn) =>
    (...a) => {
      try {
        return fn(...a)
      } catch (error) {
        report(error)
      }
    }
  const lang = document.documentElement.lang?.startsWith('ar') ? 'ar' : 'en'
  const portal = initPocketPortal({
    ...args,
    options: {
      ...args.options,
      live: true,
      stylesheet: () => ensureCss('pocket-portal', css),
      mark,
      wrap,
      report,
      labels: { opening: (title) => OPENING[lang].replace('{title}', title) },
      checkpoint,
    },
  })
  // The album opened before this chunk arrived: the portal warms up now (it does on the album's 'pocket' view).
  if (portal.enabled && args.isPocketPage()) args.viewEvents.dispatchEvent(new CustomEvent('pocket:view', { detail: 'pocket' }))
  return portal
}
