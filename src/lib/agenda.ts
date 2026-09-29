// Helpers puros de la agenda: fechas locales como 'YYYY-MM-DD' y horas
// 'HH:MM', igual que el resto de la app.

export type Recurrence =
  | 'none'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'

// `date` es la fecha de inicio de la serie. Los campos de repetición son
// opcionales para aceptar datos guardados antes de que existieran.
export type AgendaItem = {
  id: string
  title: string
  date: string
  time: string
  enabled: boolean
  allDay?: boolean
  recurrence?: Recurrence
  recurrenceUntil?: string | null
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

const dayDiff = (from: string, to: string) =>
  Math.round(
    (toDate(to).getTime() - toDate(from).getTime()) / 86400000
  )

// Anual: mismo día y mes. Un 29 de febrero cae el 28 en los años que no
// son bisiestos, así un cumpleaños no se saltea tres de cada cuatro años.
const isLeapYear = (y: number) =>
  (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

const sameDayOfYear = (start: string, date: string) => {
  const md = date.slice(5)
  if (md === start.slice(5)) return true
  return (
    start.slice(5) === '02-29' &&
    md === '02-28' &&
    !isLeapYear(Number(date.slice(0, 4)))
  )
}

export const occursOn = (item: AgendaItem, date: string) => {
  const start = item.date
  if (date < start) return false

  const until = item.recurrenceUntil
  // Un límite anterior al inicio deja solo la fecha inicial.
  const recurrence =
    until && until < start ? 'none' : item.recurrence ?? 'none'

  if (recurrence === 'none') return date === start
  if (until && date > until) return false

  if (recurrence === 'daily') return true
  if (recurrence === 'weekly') return dayDiff(start, date) % 7 === 0

  if (recurrence === 'yearly') return sameDayOfYear(start, date)

  // Mensual: mismo número de día. Los meses que no lo tienen (ej. 31)
  // se saltean, no se corre al día siguiente.
  return date.slice(8) === start.slice(8)
}

const byTime = (a: AgendaItem, b: AgendaItem) =>
  (a.allDay ? '' : a.time || '').localeCompare(b.allDay ? '' : b.time || '')

export const groupUpcoming = <T extends AgendaItem>(
  items: T[],
  from: string,
  days: number
) =>
  Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i)
    return {
      date,
      items: items.filter(it => occursOn(it, date)).sort(byTime),
    }
  })

// Próxima ocurrencia habilitada desde `now`, con `date` ya puesta en la
// fecha de esa ocurrencia (el id sigue siendo el de la serie). Un evento
// de todo el día cuenta como próximo durante todo ese día.
export const nextEvent = <T extends AgendaItem>(
  items: T[],
  now: Date,
  horizonDays = 400
): T | null => {
  const today = toDateString(now)

  for (let i = 0; i <= horizonDays; i++) {
    const date = addDays(today, i)

    const candidates = items
      .filter(it => it.enabled && occursOn(it, date))
      .filter(
        it =>
          it.allDay ||
          toDate(date, it.time).getTime() >= now.getTime()
      )
      .sort(byTime)

    if (candidates.length) return { ...candidates[0], date }
  }

  return null
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
