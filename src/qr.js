import { encode } from 'uqr';

const BORDER = 3;

/**
 * QR code as an SVG: soft-cornered modules and rounded finder patterns.
 * Module shape is tuned to stay decodable (full-size rounded squares; small
 * dots looked nicer but failed strict decoders).
 */
export function qrSvg(text, { fg = '#0a0a0a', bg = '#ffffff' } = {}) {
  const { data, size, types } = encode(text, { ecc: 'M', border: BORDER });
  const r = 0.3;
  const side = 1 - 2 * r;
  let d = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!data[y][x] || types[y][x] === 2) continue; // finders drawn below
      d += `M${x + r},${y}h${side}a${r},${r} 0 0 1 ${r},${r}v${side}a${r},${r} 0 0 1 -${r},${r}h-${side}a${r},${r} 0 0 1 -${r},-${r}v-${side}a${r},${r} 0 0 1 ${r},-${r}z`;
    }
  }
  const finders = [[BORDER, BORDER], [size - BORDER - 7, BORDER], [BORDER, size - BORDER - 7]]
    .map(([x, y]) => `<rect x="${x + 0.5}" y="${y + 0.5}" width="6" height="6" rx="1.6" fill="none" stroke="${fg}" stroke-width="1"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx=".8" fill="${fg}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR code"><rect width="${size}" height="${size}" rx="2.5" fill="${bg}"/><path fill="${fg}" d="${d}"/>${finders}</svg>`;
}
