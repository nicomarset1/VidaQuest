import { describe, expect, it } from 'vitest'
import {
  addDays,
  groupUpcoming,
  nextEvent,
  relativeWhen,
  occursOn,
  type Recurrence,
  type AgendaItem,
} from './agenda'

const item = (
  id: string,
  date: string,
  time: string,
  enabled = true
): AgendaItem => ({ id, title: id, date, time, enabled })

describe('addDays', () => {
  it('cruza fin de mes y de año', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('groupUpcoming', () => {
  it('incluye días vacíos y ordena por hora', () => {
    const groups = groupUpcoming(
      [
        item('b', '2026-09-29', '18:00'),
        item('a', '2026-09-29', '09:00'),
        item('c', '2026-10-01', '10:00'),
        item('fuera', '2026-10-05', '10:00'),
      ],
      '2026-09-29',
      3
    )

    expect(groups.map(g => g.date)).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
    ])
    expect(groups[0].items.map(i => i.id)).toEqual(['a', 'b'])
    expect(groups[1].items).toEqual([])
    expect(groups[2].items.map(i => i.id)).toEqual(['c'])
  })
})

describe('nextEvent', () => {
  const now = new Date(2026, 8, 29, 12, 0)

  it('ignora pasados y deshabilitados', () => {
    const next = nextEvent(
      [
        item('pasado', '2026-09-29', '11:00'),
        item('apagado', '2026-09-29', '13:00', false),
        item('luego', '2026-09-30', '08:00'),
        item('ya', '2026-09-29', '15:00'),
      ],
      now
    )
    expect(next?.id).toBe('ya')
  })

  it('devuelve null si no hay futuros', () => {
    expect(nextEvent([item('p', '2026-09-28', '10:00')], now)).toBeNull()
  })
})

describe('relativeWhen', () => {
  const now = new Date(2026, 8, 29, 12, 0)

  it('menos de una hora', () => {
    expect(relativeWhen('2026-09-29', '12:45', now)).toBe('en 45 min')
    expect(relativeWhen('2026-09-29', '12:00', now)).toBe('ahora')
  })

  it('hoy, mañana y otro día', () => {
    expect(relativeWhen('2026-09-29', '18:30', now)).toBe('hoy a las 18:30')
    expect(relativeWhen('2026-09-30', '09:00', now)).toBe(
      'mañana a las 09:00'
    )
    expect(relativeWhen('2026-10-02', '09:00', now)).toBe(
      'vie 2 oct · 09:00'
    )
  })
})

const rec = (
  date: string,
  recurrence: Recurrence,
  recurrenceUntil: string | null = null,
  time = '10:00'
): AgendaItem => ({
  id: `${recurrence}-${date}`,
  title: 'x',
  date,
  time,
  enabled: true,
  recurrence,
  recurrenceUntil,
})

describe('occursOn', () => {
  it('sin repetición: solo su fecha', () => {
    const r = rec('2026-09-29', 'none')
    expect(occursOn(r, '2026-09-29')).toBe(true)
    expect(occursOn(r, '2026-09-30')).toBe(false)
  })

  it('diaria desde el inicio y hasta el límite', () => {
    const r = rec('2026-09-29', 'daily', '2026-10-02')
    expect(occursOn(r, '2026-09-28')).toBe(false)
    expect(occursOn(r, '2026-09-29')).toBe(true)
    expect(occursOn(r, '2026-10-02')).toBe(true)
    expect(occursOn(r, '2026-10-03')).toBe(false)
  })

  it('semanal: mismo día de la semana', () => {
    const r = rec('2026-09-29', 'weekly')
    expect(occursOn(r, '2026-10-06')).toBe(true)
    expect(occursOn(r, '2026-10-07')).toBe(false)
    expect(occursOn(r, '2027-03-30')).toBe(true)
  })

  it('mensual el 31 salta meses sin 31', () => {
    const r = rec('2026-08-31', 'monthly')
    expect(occursOn(r, '2026-09-30')).toBe(false)
    expect(occursOn(r, '2026-10-01')).toBe(false)
    expect(occursOn(r, '2026-10-31')).toBe(true)
  })

  it('límite anterior al inicio: solo la fecha inicial', () => {
    const r = rec('2026-09-29', 'daily', '2026-09-01')
    expect(occursOn(r, '2026-09-29')).toBe(true)
    expect(occursOn(r, '2026-09-30')).toBe(false)
  })

  it('datos viejos sin recurrence se tratan como none', () => {
    expect(occursOn(item('a', '2026-09-29', '10:00'), '2026-09-29')).toBe(true)
    expect(occursOn(item('a', '2026-09-29', '10:00'), '2026-09-30')).toBe(false)
  })
})

describe('agenda con repeticiones', () => {
  it('groupUpcoming repite eventos semanales', () => {
    const groups = groupUpcoming(
      [rec('2026-09-22', 'weekly')],
      '2026-09-29',
      8
    )
    expect(groups.filter(g => g.items.length).map(g => g.date)).toEqual([
      '2026-09-29',
      '2026-10-06',
    ])
  })

  it('nextEvent devuelve la próxima ocurrencia con su fecha', () => {
    const now = new Date(2026, 8, 29, 12, 0)
    const next = nextEvent([rec('2026-09-01', 'daily', null, '09:00')], now)
    expect(next?.date).toBe('2026-09-30')
    expect(next?.time).toBe('09:00')
  })

  it('nextEvent: evento de todo el día de hoy sigue siendo próximo', () => {
    const now = new Date(2026, 8, 29, 18, 0)
    const next = nextEvent(
      [{ ...rec('2026-09-29', 'none', null, ''), allDay: true }],
      now
    )
    expect(next?.date).toBe('2026-09-29')
  })
})
