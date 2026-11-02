/**
 * Draws the 3D actors as SVG. Each view builds its SVG once from the decal sheet, then `draw()`
 * rewrites attributes (paths, ellipses, matrices, gradient centres) from one model frame;
 * nothing is re-created per frame. Depth order is changed only when it actually flips.
 */

import { createCamera, matrixAttribute } from './space.js'
import { mascotFrame } from './mascot-model.js'
import { droneFrame } from './drone-model.js'

const SVG_NS = 'http://www.w3.org/2000/svg'

const svgEl = (tag, attributes = {}, parent = null) => {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value))
  parent?.append(node)
  return node
}

const f2 = (n) => (Number.isFinite(n) ? +n.toFixed(2) : 0)

const setAll = (node, attributes) => {
  for (const [key, value] of Object.entries(attributes)) {
    const text = typeof value === 'number' ? String(f2(value)) : value
    if (node.getAttribute(key) !== text) node.setAttribute(key, text)
  }
}

const ellipseAttrs = (e) => ({ cx: e.cx, cy: e.cy, rx: Math.max(0.01, e.rx), ry: Math.max(0.01, e.ry), transform: `rotate(${f2(e.angle)} ${f2(e.cx)} ${f2(e.cy)})` })

const fade = (facing, from = 0.06, span = 0.22) => Math.max(0, Math.min(1, (facing - from) / span))

const showIf = (node, visible, opacity = 1) => {
  const display = visible ? '' : 'none'
  if (node.style.display !== display) node.style.display = display
  if (visible) node.style.opacity = opacity >= 0.999 ? '' : String(f2(opacity))
}

/* ------------------------------------------------------------------- mascot */

/**
 * @param {SVGSVGElement} svg  the loaded decal sheet (viewBox 0 0 120 150); it becomes the stage
 */
