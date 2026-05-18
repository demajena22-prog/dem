export function isValidProductId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_\-]{1,64}$/.test(id);
}

export function isValidQuantity(q) {
  const n = Number(q);
  return Number.isInteger(n) && n > 0 && n <= 1000;
}

export function isValidReffId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9]{6,32}$/.test(id);
}
