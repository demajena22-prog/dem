


const locks = new Map();

function now() {
  return Date.now();
}

export const processingLocks = {
  lock(key, ttl = 10000000) {
    const expires = locks.get(key);
    if (expires && expires > now()) return false; 
    locks.set(key, now() + ttl);
    return true;
  },
  unlock(key) {
    locks.delete(key);
  },
  isLocked(key) {
    const expires = locks.get(key);
    if (!expires) return false;
    if (expires <= now()) {
      locks.delete(key);
      return false;
    }
    return true;
  },
};


setInterval(() => {
  const t = now();
  for (const [k, v] of locks.entries()) {
    if (v <= t) locks.delete(k);
  }
}, 60 * 1000);

