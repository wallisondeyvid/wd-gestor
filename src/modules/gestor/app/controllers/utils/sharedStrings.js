export function asStr(v){ return (v == null ? '' : (Array.isArray(v) ? String(v[0] ?? '') : String(v))); }
