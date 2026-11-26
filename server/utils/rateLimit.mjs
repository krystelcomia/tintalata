export function getClientIp(req) {
  const xff = req?.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  return req?.ip || req?.socket?.remoteAddress || 'unknown';
}

export function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 10,
  keyPrefix = 'rl',
  message = 'Masyadong maraming pagtatangka. Pakisubukang muli pagkalipas ng ilang minuto.',
} = {}) {
  const hits = new Map();

  return (req, res, next) => {
    const customMax = req.app?.locals?.rateLimitOverrides?.[keyPrefix];
    const effectiveMax = Number.isFinite(Number(customMax)) ? Number(customMax) : max;
    const ip = getClientIp(req);
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    const cutoff = now - windowMs;

    const list = (hits.get(key) || []).filter((ts) => ts > cutoff);
    if (list.length >= effectiveMax) {
      return res.status(429).json({ error: message });
    }
    list.push(now);
    hits.set(key, list);

    if (hits.size > 5000) {
      for (const [k, v] of hits.entries()) {
        if (!v.some((ts) => ts > cutoff)) {
          hits.delete(k);
        }
      }
    }

    next();
  };
}
