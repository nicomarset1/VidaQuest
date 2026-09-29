// Helpers puros de la agenda: fechas locales como 'YYYY-MM-DD' y horas
// 'HH:MM', igual que el resto de la app.

export type AgendaItem = {
  id: string
  title: string
  date: string
  time: string
  enabled: boolean
}

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MONTHS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
]

const toDate = (date: string, time = '12:00') => {
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  return new Date(y, m - 1, d, h || 0, min || 0)
}

const toDateString = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`

export const addDays = (date: string, n: number) => {
  const d = toDate(date)
  d.setDate(d.getDate() + n)
  return toDateString(d)
}

const byTime = (a: AgendaItem, b: AgendaItem) =>
  (a.time || '').localeCompare(b.time || '')

export const groupUpcoming = <T extends AgendaItem>(
  items: T[],
  from: string,
  days: number
) =>
  Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i)
    return {
      date,
      items: items.filter(it => it.date === date).sort(byTime),
    }
  })

export const nextEvent = <T extends AgendaItem>(
  items: T[],
  now: Date
): T | null => {
  const upcoming = items
    .filter(
      it => it.enabled && toDate(it.date, it.time).getTime() >= now.getTime()
    )
    .sort(
      (a, b) =>
        toDate(a.date, a.time).getTime() - toDate(b.date, b.time).getTime()
    )
  return upcoming[0] ?? null
}

export const relativeWhen = (date: string, time: string, now: Date) => {
  const when = toDate(date, time)
  const minutes = Math.round((when.getTime() - now.getTime()) / 60000)

  if (minutes <= 0 && minutes > -1) return 'ahora'
  if (minutes > 0 && minutes < 60) return `en ${minutes} min`

  const today = toDateString(now)
  if (date === today) return `hoy a las ${time}`
  if (date === addDays(today, 1)) return `mañana a las ${time}`

  return `${WEEKDAYS[when.getDay()]} ${when.getDate()} ${
    MONTHS[when.getMonth()]
  } · ${time}`
}
