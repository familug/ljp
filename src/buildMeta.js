export const BUILD_META = {
    hash: '08d8afb',
    datetimeIso: '2026-03-02T15:41:56.000Z'
};
/** Format build label with datetime in user's local timezone */
export function formatBuildLabel(hash, datetimeIso) {
    const h = hash || 'dev';
    if (!datetimeIso)
        return `Build ${h}`;
    try {
        const d = new Date(datetimeIso);
        if (isNaN(d.getTime()))
            return `Build ${h} · ${datetimeIso}`;
        const local = d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
        return `Build ${h} · ${local}`;
    }
    catch {
        return `Build ${h} · ${datetimeIso}`;
    }
}
