export function formatTime(date: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}
