/**
 * The RED world's artwork, drawn for this project as SVG: clay-style category icons, the perk
 * and partner scenes, the RED Points cards, the Elite+ avatars and the coffee map.
 *
 * Partners appear as typographic wordmarks in their colours, never as copies of their logos or
 * campaign photography; real partner assets can replace any scene through the catalogue's
 * `image` field. Gradient ids are unique per drawing so a scene can appear more than once.
 */

let serial = 0
const uid = (name) => `pz-${name}-${(serial += 1)}`

const svg = (viewBox, body, className = '', label = '', { cover = false } = {}) =>
  `<svg viewBox="${viewBox}" class="${className}" ${cover ? 'preserveAspectRatio="xMidYMid slice"' : ''} ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'} focusable="false" xmlns="http://www.w3.org/2000/svg">${body}</svg>`

/** A soft ground shadow without filters. */
const ground = (cx, cy, rx, ry, opacity = 0.2) => {
  const id = uid('ground')
  return `<defs><radialGradient id="${id}"><stop offset="0" stop-color="#14141e" stop-opacity="${opacity}"/><stop offset="1" stop-color="#14141e" stop-opacity="0"/></radialGradient></defs><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${id})"/>`
}

const lin = (id, stops, x2 = 1, y2 = 1) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</linearGradient>`

/** The Vodafone speech mark (the header sprite's own symbol). */
const mark = (x, y, size) => `<use href="#icon-vodafone-logo" x="${x}" y="${y}" width="${size}" height="${size}"/>`

/* --------------------------------------------------- clay category icons */

const ICONS = {
  bag: () => {
    const [f, s] = [uid('bag'), uid('bagside')]
    return `${ground(32, 57, 21, 4)}<defs>${lin(f, [[0, '#ffffff'], [1, '#d8dbe1']])}${lin(s, [[0, '#c5c9d0'], [1, '#a7acb5']])}</defs>
      <path d="M13 22h30l-2.2 33H15.2z" fill="url(#${f})"/><path d="M43 22l6.5 3.6-2.6 28.6-6.1.8z" fill="url(#${s})"/>
      <path d="M21 25c0-9.5 4.4-14 9-14s9 4.5 9 14" fill="none" stroke="#e60000" stroke-width="3.4" stroke-linecap="round"/>
      ${mark(20.5, 30, 17)}<path d="M15 22.5h27.5" stroke="#fff" stroke-opacity=".8"/>`
  },
  shopping: () => {
    const [f, s] = [uid('shop'), uid('shopside')]
    return `${ground(32, 57, 20, 4)}<defs>${lin(f, [[0, '#ffffff'], [1, '#dde0e6']])}${lin(s, [[0, '#cfd2d8'], [1, '#aeb3bb']])}</defs>
      <g transform="rotate(-6 32 36)"><path d="M14 24h29l-2 31H16z" fill="url(#${f})"/><path d="M43 24l5.5 3-2 27.4-5.5.6z" fill="url(#${s})"/>
      <path d="M22 27c0-9 3.8-13 8.5-13s8.5 4 8.5 13" fill="none" stroke="#e60000" stroke-width="3.2" stroke-linecap="round"/>
      <circle cx="28.5" cy="40" r="8.5" fill="#e60000"/><path d="M28.6 35.2c2.9 0 4.6 1.9 4.6 4.3a4.6 4.6 0 0 1-9.1.5c0-3 1.9-5.4 4.5-6" fill="none" stroke="#fff" stroke-width="2"/></g>
      <path d="M45 15l7 3-2.4 6-7-3z" fill="#ff7a3d"/><circle cx="46.6" cy="17.6" r="1.1" fill="#fff"/>`
  },
  router: () => {
    const [p, r] = [uid('phone'), uid('router')]
    return `${ground(32, 56, 24, 4)}<defs>${lin(p, [[0, '#ff5a36'], [1, '#c70000']])}${lin(r, [[0, '#6b6f77'], [1, '#34373c']])}</defs>
      <rect x="9" y="17" width="19" height="34" rx="5" fill="url(#${p})"/><rect x="11.5" y="20" width="14" height="27" rx="3" fill="#fff" fill-opacity=".14"/>${mark(13.5, 27.5, 10)}
      <path d="M38 21v-8M51 21v-8" stroke="#4a4d53" stroke-width="2.6" stroke-linecap="round"/>
      <rect x="33" y="21" width="24" height="31" rx="5" fill="url(#${r})"/><rect x="35.5" y="24" width="19" height="2" rx="1" fill="#fff" fill-opacity=".18"/>
      <circle cx="45" cy="44" r="1.8" fill="#4ce07a"/><circle cx="40" cy="44" r="1.3" fill="#fff" fill-opacity=".45"/><circle cx="50" cy="44" r="1.3" fill="#fff" fill-opacity=".45"/>`
  },
  play: () => {
    const [b, t] = [uid('play'), uid('playtop')]
    return `${ground(32, 57, 20, 4)}<defs>${lin(b, [[0, '#ff6a3d'], [1, '#d10000']])}${lin(t, [[0, '#fff', 0.35], [1, '#fff', 0]], 0, 1)}</defs>
      <rect x="11" y="13" width="42" height="40" rx="11" fill="#a30000"/><rect x="11" y="10" width="42" height="40" rx="11" fill="url(#${b})"/>
      <rect x="14" y="12" width="36" height="18" rx="9" fill="url(#${t})"/><path d="M27 20.5v19l15.5-9.5z" fill="#fff" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/>`
  },
  plane: () => {
    const [w, c] = [uid('wing'), uid('case')]
    return `${ground(32, 57, 22, 4)}<defs>${lin(w, [[0, '#ffffff'], [1, '#cfd3da']])}${lin(c, [[0, '#ffb15c'], [1, '#f07a1a']])}</defs>
      <rect x="34" y="30" width="20" height="23" rx="4" fill="url(#${c})"/><path d="M40 30v-4h8v4" fill="none" stroke="#c45a0c" stroke-width="2.2"/><path d="M38 36h12" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>
      <path d="M6 33l40-17c4-1.7 8 .5 6.5 3.4L48 25 14 38z" fill="url(#${w})"/><path d="M22 29l-6-12h5l13 8z" fill="#e2e5ea"/><path d="M26 33l10 12h-5l-14-8z" fill="#d3d7de"/>
      <path d="M8 32l-3-6h4l5 4z" fill="#e60000"/>`
  },
  envelope: () => {
    const [e, t] = [uid('env'), uid('ticket')]
    return `${ground(32, 57, 22, 4)}<defs>${lin(e, [[0, '#ffffff'], [1, '#d9dce2']])}${lin(t, [[0, '#ff6a3d'], [1, '#e60000']])}</defs>
      <rect x="20" y="9" width="24" height="26" rx="3" fill="url(#${t})" transform="rotate(-8 32 22)"/><path d="M27.5 18.5c0-2 2.6-3 4.5-.8 1.9-2.2 4.5-1.2 4.5.8 0 2.7-4.5 5.5-4.5 5.5s-4.5-2.8-4.5-5.5z" fill="#fff" transform="rotate(-8 32 22)"/>
      <path d="M10 27l22 14 22-14v24a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3z" fill="url(#${e})"/><path d="M10 52l17-14M54 52 37 38" stroke="#c9cdd4" stroke-width="1.6"/>`
  },
  dumbbell: () => {
    const [p, b] = [uid('plate'), uid('bar')]
    return `${ground(32, 56, 22, 4)}<defs>${lin(p, [[0, '#ff6a3d'], [1, '#c40000']])}${lin(b, [[0, '#e9ebef'], [1, '#9aa0a9']], 0, 1)}</defs>
      <g transform="rotate(-28 32 34)"><rect x="17" y="31" width="30" height="6" rx="3" fill="url(#${b})"/>
      <rect x="9" y="22" width="9" height="24" rx="4" fill="url(#${p})"/><rect x="46" y="22" width="9" height="24" rx="4" fill="url(#${p})"/>
      <rect x="4.5" y="26" width="5" height="16" rx="2.5" fill="#a30000"/><rect x="54.5" y="26" width="5" height="16" rx="2.5" fill="#a30000"/></g>`
  },
  grocery: () => {
    const [g, s] = [uid('groc'), uid('grocside')]
    return `${ground(32, 57, 20, 4)}<defs>${lin(g, [[0, '#ff6a3d'], [1, '#d10000']])}${lin(s, [[0, '#b80000'], [1, '#8f0000']])}</defs>
      <path d="M24 22c-2-8 2-13 5-14 1 4-1 9-5 14z" fill="#3fa34d"/><path d="M30 21c1-8 6-11 10-11-1 5-5 9-10 11z" fill="#57c26a"/><rect x="34" y="9" width="5" height="18" rx="2.5" fill="#e8b46a" transform="rotate(16 36 18)"/>
      <path d="M14 22h30l-2.2 33H16.2z" fill="url(#${g})"/><path d="M44 22l5.5 3.4-2.3 28.8-5.4.8z" fill="url(#${s})"/>
      <path d="M22 27c0 4 3.5 7 7.5 7s7.5-3 7.5-7" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-opacity=".85"/>`
  },
}

/** A clay icon for a category tile. */
export const categoryIcon = (name, label = '') => svg('0 0 64 64', (ICONS[name] ?? ICONS.bag)(), 'pz-clay', label)

/* --------------------------------------------------------------- avatars */

const SKIN = ['#f1c9a5', '#d9a47c', '#b47b55', '#f6d6bd', '#8d5a3b', '#e8b894']
const HAIR = ['#2b1d16', '#4a2c1c', '#141414', '#7a4a26', '#1f1a17', '#b07a3c']

/** A simple, friendly face (original drawing; not an emoji or a memoji). */
export const avatar = (seed = 0, { hijab = false, glasses = false, beard = false, size = 64 } = {}) => {
  const skin = SKIN[seed % SKIN.length]
  const hair = HAIR[(seed * 3 + 1) % HAIR.length]
  const bg = uid('avbg')
  const face = `<circle cx="32" cy="33" r="15" fill="${skin}"/><circle cx="26.5" cy="32" r="1.8" fill="#1f1a17"/><circle cx="37.5" cy="32" r="1.8" fill="#1f1a17"/>
    <path d="M26.5 39c3.4 3 7.6 3 11 0" fill="none" stroke="#1f1a17" stroke-width="1.8" stroke-linecap="round"/><circle cx="23" cy="37" r="2.2" fill="#ff8a80" fill-opacity=".35"/><circle cx="41" cy="37" r="2.2" fill="#ff8a80" fill-opacity=".35"/>`
  const top = hijab
    ? `<path d="M15 36c0-12 7.5-20 17-20s17 8 17 20v12c-4 4-10 6-17 6s-13-2-17-6z" fill="#f3efe9"/><path d="M19 34c0-9 5.6-14 13-14s13 5 13 14" fill="${skin}"/>`
    : `<path d="M16.5 31c-.5-10 6.5-16 15.5-16 9.5 0 16 6 15.4 16-3-5-8-7-13-7-6 0-12 2-17.9 7z" fill="${hair}"/>`
  const extra = `${glasses ? '<g fill="none" stroke="#1f1a17" stroke-width="1.6"><circle cx="26.5" cy="32" r="4.4"/><circle cx="37.5" cy="32" r="4.4"/><path d="M30.9 32h2.2"/></g>' : ''}${beard ? `<path d="M20 36c1 9 6 12 12 12s11-3 12-12c-2 3-5 4-12 4s-10-1-12-4z" fill="${hair}"/>` : ''}`
  const body = `<defs><radialGradient id="${bg}" cx=".5" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ffe2d6"/></radialGradient></defs>
    <circle cx="32" cy="32" r="31" fill="url(#${bg})"/><path d="M12 60c2-10 10-15 20-15s18 5 20 15" fill="${hijab ? '#f3efe9' : '#e60000'}"/>${hijab ? '' : face}${top}${hijab ? face.replace('cy="33"', 'cy="34"') : ''}${extra}`
  return svg('0 0 64 64', body, 'pz-avatar', '').replace('<svg ', `<svg width="${size}" height="${size}" `)
}

/* ---------------------------------------------------------- perk scenes */

const SCENES = {
  yango: () => {
    const [p, d] = [uid('yp'), uid('yd')]
    return svg(
      '0 0 180 110',
      `${ground(96, 103, 70, 7, 0.16)}<defs>${lin(p, [[0, '#9a3cf5'], [1, '#5b10c4']])}${lin(d, [[0, '#3a3a3f'], [1, '#18181b']])}</defs>
      <g transform="rotate(-14 70 80)"><rect x="18" y="62" width="104" height="34" rx="8" fill="url(#${d})"/><rect x="30" y="72" width="34" height="12" rx="3" fill="#ffd400"/><text x="47" y="81.5" text-anchor="middle" font-family="vodafone-bold-en, sans-serif" font-size="9" fill="#18181b">TOD</text></g>
      <g transform="rotate(-10 110 58)"><rect x="66" y="22" width="96" height="68" rx="12" fill="url(#${p})"/><rect x="66" y="22" width="96" height="30" rx="12" fill="#fff" fill-opacity=".1"/>
      <text x="114" y="55" text-anchor="middle" font-family="vodafone-bold-en, sans-serif" font-size="21" font-style="italic" fill="#ffd400" transform="translate(1.6 1.6)">YANGO</text>
      <text x="114" y="55" text-anchor="middle" font-family="vodafone-bold-en, sans-serif" font-size="21" font-style="italic" fill="#fff">YANGO</text>
      <text x="114" y="77" text-anchor="middle" font-family="vodafone-bold-en, sans-serif" font-size="21" font-style="italic" fill="#ffd400" transform="translate(1.6 1.6)">PLAY</text>
      <text x="114" y="77" text-anchor="middle" font-family="vodafone-bold-en, sans-serif" font-size="21" font-style="italic" fill="#fff">PLAY</text></g>`,
      'pz-scene',
    )
  },
  family: () => {
    const [w, o] = [uid('fw'), uid('fo')]
    return svg(
      '0 0 180 110',
      `${ground(70, 102, 34, 6, 0.18)}${ground(124, 102, 32, 6, 0.18)}<defs><radialGradient id="${w}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#d7dbe3"/></radialGradient><radialGradient id="${o}" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#ff9b5c"/><stop offset="1" stop-color="#e2380c"/></radialGradient></defs>
      <path d="M44 100c-4-22 2-52 26-52s30 30 26 52c-6-4-9-4-13 0-4-4-9-4-13 0-4-4-10-4-13 0z" fill="url(#${w})"/><circle cx="61" cy="70" r="3.2" fill="#2b2b33"/><circle cx="78" cy="70" r="3.2" fill="#2b2b33"/><ellipse cx="69.5" cy="80" rx="3.6" ry="2.4" fill="#2b2b33"/>
      <rect x="98" y="40" width="54" height="62" rx="26" fill="url(#${o})"/><circle cx="114" cy="62" r="3.6" fill="#2b1a14"/><circle cx="136" cy="62" r="3.6" fill="#2b1a14"/><path d="M110 74c5 10 23 10 28 0z" fill="#2b1a14"/><path d="M116 78c4 3 12 3 16 0" stroke="#ff8f6b" stroke-width="2.4" fill="none"/>
      <path d="M160 26v10M155 31h10" stroke="#e60000" stroke-width="3" stroke-linecap="round"/><circle cx="30" cy="34" r="3" fill="#ffd2c0"/>`,
      'pz-scene',
    )
  },
}

export const perkScene = (name) => (SCENES[name] ?? SCENES.family)()

/* -------------------------------------------------------- offer scenes */

const OFFERS = {
  talabat: () => {
    const [bg, sofa, tile] = [uid('tb'), uid('ts'), uid('tt')]
    return svg(
      '0 0 400 300',
      `<defs><radialGradient id="${bg}" cx=".3" cy=".25" r="1"><stop offset="0" stop-color="#ffd85a"/><stop offset=".55" stop-color="#ffb326"/><stop offset="1" stop-color="#f08a12"/></radialGradient>${lin(sofa, [[0, '#f6c03a'], [1, '#d99512']], 0, 1)}${lin(tile, [[0, '#7a3cff'], [1, '#4d1ac9']])}</defs>
      <rect width="400" height="300" fill="url(#${bg})"/>
      <circle cx="330" cy="40" r="70" fill="#fff" fill-opacity=".14"/><circle cx="60" cy="250" r="90" fill="#fff" fill-opacity=".08"/>
      <path d="M0 210c40-26 120-34 200-30s150 18 200 40v80H0z" fill="url(#${sofa})"/><path d="M0 238c60-16 140-20 210-16s140 14 190 26v52H0z" fill="#c9840c" fill-opacity=".45"/>
      <g transform="translate(70 122) rotate(-14)"><path d="M0 0h86l-8 44H8z" fill="#f4ead7"/><path d="M0 0h86l-4 16H4z" fill="#ffffff"/><path d="M8 18c14 10 56 10 70 0" stroke="#d9a35b" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M14 30c12 6 44 6 58 0" stroke="#7fbf4a" stroke-width="5" fill="none" stroke-linecap="round"/></g>
      <g transform="translate(286 120)"><ellipse cx="34" cy="44" rx="40" ry="10" fill="#14141e" fill-opacity=".12"/><path d="M0 22c0-14 15-24 34-24s34 10 34 24z" fill="#e8a443"/><circle cx="20" cy="8" r="1.6" fill="#fff6dc"/><circle cx="34" cy="4" r="1.6" fill="#fff6dc"/><circle cx="48" cy="9" r="1.6" fill="#fff6dc"/>
        <rect x="-3" y="22" width="74" height="7" rx="3.5" fill="#6fbf3f"/><rect x="-1" y="28" width="70" height="9" rx="4" fill="#7a3b1e"/><rect x="0" y="36" width="68" height="10" rx="5" fill="#e09a3a"/></g>
      <g transform="translate(143 82)"><rect width="116" height="116" rx="28" fill="url(#${tile})"/><rect width="116" height="58" rx="28" fill="#fff" fill-opacity=".1"/>
        <rect x="16" y="36" width="84" height="26" rx="8" fill="#ff6a13"/><text x="58" y="55" text-anchor="middle" font-family="vodafone-bold-en, sans-serif" font-size="17" fill="#fff">talabat</text>
        <rect x="34" y="68" width="48" height="22" rx="7" fill="#fff"/><text x="58" y="84" text-anchor="middle" font-family="vodafone-bold-en, sans-serif" font-size="15" fill="#5b24d6">pro</text></g>
      <g fill="#fff" fill-opacity=".85"><circle cx="122" cy="62" r="4"/><circle cx="292" cy="92" r="3"/><circle cx="270" cy="230" r="3.5"/><rect x="104" y="230" width="9" height="9" rx="2" transform="rotate(20 108 234)"/></g>
      <g fill="#7a3cff"><circle cx="318" cy="200" r="4"/><circle cx="96" cy="100" r="3"/></g>`,
      'pz-photo',
      '',
      { cover: true },
    )
  },
  qanz: () => {
    const [bg] = [uid('qb')]
    const tiles = []
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 9; col += 1) {
        const x = col * 50 - (row % 2 ? 25 : 0)
        const y = row * 52
        const shade = 30 + ((row * 7 + col * 13) % 5) * 7
        tiles.push(`<path d="M${x} ${y + 52}l25-52 25 52z" fill="rgb(${shade},${shade},${shade + 3})"/>`)
      }
    }
    return svg(
      '0 0 400 300',
      `<defs><radialGradient id="${bg}" cx=".7" cy=".3" r="1"><stop offset="0" stop-color="#3a3a40"/><stop offset="1" stop-color="#121214"/></radialGradient></defs>
      <rect width="400" height="300" fill="url(#${bg})"/><g opacity=".55">${tiles.join('')}</g><rect width="400" height="300" fill="url(#${bg})" fill-opacity=".35"/>
      <text x="200" y="140" text-anchor="middle" font-family="vodafone-bold-en, sans-serif" font-size="68" letter-spacing="-2" fill="#fff">qanz</text>
      <text x="226" y="206" text-anchor="middle" font-family="'Geeza Pro', 'Noto Kufi Arabic', 'Segoe UI', sans-serif" font-size="46" font-weight="700" fill="#fff">كنز</text>
      <path d="M180 168v52" stroke="#fff" stroke-opacity=".7" stroke-width="2"/><text x="172" y="188" text-anchor="end" font-family="vodafone-regular-en, sans-serif" font-size="13" fill="#fff">بطاقة هدية</text><text x="172" y="206" text-anchor="end" font-family="vodafone-regular-en, sans-serif" font-size="13" fill="#fff">gift card</text>`,
      'pz-photo',
      '',
      { cover: true },
    )
  },
  fitness: () => {
    const [bg, kb] = [uid('fb'), uid('fk')]
    return svg(
      '0 0 400 300',
      `<defs>${lin(bg, [[0, '#2a2c31'], [1, '#121316']])}${lin(kb, [[0, '#ff6a3d'], [1, '#c40000']])}</defs>
      <rect width="400" height="300" fill="url(#${bg})"/><path d="M0 220h400v80H0z" fill="#1b1c20"/><path d="M0 220h400" stroke="#3a3c42" stroke-width="2"/>
      <circle cx="300" cy="80" r="120" fill="#e60000" fill-opacity=".12"/>
      <g transform="translate(70 120)"><path d="M30 0c-18 0-30 14-30 30h12c0-10 8-18 18-18s18 8 18 18h12C60 14 48 0 30 0z" fill="#d9dce2"/><circle cx="30" cy="60" r="40" fill="url(#${kb})"/><ellipse cx="18" cy="44" rx="12" ry="8" fill="#fff" fill-opacity=".22"/></g>
      <g transform="translate(190 168) rotate(-8)"><rect x="18" y="16" width="120" height="12" rx="6" fill="#cfd3da"/><rect x="0" y="0" width="22" height="44" rx="6" fill="#3a3c42"/><rect x="134" y="0" width="22" height="44" rx="6" fill="#3a3c42"/></g>
      <text x="300" y="120" text-anchor="middle" font-family="vodafone-bold-en, sans-serif" font-size="46" fill="#fff">Be<tspan fill="#ff6a3d">Fit</tspan></text>`,
      'pz-photo',
      '',
      { cover: true },
    )
  },
}

export const offerScene = (name) => (OFFERS[name] ?? OFFERS.talabat)()

/* ------------------------------------------------------- voucher scenes */

const FASHION = {
  zara: { bg: ['#e4e8ee', '#9ea7b2'], garment: 'jacket', colour: ['#3b3f45', '#16181b'], tile: '#111', ink: '#fff', word: 'ZARA', font: "'Didot', 'Bodoni 72', 'Times New Roman', serif", size: 30, spacing: 2 },
  mango: { bg: ['#fbe9dc', '#f3c7a5'], garment: 'sweater', colour: ['#ff8a2b', '#e2580c'], tile: '#fff', ink: '#111', word: 'MANGO', font: 'vodafone-bold-en, sans-serif', size: 18, spacing: 5 },
  kiko: { bg: ['#fde3ea', '#f3b2c6'], garment: 'lipstick', colour: ['#e3245a', '#a8103c'], tile: '#fff', ink: '#111', word: 'KIKO', font: 'vodafone-bold-en, sans-serif', size: 24, spacing: 4 },
  massimo: { bg: ['#f1e6d6', '#cfb48f'], garment: 'coat', colour: ['#c08a52', '#8a5a2c'], tile: '#fff', ink: '#2b2b2b', word: 'Massimo Dutti', font: "'Didot', 'Times New Roman', serif", size: 15, spacing: 0, italic: true },
  stradivarius: { bg: ['#dfe8f4', '#9db5d6'], garment: 'jeans', colour: ['#5a7fb8', '#2f4f80'], tile: '#fff', ink: '#2b2b2b', word: 'Stradivarius', font: "'Snell Roundhand', 'Brush Script MT', cursive", size: 19, spacing: 0, italic: true },
}

const GARMENTS = {
  jacket: (f) => `<path d="M150 70l-34 14-22 70 26 6 6 96h48l6-96 26-6-22-70-34-14-0 6c-4 8-12 8-16 0z" fill="url(#${f})"/><path d="M150 76v160" stroke="#000" stroke-opacity=".25" stroke-width="2"/><path d="M134 84l16 30 16-30" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="3"/>`,
  coat: (f) => `<path d="M150 66l-36 16-26 92 24 6 4 80h68l4-80 24-6-26-92-36-16-12 18z" fill="url(#${f})"/><path d="M150 84v176" stroke="#000" stroke-opacity=".2" stroke-width="2"/><circle cx="160" cy="140" r="3" fill="#000" fill-opacity=".35"/><circle cx="160" cy="170" r="3" fill="#000" fill-opacity=".35"/>`,
  sweater: (f) => `<path d="M150 74c-10 0-14-6-14-6l-36 14-20 84 26 4 6-46 6 98h64l6-98 6 46 26-4-20-84-36-14s-4 6-14 6z" fill="url(#${f})"/><path d="M118 230h64M118 238h64" stroke="#fff" stroke-opacity=".35" stroke-width="3"/><path d="M136 68c4 8 24 8 28 0" fill="none" stroke="#000" stroke-opacity=".2" stroke-width="3"/>`,
  jeans: (f) => `<path d="M112 70h76l8 190h-40l-6-130-6 130h-40z" fill="url(#${f})"/><path d="M112 82h76" stroke="#fff" stroke-opacity=".35" stroke-width="3"/><path d="M150 82v40" stroke="#fff" stroke-opacity=".35" stroke-width="2" stroke-dasharray="4 3"/>`,
  lipstick: (f) => `<rect x="118" y="150" width="40" height="110" rx="6" fill="#1f1f22"/><rect x="122" y="120" width="32" height="40" rx="4" fill="#c9a24a"/><path d="M126 120v-36l24-16v52z" fill="url(#${f})"/><circle cx="196" cy="214" r="38" fill="#1f1f22"/><circle cx="196" cy="214" r="28" fill="url(#${f})" fill-opacity=".85"/>`,
}

/** An editorial still life for a fashion voucher, with the brand's wordmark on a tag. */
export const voucherScene = (brand) => {
  const spec = FASHION[brand] ?? FASHION.zara
  const [bg, g] = [uid('vb'), uid('vg')]
  return svg(
    '0 0 300 300',
    `<defs><radialGradient id="${bg}" cx=".4" cy=".25" r="1"><stop offset="0" stop-color="${spec.bg[0]}"/><stop offset="1" stop-color="${spec.bg[1]}"/></radialGradient>${lin(g, [[0, spec.colour[0]], [1, spec.colour[1]]])}</defs>
    <rect width="300" height="300" fill="url(#${bg})"/><path d="M0 248h300v52H0z" fill="#000" fill-opacity=".06"/>${spec.garment === 'lipstick' ? '' : '<path d="M150 46v18M126 70c0-14 10-24 24-24" fill="none" stroke="#6b6f77" stroke-width="3" stroke-linecap="round"/>'}
    ${GARMENTS[spec.garment](g)}
    <g transform="translate(176 150) rotate(-6)"><rect width="104" height="56" rx="10" fill="${spec.tile}"/><text x="52" y="${spec.italic ? 34 : 37}" text-anchor="middle" font-family="${spec.font}" font-size="${spec.size}" ${spec.italic ? 'font-style="italic"' : ''} letter-spacing="${spec.spacing}" fill="${spec.ink}">${spec.word}</text></g>`,
    'pz-photo',
  )
}

/* ------------------------------------------------------ promo artwork */

/** RED Installments: a glass tablet with "0%". */
export const zeroArt = () => {
  const [glass, edge] = [uid('zg'), uid('ze')]
  return svg(
    '0 0 200 170',
    `<defs>${lin(glass, [[0, '#ffffff', 0.85], [1, '#ffffff', 0.35]])}${lin(edge, [[0, '#ffffff', 0.9], [1, '#ffd2c2', 0.4]])}</defs>
    <g transform="rotate(10 110 85)"><rect x="56" y="14" width="104" height="142" rx="16" fill="#000" fill-opacity=".14" transform="translate(6 8)"/><rect x="56" y="14" width="104" height="142" rx="16" fill="url(#${glass})" stroke="url(#${edge})" stroke-width="3"/>
    <text x="108" y="102" text-anchor="middle" font-family="vodafone-bold-en, sans-serif" font-size="44" fill="#fff" stroke="#f2b3a0" stroke-width="1">0%</text></g>`,
    'pz-art',
  )
}

/** RED Points: three reward cards fanned out. */
export const pointsArt = () => {
  const [o] = [uid('po')]
  return svg(
    '0 0 220 160',
    `<defs>${lin(o, [[0, '#ff7a3d'], [1, '#e60000']])}</defs>
    <g transform="rotate(-22 90 90)"><rect x="40" y="40" width="96" height="62" rx="10" fill="#3a3a3f"/><text x="88" y="78" text-anchor="middle" font-family="vodafone-bold-en, sans-serif" font-size="16" fill="#fff">Rides</text></g>
    <g transform="rotate(12 150 60)"><rect x="104" y="14" width="70" height="104" rx="10" fill="#fff"/><path d="M124 70l14-16 6 10 12-14" fill="none" stroke="#14141e" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><text x="139" y="98" text-anchor="middle" font-family="vodafone-bold-en, sans-serif" font-size="11" fill="#14141e">SPORT</text></g>
    <g transform="rotate(-8 160 120)"><rect x="118" y="86" width="90" height="62" rx="10" fill="url(#${o})" stroke="#fff" stroke-opacity=".5"/>${mark(170, 92, 26)}<text x="128" y="138" font-family="vodafone-bold-en, sans-serif" font-size="10" fill="#fff">vodafone</text></g>`,
    'pz-art',
  )
}

/** RED Elite+: the family in glass tiles, with the premium entertainment that comes with it. */
export const eliteArt = () =>
  `<div class="pz-elite-art" aria-hidden="true">
    <span class="pz-elite-art__tile pz-elite-art__tile--a">${avatar(1, { glasses: true, beard: true, size: 56 })}</span>
    <span class="pz-elite-art__tile pz-elite-art__tile--b">${avatar(4, { size: 48 })}</span>
    <span class="pz-elite-art__tile pz-elite-art__tile--c">${avatar(3, { size: 52 })}</span>
    <span class="pz-elite-art__tile pz-elite-art__tile--d">${avatar(2, { hijab: true, size: 58 })}</span>
    <span class="pz-elite-art__premium"><span class="pz-elite-art__play"></span>Premium</span>
  </div>`

/* ------------------------------------------------------------ the map */

/** A light street map (drawn, not a map service): roads, a park, the river and a few landmarks. */
export const mapArt = () =>
  svg(
    '0 0 400 260',
    `<rect width="400" height="260" fill="#eef0f3"/>
    <path d="M300 0c-10 60 30 110 10 170s-60 70-50 90" fill="none" stroke="#cfe3f2" stroke-width="22" stroke-linecap="round"/>
    <path d="M232 150l60-40 40 60-50 40z" fill="#cfe8c4"/><path d="M40 196l46-18 22 40-46 16z" fill="#d9eccf"/>
    <g fill="none" stroke="#fff" stroke-linecap="round"><path d="M0 70h400M0 140l400-40M60 0l40 260M170 0l-20 260M0 210l400 20M250 0l60 260" stroke-width="10"/>
      <path d="M0 30l180 30M100 90l140 10M20 170l130-10M200 200l180-60M330 0l-30 120M120 230l60-90" stroke-width="5"/></g>
    <g fill="#d9dce2"><rect x="16" y="88" width="30" height="34" rx="3"/><rect x="186" y="16" width="44" height="30" rx="3"/><rect x="300" y="196" width="40" height="22" rx="3"/><rect x="110" y="158" width="26" height="30" rx="3"/></g>
    <g font-family="vodafone-regular-en, sans-serif" font-size="9" fill="#8a8f98" letter-spacing=".5"><text x="236" y="58">DOWNTOWN</text><text x="244" y="134">EL SAB PARK</text><text x="18" y="252">BIRKET EL SAB</text></g>`,
    'pz-map__art',
    '',
    { cover: true },
  )

/** The event poster's light: stage beams behind the artist (the title is set in type, see world.css). */
export const posterLights = () =>
  svg(
    '0 0 400 300',
    `<g stroke="#cfe0ff" stroke-width="5" stroke-dasharray="10 9" opacity=".9" fill="none"><path d="M-20 300 200 40 420 300"/><path d="M40 0l180 200M380 0 200 210" stroke-width="3" opacity=".6"/></g>
    <g fill="#bcd4ff"><circle cx="70" cy="18" r="3"/><circle cx="140" cy="10" r="2.5"/><circle cx="260" cy="12" r="3"/><circle cx="330" cy="20" r="2.5"/></g>`,
    'pz-poster__lights',
    '',
    { cover: true },
  )
