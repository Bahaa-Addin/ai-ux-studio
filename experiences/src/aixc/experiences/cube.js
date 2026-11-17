/*
 * Copyright (c) luis-lessrain (https://codepen.io/luis-lessrain/pen/ZYpyoRV)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
 * associated documentation files (the "Software"), to deal in the Software without restriction,
 * including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial
 * portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
 * LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
 * NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/**
 * Service cube — adapted from "Six Faces" (codepen.io/luis-lessrain/pen/ZYpyoRV).
 *
 * A 3D cube stays pinned beside the content. Each category owns a face (a mosaic
 * of its service images under a red label). As you read down the page the cube
 * turns, with eased interpolation between the reference's six orientations, to the
 * face of the category in view. A HUD shows overall progress and the current
 * category, a caption names the face, and scene dots jump between categories.
 * Below 900px the cube is centred and pinned behind the story instead, each
 * category's sheet slides up over it, and the cube turns in the gap between two
 * sheets. Native scroll only; under reduced motion the cube snaps instead of turning.
 * More than six categories reuse faces in order; fewer leave faces unused.
 */

import { h, svgIcon } from '../dom.js'
import { countCategories } from '../../i18n.js'
import {
  chromeOffset, clamp, closingBand, experienceRoot, groupExtras, groupTitle, groupsOf, inlineSign, isRTL, pad2, promotionOf, reducedMotion, scrollToY,
  serviceCard, t,
} from './shared.js'

/**
 * Faces in the order the reference's stops reveal them, with their placement.
 * The side faces sit on the reading line's "next" side: the cube turns so each
 * new face arrives from the right in LTR and from the left in RTL (rotateY is
 * multiplied by inlineSign, here and in the stops). `name` stays the LTR side.
 */
const FACES = [
  { name: 'bottom', place: 'rotateX(-90deg)' },
  { name: 'front', place: 'rotateY(0deg)' },
  { name: 'right', place: `rotateY(${90 * inlineSign}deg)` },
  { name: 'back', place: 'rotateY(180deg)' },
  { name: 'left', place: `rotateY(${-90 * inlineSign}deg)` },
  { name: 'top', place: 'rotateX(90deg)' },
]
/** Cube orientation [rotateX, rotateY] that shows each face (from the reference, LTR). */
const STOPS = [
  [90, 0],
  [0, 0],
  [0, -90],
  [0, -180],
  [0, -270],
  [-90, -360],
]
const INTRO = [-22, 38] // three-quarter view while the intro is on screen

/** Mirrors a [rotateX, rotateY] orientation for the reading direction. */
const alongLine = ([x, y]) => [x, y * inlineSign]

const easeInOut = (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2)

/**
 * Cells the category cannot fill (and pictures that fail to load) get Vodafone
 * brand tiles instead of grey boxes: the white speech mark on red, alternating
 * with the page's hero photo when there is one.
 */
const brandTile = (photo, alt) =>
  alt && photo?.src
    ? h('span', { class: 'cb-tile cb-tile--brand is-photo' }, h('img', { src: photo.src, alt: '', loading: 'lazy', decoding: 'async' }))
    : h('span', { class: 'cb-tile cb-tile--brand' }, svgIcon('icon-vodafone-logo-white', 'cb-tile__mark'))

const mosaic = (items, photo) => {
  const count = items.length
  const columns = count === 1 ? 1 : count <= 4 ? 2 : 3
  const cells = columns * columns
  const tiles = []
  let blanks = 0
  for (let i = 0; i < cells; i += 1) {
    const item = items[i]
    if (item?.image?.src) {
      const tile = h('span', { class: `cb-tile${item.image.fit === 'contain' ? ' is-contain' : ''}` }, h('img', { src: item.image.src, alt: '', loading: 'lazy', decoding: 'async' }))
      tile.querySelector('img').addEventListener('error', () => tile.replaceWith(brandTile(photo, false)), { once: true })
      tiles.push(tile)
    } else {
      tiles.push(brandTile(photo, blanks % 2 === 1))
      blanks += 1
    }
  }
  const grid = h('span', { class: 'cb-mosaic' }, tiles)
  grid.style.setProperty('--cols', String(columns))
  return grid
}

