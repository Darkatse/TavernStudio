// Each curve is a spring released from rest, with damping ratio 1 − bounce and
// the frequency at which the remaining displacement falls to 0.1% at the end of
// the duration, so tiers share an easing and differ only in duration.
//
// Usage: node apps/studio/scripts/springs.mjs, then paste into src/styles/index.css.

const EPSILON = 0.001;
const SAMPLES = 24;

function bisect(f, low, high) {
  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    if (f(mid) > 0) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

function spring(bounce) {
  const zeta = 1 - bounce;
  if (zeta >= 1) {
    const u = bisect((x) => (1 + x) * Math.exp(-x) - EPSILON, 0, 50);
    return (s) => 1 - (1 + u * s) * Math.exp(-u * s);
  }
  const root = Math.sqrt(1 - zeta * zeta);
  const decay = Math.log(1 / (EPSILON * root));
  const frequency = (decay / zeta) * root;
  return (s) =>
    1 -
    Math.exp(-decay * s) *
      (Math.cos(frequency * s) + (decay / frequency) * Math.sin(frequency * s));
}

function linear(curve) {
  const points = [];
  for (let i = 0; i <= SAMPLES; i++) {
    points.push(i === SAMPLES ? '1' : String(Number(curve(i / SAMPLES).toFixed(4))));
  }
  return `linear(${points.join(', ')})`;
}

console.log(`--ease-spring: ${linear(spring(0))};`);
console.log(`--ease-spring-bounce: ${linear(spring(0.12))};`);
