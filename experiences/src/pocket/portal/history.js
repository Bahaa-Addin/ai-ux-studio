/**
 * Back to the Pocket (docs/adr/0005-pocket-portal-transition.md, "Back and Forward").
 *
 * The sticker links used to open a new tab, so the Pocket stayed open behind them. Leaving
 * through the portal happens in this tab, so before the navigation the current history entry
 * is marked "the Pocket was open" (with its scroll). Coming back from the back/forward cache
 * the page is exactly as it was (./portal.js only removes the transition); coming back with a
 * fresh load, the mark reopens the Pocket at once, without the page turn. Closing the Pocket
 * removes the mark. Small and always loaded (the rest of the scene is lazy).
 */

export const HISTORY_KEY = 'vfPortal'

/** Remembers on this history entry that the Pocket was open, so Back can return to it. */
export const rememberPocket = (scrollY) => {
  try {
    const state = history.state && typeof history.state === 'object' ? history.state : {}
    history.replaceState({ ...state, [HISTORY_KEY]: { view: 'pocket', scrollY } }, '')
  } catch {
    // History can refuse (sandboxed documents); Back then lands on the Services page.
  }
}

export const forgetPocket = () => {
  try {
    if (!history.state?.[HISTORY_KEY]) return
    const { [HISTORY_KEY]: _drop, ...rest } = history.state
    history.replaceState(Object.keys(rest).length ? rest : null, '')
  } catch {
    // Nothing to forget.
  }
}

/**
 * The Pocket state to restore when this history entry is revisited (Back/Forward, or a reload
 * after it), or null. Only this entry carries the mark, so a fresh visit never restores.
 */
export const pocketToRestore = () => {
  try {
    const saved = history.state?.[HISTORY_KEY]
    if (saved?.view !== 'pocket') return null
    let type = ''
    try {
      type = performance.getEntriesByType?.('navigation')?.[0]?.type ?? ''
    } catch {
      type = ''
    }
    return type === 'navigate' ? null : saved
  } catch {
    return null
  }
}
