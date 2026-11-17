/**
 * Reimagine's shell on Vodafone's own pages (live plan phase 4a; voice-guide ADR-0076): the composer, the view bar
 * and the box, which stage 2 builds here. A chunk of its own: the launcher (../reimagine.js) imports it on its first
 * press, never before.
 *
 * open(ctx), ctx = { host, adapter, guard, layer, ensureCss, checkpoint, launcher }: the core's demo context and the
 * launcher's handle ({ button, hold(name, on) }). What it resolves to (a handle with `state`) the launcher keeps as
 * layer.demos.reimagine.state. Until stage 2 it does nothing.
 */
export const open = async (ctx) => {}
