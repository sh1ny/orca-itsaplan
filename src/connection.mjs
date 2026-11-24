export const URL_SETTING = 'apiUrl';

export function normalizeBase(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[?#\\\x00-\x1f\x7f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.origin + url.pathname.replace(/\/+$/, '') : null;
  } catch {
    return null;
  }
}

export const projectId = (id) => Number.isSafeInteger(id) && id > 0;
export const projectRef = (ref) => typeof ref === 'string' && /^[A-Za-z0-9_-]{1,128}\.[A-Za-z0-9_-]{1,128}$/.test(ref);
