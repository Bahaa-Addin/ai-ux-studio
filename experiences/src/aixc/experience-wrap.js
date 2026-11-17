/**
 * The mount wrapper every experience goes through (voice-guide ADR-0076, phase 4a): the clone's registry
 * (experience-renderer.js) and the live registry on Vodafone's pages wrap a renderer's output the same way.
 *
 *   output: { element, mount?(), unmount?(), afterMount?: [], reveal?(itemId) }
 *
 * mount and unmount are idempotent; afterMount runs once, at the first mount (what it sets up stays across
 * later mounts); reveal(itemId) steps the view to that item (a pinned stage to its card) and says whether
 * the experience has it.
 */

export const wrapExperience = (output) => {
  let mounted = false
  let afterMountDone = false
  return {
    element: output.element,
    get mounted() {
      return mounted
    },
    mount() {
      if (mounted) return
      mounted = true
      if (!afterMountDone) {
        afterMountDone = true
        output.afterMount?.forEach((callback) => callback())
      }
      output.mount?.()
    },
    unmount() {
      if (!mounted) return
      mounted = false
      output.unmount?.()
    },
    reveal(itemId) {
      return output.reveal?.(itemId) ?? false
    },
  }
}
