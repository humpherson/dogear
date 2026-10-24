export type Callback = {
  active: boolean;
  recovery: boolean;
  error: string | null;
};
export function readCallback(
  location: Pick<Location, 'hash' | 'search'>,
): Callback {
  const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(location.search);
  return {
    active:
      fragment.has('access_token') ||
      fragment.has('error') ||
      fragment.has('error_description') ||
      query.get('auth') === 'callback',
    recovery:
      fragment.get('type') === 'recovery' || query.get('flow') === 'recovery',
    error:
      fragment.get('error_description') ||
      fragment.get('error') ||
      query.get('error_description') ||
      query.get('error'),
  };
}
export function authRedirect(recovery = false) {
  return `${window.location.origin}${import.meta.env.BASE_URL}?auth=callback${recovery ? '&flow=recovery' : ''}`;
}
export function safeDestination(value: unknown) {
  return typeof value === 'string' &&
    /^\/(?![/\\])/.test(value) &&
    !value.includes('\\')
    ? value
    : '/library';
}