export const renderCube = (schema, index) => {
  const groups = groupsOf(schema, index)
  const promo = promotionOf(schema, index)

  /* ------------------------------------------------------------------ cube */
  const faceGroups = FACES.map((_, faceIndex) => groups.find((__, groupIndex) => groupIndex % FACES.length === faceIndex) ?? null)
  const faces = FACES.map((face, faceIndex) => {
    const group = faceGroups[faceIndex]
    const node = h(
      'span',
      { class: `cb-face cb-face--${face.name}` },
      group ? mosaic(group.items, index.model.heroImage) : h('span', { class: 'cb-face__empty' }, svgIcon('icon-vodafone-logo-white', 'cb-tile__mark')),
      group ? h('span', { class: 'cb-face__label' }, h('span', { class: 'cb-face__num' }, pad2(faceIndex + 1)), h('span', null, group.title)) : null,
    )
    node.style.setProperty('--place', face.place)
    return node
  })
  const cube = h('div', { class: 'cb-cube' }, faces)
  const scene = h('div', { class: 'cb-scene', 'aria-hidden': 'true' }, cube, h('div', { class: 'cb-floor' }))

  /* ------------------------------------------------------------------- HUD */
  const hudPct = h('span', { class: 'cb-hud__pct' }, isRTL ? '0%' : '000%')
  const hudFill = h('span', { class: 'cb-hud__fill' })
  const hudName = h('span', { class: 'cb-hud__name' }, t('Overview'))
  const hud = h('div', { class: 'cb-hud', 'aria-hidden': 'true' }, hudPct, h('span', { class: 'cb-hud__bar' }, hudFill), hudName)
  const capNum = h('span', { class: 'cb-caption__num' }, '00')
  const capName = h('span', { class: 'cb-caption__name' }, index.model.title)
  const caption = h('p', { class: 'cb-caption', 'aria-hidden': 'true' }, capNum, capName)

  /* ---------------------------------------------------------------- story */
  const intro = h(
    'header',
    { class: 'cb-block cb-block--intro', 'data-stop': '0' },
    h('p', { class: 'cb-tag' }, countCategories(groups.length)),
    h('h1', { class: 'cb-intro__title', id: 'aixc-cover-title', tabindex: '-1', 'data-aixc-focus': '' }, index.model.title),
    index.model.intro ? h('p', { class: 'cb-intro__text' }, index.model.intro) : null,
  )
  const startButton = h('button', { type: 'button', class: 'vx-btn vx-btn--primary' }, t('Turn the cube'))
  intro.append(h('div', { class: 'cb-intro__actions' }, startButton))

  const blocks = groups.map((group, groupIndex) => {
    const headingId = `cb-h-${group.id}`
    return h(
      'section',
      { class: 'cb-block', 'aria-labelledby': headingId, 'data-stop': String(groupIndex + 1), 'data-group': group.id },
      h('p', { class: 'cb-tag' }, t('Face {number}', { number: pad2((groupIndex % FACES.length) + 1) })),
      group.provenance ? h('p', { class: 'cb-from' }, group.provenance) : null,
      groupTitle(group, 'h2', 'cb-block__title', headingId),
      group.description ? h('p', { class: 'cb-block__desc' }, group.description) : null,
      groupExtras(group),
      h('div', { class: 'cb-cards' }, group.items.map((item) => serviceCard(item, { className: 'vx-card--row' }))),
    )
  })
  const stopsEls = [intro, ...blocks]

  /* ----------------------------------------------------------- scene dots */
  const dots = stopsEls.map((block, at) => {
    const label = at === 0 ? t('Overview') : groups[at - 1].title
    const dot = h('button', { type: 'button', class: 'cb-dot', 'aria-label': t('Go to {label}', { label }) }, h('span', { class: 'cb-dot__label', 'aria-hidden': 'true' }, label))
    dot.addEventListener('click', () => goTo(at))
    return dot
  })
  const dotNav = h('nav', { class: 'cb-dots', 'aria-label': t('Categories') }, h('ul', null, dots.map((dot) => h('li', null, dot))))

  const stage = h('div', { class: 'cb-stage' }, scene, hud, caption, dotNav)
  const story = h('div', { class: 'cb-story' }, stopsEls)
  const root = experienceRoot('cube', schema, h('div', { class: 'cb-layout' }, stage, story), closingBand(promo))

  /* ---------------------------------------------------------------- motion */
  const orientationFor = (stop) =>
    alongLine(stop === 0 ? INTRO : STOPS[(stop - 1) % STOPS.length].map((value, axis) => (axis === 1 ? value - 360 * Math.floor((stop - 1) / STOPS.length) : value)))

  /** Narrow screens stack the story as sheets over the cube (matches cube.css). */
  const sheets = window.matchMedia('(max-width: 899px)')
  let current = orientationFor(0)
  let target = orientationFor(0)
  let activeStop = -1
  let frame = 0
  let last = 0
  let mounted = false

  /** Half the cube's on-screen height when face-on (perspective enlarges it a little). */
  const cubeHalf = () => cube.offsetWidth * 0.58
  const sceneCentre = () => {
    const rect = scene.getBoundingClientRect()
    return rect.top + rect.height / 2
  }

  const goTo = (stop) => {
    const at = clamp(stop, 0, stopsEls.length - 1)
    const top = stopsEls[at].getBoundingClientRect().top + window.scrollY
    if (sheets.matches && at > 0) {
      // Land with the cube turned to the new face and the sheet's heading just below it.
      const pinnedCentre = chromeOffset() + scene.offsetHeight / 2
      scrollToY(top - (pinnedCentre + cubeHalf() + 16))
      return
    }
    scrollToY(top - chromeOffset() - 8)
  }
  startButton.addEventListener('click', () => goTo(1))

  /**
   * Wide screens: the story runs beside the cube. Each face holds while its block
   * is read and turns near the block's end.
   */
  const readBeside = () => {
    const line = chromeOffset() + (window.innerHeight - chromeOffset()) * 0.4
    const tops = stopsEls.map((block) => block.getBoundingClientRect().top)
    let stop = 0
    for (let i = 0; i < tops.length; i += 1) if (tops[i] <= line) stop = i
    const nextTop = tops[stop + 1]
    const span = nextTop !== undefined ? nextTop - tops[stop] : 1
    const fraction = nextTop !== undefined ? clamp((line - tops[stop]) / span, 0, 1) : 0
    return { stop, turn: clamp((fraction - 0.6) / 0.4, 0, 1), named: stop }
  }

  /**
   * Narrow screens: each category is a sheet that slides up over the pinned cube.
   * A face turns only while the gap between two sheets has the cube fully
   * uncovered, and the names follow the face the cube shows.
   */
  const readSheets = () => {
    const centre = sceneCentre()
    const half = cubeHalf()
    for (let i = 1; i < stopsEls.length; i += 1) {
      const gapTop = stopsEls[i - 1].getBoundingClientRect().bottom
      const nextTop = stopsEls[i].getBoundingClientRect().top
      const clear = nextTop - gapTop - 2 * half // scroll distance the cube is fully visible
      const progress = clear > 0 ? (centre - half - gapTop) / clear : nextTop <= centre ? 1 : 0
      const turn = clamp((progress - 0.15) / 0.7, 0, 1)
      if (turn < 1) return { stop: i - 1, turn, named: turn >= 0.5 ? i : i - 1 }
    }
    return { stop: stopsEls.length - 1, turn: 0, named: stopsEls.length - 1 }
  }

  const readTarget = () => {
    const { stop, turn, named } = sheets.matches ? readSheets() : readBeside()
    const from = orientationFor(stop)
    const to = stop + 1 < stopsEls.length ? orientationFor(stop + 1) : from
    const eased = easeInOut(turn)
    target = [from[0] + (to[0] - from[0]) * eased, from[1] + (to[1] - from[1]) * eased]

    const rect = root.getBoundingClientRect()
    const travel = Math.max(1, rect.height - window.innerHeight)
    const pct = Math.round(clamp(-rect.top / travel, 0, 1) * 100)
    // The zero-padded "019%" is a Latin display style; in Arabic it reads like a code.
    hudPct.textContent = isRTL ? `${pct}%` : `${String(pct).padStart(3, '0')}%`
    hudFill.style.transform = `scaleX(${pct / 100})`

    if (named !== activeStop) {
      activeStop = named
      const name = named === 0 ? t('Overview') : groups[named - 1].title
      hudName.textContent = name
      capNum.textContent = pad2(named === 0 ? 0 : ((named - 1) % FACES.length) + 1)
      capName.textContent = named === 0 ? index.model.title : name
      dots.forEach((dot, at) => {
        dot.classList.toggle('is-active', at === named)
        if (at === named) dot.setAttribute('aria-current', 'true')
        else dot.removeAttribute('aria-current')
      })
    }
  }

  const draw = () => cube.style.setProperty('transform', `rotateX(${current[0].toFixed(2)}deg) rotateY(${current[1].toFixed(2)}deg)`)

  const loop = (now) => {
    if (!mounted) return
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016
    last = now
    readTarget()
    if (reducedMotion()) {
      current = [...target]
    } else {
      const k = 1 - Math.exp(-dt * 8)
      current = [current[0] + (target[0] - current[0]) * k, current[1] + (target[1] - current[1]) * k]
    }
    draw()
    frame = window.requestAnimationFrame(loop)
  }

  draw()

  return {
    element: root,
    mount() {
      mounted = true
      last = 0
      frame = window.requestAnimationFrame(loop)
    },
    unmount() {
      mounted = false
      window.cancelAnimationFrame(frame)
    },
  }
}
