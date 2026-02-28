export const BUILD_META = {
  hash: 'd9a844e',
  datetimeIso: '2026-02-28T13:24:19.000Z'
};

/** Format build label with datetime in user's local timezone */
export function formatBuildLabel(hash, datetimeIso) {
  const h = hash || 'dev';
  if (!datetimeIso) return `Build ${h}`;
  try {
    const d = new Date(datetimeIso);
    if (isNaN(d.getTime())) return `Build ${h} · ${datetimeIso}`;
    const local = d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
    return `Build ${h} · ${local}`;
  } catch {
    return `Build ${h} · ${datetimeIso}`;
  }
}