export const createMascotView = (svg) => {
  const camera = createCamera({ distance: 900, tilt: 12, origin: { x: 60, y: 147 } })
  const decal = (name) => {
    const node = svg.querySelector(`[data-decal="${name}"]`)
    node?.remove()
    return node
  }
  const sheet = { eye: decal('eye'), mouth: decal('mouth'), blush: decal('blush'), hand: decal('hand'), apple: decal('apple'), fx: decal('fx') }
  const defs = svg.querySelector('defs') ?? svgEl('defs', {}, svg)

  const skin = svgEl('radialGradient', { id: 'pocket-mascot-skin', gradientUnits: 'userSpaceOnUse', cx: 45, cy: 70, r: 70 }, defs)
  for (const [offset, color] of [
    [0, '#ff4a3a'],
    [0.38, '#f20a00'],
    [0.72, '#cf0000'],
    [1, '#940000'],
  ])
    svgEl('stop', { offset, 'stop-color': color }, skin)
  const clip = svgEl('clipPath', { id: 'pocket-mascot-body-clip' }, defs)
  const clipPath = svgEl('path', {}, clip)

  const shadow = svgEl('ellipse', { 'data-part': 'shadow', fill: '#14141e', 'fill-opacity': '0.16' }, svg)
  const back = svgEl('g', { 'data-layer': 'back' }, svg)
  const body = svgEl('g', { 'data-part': 'body' }, svg)
  const skinPath = svgEl('path', { 'data-part': 'skin', fill: 'url(#pocket-mascot-skin)' }, body)
  const surface = svgEl('g', { 'clip-path': 'url(#pocket-mascot-body-clip)' }, body)
  const gloss = svgEl('path', { 'data-part': 'gloss', fill: 'none', stroke: '#fff', 'stroke-opacity': '0.5', 'stroke-linecap': 'round' }, surface)
  const glint = svgEl('ellipse', { 'data-part': 'glint', fill: '#fff', 'fill-opacity': '0.6' }, surface)
  const place = (name, node) => {
    const holder = svgEl('g', { 'data-place': name }, surface)
    if (node) holder.append(node)
    return holder
  }
  const mouthAt = place('mouth', sheet.mouth)
  const blushLAt = place('blush-l', sheet.blush?.cloneNode(true))
  const blushRAt = place('blush-r', sheet.blush)
  const outline = svgEl('path', { 'data-part': 'outline', fill: 'none', stroke: '#5c0000', 'stroke-linejoin': 'round' }, body)
  // The eye sits proud of the body (a bulging lens), so it is drawn over the outline, unclipped.
  const eyeAt = svgEl('g', { 'data-place': 'eye' }, body)
  if (sheet.eye) eyeAt.append(sheet.eye)
  const front = svgEl('g', { 'data-layer': 'front' }, svg)
  const appleAt = svgEl('g', { 'data-place': 'apple' }, svg)
  if (sheet.apple) appleAt.append(sheet.apple)
  const fxAt = svgEl('g', { 'data-place': 'fx' }, svg)
  if (sheet.fx) fxAt.append(sheet.fx)

  const limbStyle = { fill: '#d40000', stroke: '#5c0000', 'stroke-linejoin': 'round' }
  const limb = (name, withHand) => {
    const group = svgEl('g', { 'data-limb': name }, back)
    const path = svgEl('path', limbStyle, group)
    const hand = withHand ? svgEl('g', { 'data-place': `hand-${name.slice(-1)}` }, group) : null
    if (hand && sheet.hand) hand.append(name === 'arm-r' ? sheet.hand : sheet.hand.cloneNode(true))
    return { group, path, hand }
  }
  const parts = {
    legL: limb('leg-l'),
    legR: limb('leg-r'),
    armL: limb('arm-l', true),
    armR: limb('arm-r', true),
  }
  const feet = {
    footL: svgEl('ellipse', { 'data-limb': 'foot-l', fill: '#d10000', stroke: '#5c0000' }, back),
    footR: svgEl('ellipse', { 'data-limb': 'foot-r', fill: '#d10000', stroke: '#5c0000' }, back),
  }

  let lastOrder = ''

  const draw = (pose) => {
    const frame = mascotFrame(pose, camera)
    const k = frame.body.centre.k

    setAll(shadow, { ...ellipseAttrs(frame.shadow) })
    shadow.style.opacity = String(f2(Math.max(0.25, Math.min(1, 1 - (pose.y ?? 0) / 60))))

    skinPath.setAttribute('d', frame.body.d)
    clipPath.setAttribute('d', frame.body.d)
    outline.setAttribute('d', frame.body.d)
    setAll(outline, { 'stroke-width': frame.body.stroke })
    setAll(skin, { cx: frame.body.centre.x + (frame.body.highlight.x - frame.body.centre.x) * 0.4, cy: frame.body.centre.y + (frame.body.highlight.y - frame.body.centre.y) * 0.4, fx: frame.body.highlight.x, fy: frame.body.highlight.y, r: frame.body.radius * 1.55 })

    const inward = frame.body.gloss.map((p) => {
      const dx = frame.body.centre.x - p.x
      const dy = frame.body.centre.y - p.y
      const d = Math.hypot(dx, dy) || 1
      return { x: p.x + (dx / d) * 5 * k, y: p.y + (dy / d) * 5 * k }
    })
    gloss.setAttribute('d', inward.length > 1 ? inward.map((p, i) => `${i ? 'L' : 'M'}${f2(p.x)} ${f2(p.y)}`).join('') : '')
    setAll(gloss, { 'stroke-width': 2.6 * k })
    setAll(glint, { cx: frame.body.highlight.x, cy: frame.body.highlight.y, rx: 3.2 * k, ry: 5.4 * k, transform: `rotate(28 ${f2(frame.body.highlight.x)} ${f2(frame.body.highlight.y)})` })

    for (const [node, d] of [
      [eyeAt, frame.decals.eye],
      [mouthAt, frame.decals.mouth],
      [blushLAt, frame.decals.blushL],
      [blushRAt, frame.decals.blushR],
    ]) {
      const visible = d.facing > -0.02
      showIf(node, visible, fade(d.facing, -0.02, 0.16))
      if (visible) node.setAttribute('transform', matrixAttribute(d.matrix))
    }

    for (const [name, part] of Object.entries(parts)) {
      const data = frame.limbs[name]
      part.path.setAttribute('d', data.d)
      setAll(part.path, { 'stroke-width': 2.3 * data.root.k })
      if (part.hand) {
        const h = frame.hands[name === 'armL' ? 'handL' : 'handR']
        part.hand.setAttribute('transform', `translate(${f2(h.x)} ${f2(h.y)}) rotate(${f2(h.angle)}) scale(${f2(h.k * h.flip)} ${f2(h.k)})`)
      }
    }
    for (const [name, node] of Object.entries(feet)) setAll(node, { ...ellipseAttrs(frame.feet[name]), 'stroke-width': 2.2 * k })

    const hr = frame.hands.handR
    appleAt.setAttribute('transform', `translate(${f2(hr.x)} ${f2(hr.y - 3 * hr.k)}) scale(${f2(hr.k)})`)
    fxAt.setAttribute('transform', `translate(${f2(frame.head.x)} ${f2(frame.head.y)}) scale(${f2(frame.head.k)})`)

    // Paint order: limbs behind the body or in front of it, as they turn.
    const order = `${frame.order.back.join()}|${frame.order.front.join()}|${frame.order.feetFront}`
    if (order !== lastOrder) {
      lastOrder = order
      const nodeFor = (name) => (feet[name] ? feet[name] : parts[name].group)
      const feetFirst = frame.order.feetFront ? [] : ['footL', 'footR']
      back.replaceChildren(...frame.order.back.filter((n) => n.startsWith('leg') || n.startsWith('arm')).map(nodeFor), ...feetFirst.map(nodeFor))
      front.replaceChildren(...(frame.order.feetFront ? ['footL', 'footR'].map(nodeFor) : []), ...frame.order.front.map(nodeFor))
    }
    return frame
  }

  return { svg, camera, draw }
}

