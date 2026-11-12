export const FP = 65536;
export const PI = 205887;
export const fix = n => Math.round(n * FP);
export const num = n => n / FP;
export const mul = (a, b) => Math.floor(a * b / FP + 0.5);
export const div = (a, b) => Math.floor(a * FP / b);
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const root = n => Math.floor(Math.sqrt(n));

export function sin(x) {
  const half = PI >> 1;
  x %= 2 * PI;
  if (x > PI) x -= 2 * PI;
  if (x < -PI) x += 2 * PI;
  if (x > half) x = PI - x;
  if (x < -half) x = -PI - x;
  const xx = mul(x, x);
  let term = x, sum = x;
  for (let k = 1; k <= 4; k++) {
    term = -Math.floor(mul(term, xx) / ((2 * k) * (2 * k + 1)));
    sum += term;
  }
  return sum;
}
export const cos = x => sin(x + (PI >> 1));

export class Random {
  constructor(seed) { this.state = (seed >>> 0) || 0x9e3779b9; }
  next() {
    let x = this.state;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }
  int(n) { return this.next() % n; }
  unit() { return this.next() / 4294967296; }
  range(a, b) { return a + this.unit() * (b - a); }
}

export function cleanName(value) {
  return String(value ?? '').normalize('NFKC')
    .replace(/[^\p{L}\p{N} _.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16) || 'PLAYER';
}
