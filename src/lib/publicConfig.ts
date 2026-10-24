export function isPublishableKey(value: string) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  try {
    const part = value.split('.')[1];
    const payload = JSON.parse(
      atob(part.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { role?: string };
    return payload.role === 'anon';
  } catch {
    return false;
  }
}

export function isSupabaseUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