/* -------------------------------------------------------------------- drone */

/**
 * @param {SVGSVGElement} svg  the loaded decal sheet (viewBox 0 0 200 140); it becomes the stage
 */
export const createDroneView = (svg) => {
  const camera = createCamera({ distance: 900, tilt: 26, origin: { x: 100, y: 74 } })
  const take = (name) => {
    const node = svg.querySelector(`[data-decal="${name}"]`)
    node?.remove()
    return node
  }
  const detailsArt = take('details')
  const liftArt = take('lift-lines')
  const defs = svgEl('defs', {}, svg)
  const hullGradient = svgEl('radialGradient', { id: 'pocket-drone-hull', gradientUnits: 'userSpaceOnUse', cx: 100, cy: 70, r: 30 }, defs)
  for (const [offset, color] of [
    [0, '#ff3a2c'],
    [0.5, '#e60000'],
    [1, '#b00000'],
  ])
    svgEl('stop', { offset, 'stop-color': color }, hullGradient)

  const liftAt = svgEl('g', { 'data-place': 'lift-lines' }, svg)
  if (liftArt) liftAt.append(liftArt)
  const scene = svgEl('g', { 'data-part': 'frame' }, svg)
  const red = '#e60000'
  const units = Array.from({ length: 4 }, (_, index) => {
    const group = svgEl('g', { 'data-unit': index, 'data-part': `rotor-unit-${index}` }, scene)
    const guardStyle = { fill: 'none', stroke: red, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }
    const thinBack = svgEl('path', guardStyle, group)
    const heavyBack = svgEl('path', guardStyle, group)
    const arm = svgEl('path', { fill: red }, group)
    const pod = svgEl('circle', { fill: red }, group)
    const disc = svgEl('circle', { r: 24, fill: red, 'fill-opacity': '0.08', 'data-part': 'rotor-disc' }, group)
    const blades = [0, 1].map(() => svgEl('ellipse', { rx: 21.5, ry: 1.8, fill: '#990000', 'fill-opacity': '0.55', 'data-part': 'blades' }, group))
    const thinFront = svgEl('path', guardStyle, group)
    const heavyFront = svgEl('path', guardStyle, group)
    return { group, thinBack, heavyBack, arm, pod, disc, blades, thinFront, heavyFront }
  })
  const hullGroup = svgEl('g', { 'data-part': 'body' }, scene)
  const bucket = svgEl('ellipse', { fill: '#d60000' }, hullGroup)
  const hull = svgEl('ellipse', { fill: 'url(#pocket-drone-hull)' }, hullGroup)
  const detailsAt = svgEl('g', { 'data-part': 'details' }, hullGroup)
  if (detailsArt) detailsAt.append(detailsArt)

  let lastOrder = ''

  const draw = (pose, spin = 0) => {
    const frame = droneFrame(pose, camera, spin)
    setAll(hull, ellipseAttrs(frame.hull))
    setAll(hullGradient, { cx: frame.hull.light.x, cy: frame.hull.light.y, r: Math.max(frame.hull.rx, frame.hull.ry) * 1.35 })
    setAll(bucket, ellipseAttrs(frame.bucket))
    showIf(detailsAt, frame.details.facing > 0.05, fade(frame.details.facing, 0.05, 0.25))
    if (frame.details.facing > 0.05) detailsAt.setAttribute('transform', matrixAttribute(frame.details.matrix))
    liftAt.setAttribute('transform', `translate(${f2(frame.centre.x - 6)} ${f2(frame.centre.y + 34)})`)

    frame.units.forEach((data, index) => {
      const unit = units[index]
      unit.arm.setAttribute('d', data.arm)
      setAll(unit.pod, { cx: data.pod.cx, cy: data.pod.cy, r: data.pod.r })
      unit.disc.setAttribute('transform', matrixAttribute(data.disc))
      data.blades.forEach((m, i) => unit.blades[i].setAttribute('transform', matrixAttribute(m)))
      const thin = 2.3 * data.guard.width
      const heavy = 4.6 * data.guard.width
      setAll(unit.thinBack, { d: data.guard.thinBack || 'M0 0', 'stroke-width': thin })
      setAll(unit.thinFront, { d: data.guard.thinFront || 'M0 0', 'stroke-width': thin })
      setAll(unit.heavyBack, { d: data.guard.heavyBack || 'M0 0', 'stroke-width': heavy })
      setAll(unit.heavyFront, { d: data.guard.heavyFront || 'M0 0', 'stroke-width': heavy })
    })

    // Painter's order: far rotor units, then the hull, then near ones.
    const items = [...frame.units.map((u, i) => ({ node: units[i].group, z: u.z, key: i })), { node: hullGroup, z: frame.hullZ + 4, key: 'h' }].sort((a, b) => a.z - b.z)
    const order = items.map((i) => i.key).join()
    if (order !== lastOrder) {
      lastOrder = order
      scene.replaceChildren(...items.map((i) => i.node))
    }
    return frame
  }

  return { svg, camera, draw }
}
