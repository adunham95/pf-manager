// Pixel player faces: a 12x12 bust built from the player's id, so the same player always has the same face
// (recruit, roster player and portal entry share an id). Nothing is saved.

export interface Pixel { x: number; y: number; w: number; f: string }

const SKIN = ['#f6d3b5', '#ebb98f', '#d39a6a', '#b07548', '#8a5432', '#5e3920']
const SKIN_SHADE = ['#dca98a', '#cf9568', '#b67b4d', '#8f5a33', '#6c3f23', '#452812']
/** Hair colors, weighted toward dark. */
const HAIR: [string, number][] = [['#17110d', 40], ['#3a2315', 28], ['#6b4423', 14], ['#d6ad55', 12], ['#a5481f', 6]]
type Style = 'buzz' | 'short' | 'flattop' | 'afro' | 'locs' | 'bald' | 'headband' | 'mohawk' | 'swoop'
const STYLES: [Style, number][] = [['short', 20], ['buzz', 18], ['flattop', 9], ['afro', 10], ['locs', 10], ['bald', 6], ['headband', 10], ['mohawk', 5], ['swoop', 12]]

/** A repeatable 0 to 1 roll from numbers. */
function roll(...xs: number[]) {
  let h = 2166136261
  for (const x of xs) { h ^= x + 0x9e3779b9; h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909) }
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
function weighted<T>(items: [T, number][], r: number): T {
  const total = items.reduce((n, [, w]) => n + w, 0)
  let at = r * total
  for (const [v, w] of items) { if ((at -= w) < 0) return v }
  return items[items.length - 1][0]
}

/** The face as runs of pixels, ready to draw as SVG rects. `jersey` is the team color; upperclassmen may grow a beard. */
export function faceOf(id: number, jersey: string, year = 1): Pixel[] {
  const grid: (string | null)[][] = Array.from({ length: 12 }, () => Array(12).fill(null))
  const set = (x: number, y: number, f: string) => { if (x >= 0 && x < 12 && y >= 0 && y < 12) grid[y][x] = f }
  const span = (x0: number, x1: number, y: number, f: string) => { for (let x = x0; x <= x1; x++) set(x, y, f) }

  const tone = Math.floor(roll(id, 1) * SKIN.length)
  const skin = SKIN[tone], shade = SKIN_SHADE[tone]
  const hair = weighted(HAIR, roll(id, 2))
  const style = weighted(STYLES, roll(id, 3))
  const hidesEars = style === 'afro' || style === 'locs'

  // jersey and neck
  span(1, 10, 11, jersey); span(2, 9, 10, jersey)
  span(5, 6, 9, skin); span(5, 6, 10, skin)
  set(5, 11, shade); set(6, 11, shade)
  // head
  span(4, 7, 2, skin)
  for (let y = 3; y <= 7; y++) span(3, 8, y, skin)
  span(4, 7, 8, skin)
  if (!hidesEars) { set(2, 5, skin); set(9, 5, skin) }
  // eyes and mouth
  set(4, 5, '#1b1b1b'); set(7, 5, '#1b1b1b')
  span(5, 6, 7, shade)
  if (roll(id, 4) < 0.3) { set(4, 6, '#111'); set(7, 6, '#111') } // eye black
  // hair
  switch (style) {
    case 'buzz': span(4, 7, 2, hair); set(3, 3, hair); set(8, 3, hair); break
    case 'short': span(4, 7, 1, hair); span(3, 8, 2, hair); set(3, 3, hair); set(8, 3, hair); break
    case 'swoop': span(4, 8, 1, hair); span(3, 8, 2, hair); span(6, 8, 3, hair); set(3, 3, hair); break
    case 'flattop': span(3, 8, 0, hair); span(3, 8, 1, hair); span(3, 8, 2, hair); set(3, 3, hair); set(8, 3, hair); break
    case 'afro':
      span(4, 7, 0, hair); span(3, 8, 0, hair); span(2, 9, 1, hair); span(2, 9, 2, hair)
      for (let y = 3; y <= 5; y++) { set(2, y, hair); set(9, y, hair) }
      set(3, 3, hair); set(8, 3, hair); break
    case 'locs':
      span(4, 7, 1, hair); span(3, 8, 2, hair); set(3, 3, hair); set(8, 3, hair)
      for (let y = 3; y <= 8; y++) { set(2, y, hair); set(9, y, hair) }
      break
    case 'headband': span(4, 7, 1, hair); span(3, 8, 2, hair); span(3, 8, 3, jersey); break
    case 'mohawk': span(5, 6, 0, hair); span(5, 6, 1, hair); span(5, 6, 2, hair); break
    case 'bald': break
  }
  // brows for some, beards for some upperclassmen
  if (style !== 'bald' && roll(id, 5) < 0.45) { set(4, 4, hair); set(7, 4, hair) }
  const beard = year >= 3 && roll(id, 6) < 0.35
  if (beard) { set(3, 7, hair); set(8, 7, hair); set(4, 7, hair); set(7, 7, hair); span(4, 7, 8, hair) }
  else if (year >= 2 && roll(id, 7) < 0.1) span(4, 7, 6, hair) // mustache

  // merge each row into runs of one color
  const out: Pixel[] = []
  for (let y = 0; y < 12; y++) {
    let x = 0
    while (x < 12) {
      const f = grid[y][x]
      if (!f) { x++; continue }
      let w = 1
      while (x + w < 12 && grid[y][x + w] === f) w++
      out.push({ x, y, w, f })
      x += w
    }
  }
  return out
}
