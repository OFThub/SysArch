const relative = new Intl.RelativeTimeFormat('tr', { numeric: 'auto' });

/** "3 dakika önce", "dün": how long ago an ISO time was, in minutes, hours or days. */
export function ago(iso: string) {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour');
  return relative.format(Math.round(hours / 24), 'day');
}
