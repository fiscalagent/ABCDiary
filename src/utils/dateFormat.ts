export function formatDate(d: Date): string {
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatDateTime(d: Date): string {
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatShortDate(d: Date): string {
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
