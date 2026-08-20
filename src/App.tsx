import { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  BellRing,
  Calendar,
  Check,
  ChevronLeft,
  CircleAlert,
  CirclePlus,
  CircleUserRound,
  ClipboardList,
  Eye,
  EyeOff,
  Flame,
  Gamepad2,
  Home,
  Lock,
  LoaderCircle,
  LogIn,
  LogOut,
  Mail,
  Moon,
  NotebookPen,
  Palette,
  Plus,
  Sparkles,
  Sun,
  Target,
  Trash2,
  TriangleAlert,
  Trophy,
  X,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import './App.css'

type Task = {
  id: string
  title: string
  area: string
  xp: number
  time: string
  color: string
  weeklyTarget: number
}

type Completion = {
  taskId: string
  date: string
}

type Reminder = {
  id: string
  title: string
  time: string
  date: string
  enabled: boolean
}

type Note = {
  id: string
  text: string
  createdAt: string
}

type Store = {
  tasks: Task[]
  completions: Completion[]
  reminders: Reminder[]
  notes: Note[]
}

const iso = () => new Date().toISOString().slice(0, 10)

const ago = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

const fmtReminderDate = (date: string) => {
  if (date === iso()) return 'Hoy'
  if (date === ago(-1)) return 'Mañana'

  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${date}T12:00`))
}

const THEMES = [
  { id: 'bosque', name: 'Bosque', dark: false, accent: '#d9fc72' },
  { id: 'arena', name: 'Arena', dark: false, accent: '#ffcf6b' },
  { id: 'cielo', name: 'Cielo', dark: false, accent: '#7fd4ff' },
  { id: 'medianoche', name: 'Medianoche', dark: true, accent: '#d9fc72' },
  { id: 'oceano', name: 'Océano', dark: true, accent: '#6fe3d6' },
  { id: 'uva', name: 'Uva', dark: true, accent: '#c9a3ff' },
] as const

const CUSTOM_THEME_VARS = [
  '--ink',
  '--muted',
  '--line',
  '--paper',
  '--card',
  '--accent',
  '--accent-text',
  '--accent-soft',
  '--track',
  '--grad-1',
  '--grad-2',
  '--alert-bg',
  '--alert-ink',
] as const

const hexToHsl = (hex: string): [number, number, number] => {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) return [0, 0, l * 100]

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

  let h = 0
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4

  return [h * 60, s * 100, l * 100]
}

const hslToHex = (h: number, s: number, l: number) => {
  const hue = ((h % 360) + 360) % 360
  const sat = Math.max(0, Math.min(100, s)) / 100
  const light = Math.max(0, Math.min(100, l)) / 100

  const c = (1 - Math.abs(2 * light - 1)) * sat
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = light - c / 2

  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x]

  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

const buildCustomTheme = (primary: string, secondary: string) => {
  const [ph, ps, pl] = hexToHsl(primary)
  const [sh, ss, sl] = hexToHsl(secondary)
  const dark = sl < 50

  return {
    '--ink': hslToHex(sh, Math.min(ss, 15), dark ? 94 : 15),
    '--muted': hslToHex(sh, Math.min(ss, 15), dark ? 68 : 45),
    '--line': hslToHex(sh, Math.min(ss, 20), dark ? 26 : 90),
    '--paper': hslToHex(sh, Math.min(ss, 25), dark ? 10 : 96),
    '--card': hslToHex(sh, Math.min(ss, 20), dark ? 15 : 100),
    '--accent': hslToHex(
      ph,
      Math.max(ps, 55),
      Math.min(Math.max(pl, 55), 80)
    ),
    '--accent-text': hslToHex(
      ph,
      Math.max(ps, 40),
      dark ? 65 : 35
    ),
    '--accent-soft': hslToHex(ph, Math.min(ps, 55), 90),
    '--track': hslToHex(sh, Math.min(ss, 15), dark ? 24 : 88),
    '--grad-1': hslToHex(sh, Math.min(ss + 10, 45), 16),
    '--grad-2': hslToHex(sh, Math.min(ss + 10, 45), 8),
    '--alert-bg': dark ? '#3a2422' : '#fbe7e4',
    '--alert-ink': dark ? '#f2a89c' : '#a5453a',
  } as const
}

const starter: Store = {
  tasks: [
    {
      id: 'move',
      title: 'Mover el cuerpo',
      area: 'Salud',
      xp: 40,
      time: '07:30',
      color: 'lime',
      weeklyTarget: 4,
    },
    {
      id: 'focus',
      title: 'Sesión de enfoque',
      area: 'Mentalidad',
      xp: 50,
      time: '09:00',
      color: 'violet',
      weeklyTarget: 5,
    },
    {
      id: 'read',
      title: 'Leer 20 páginas',
      area: 'Aprendizaje',
      xp: 35,
      time: '18:30',
      color: 'cyan',
      weeklyTarget: 4,
    },
    {
      id: 'plan',
      title: 'Planificar mañana',
      area: 'Orden',
      xp: 25,
      time: '21:30',
      color: 'orange',
      weeklyTarget: 5,
    },
  ],
  completions: [],
  reminders: [],
  notes: [],
}

const load = (): Store => {
  try {
    return {
      ...starter,
      ...JSON.parse(localStorage.getItem('vidaquest-v3') || '{}'),
    }
  } catch {
    return starter
  }
}

export default function App() {
  const [store, setStore] = useState<Store>(load)

  const [view, setView] = useState<
    'home' | 'tasks' | 'stats' | 'notes'
  >('home')

  const [sheet, setSheet] = useState<
    | 'task'
    | 'reminder'
    | 'reminders'
    | 'menu'
    | 'auth'
    | 'theme'
    | null
  >(null)

  const [toast, setToast] = useState<{
    text: string
    type: 'success' | 'error' | 'info'
  } | null>(null)

  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('vidaquest-theme')

    if (saved === 'dark') return 'medianoche'
    if (saved === 'light') return 'bosque'
    if (saved === 'custom') return 'custom'
    if (THEMES.some(t => t.id === saved)) return saved as string

    return 'bosque'
  })

  const [customColors, setCustomColors] = useState<{
    primary: string
    secondary: string
  }>(() => {
    try {
      return {
        primary: '#ff8a65',
        secondary: '#171c26',
        ...JSON.parse(
          localStorage.getItem('vidaquest-custom-colors') ||
            '{}'
        ),
      }
    } catch {
      return { primary: '#ff8a65', secondary: '#171c26' }
    }
  })

  const [authUser, setAuthUser] = useState<{
    id: string
    email: string
  } | null>(null)

  const [authLoading, setAuthLoading] = useState(false)

  const [showPassword, setShowPassword] = useState(false)

  const [confirmState, setConfirmState] = useState<{
    title: string
    message: string
    action: () => void
  } | null>(null)

  const [pushStatus, setPushStatus] = useState<
    'unsupported' | 'needs-install' | 'off' | 'on' | 'loading'
  >('off')

  const [task, setTask] = useState({
    title: '',
    area: 'Personal',
    time: '',
    target: 4,
  })

  const [reminder, setReminder] = useState({
    title: '',
    time: '09:00',
    date: iso(),
  })

  const [note, setNote] = useState('')

  const [auth, setAuth] = useState({
    email: '',
    password: '',
    message: '',
  })

  /*
   * ============================================================
   * CARGAR DATOS DESDE SUPABASE
   * ============================================================
   */

  const loadSupabaseData = async () => {
  if (!supabase) {
    console.log('Supabase no está configurado')
    return
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const user = session?.user ?? null

  setAuthUser(
    user ? { id: user.id, email: user.email ?? '' } : null
  )

  if (!user) {
    console.log('No hay usuario autenticado')
    return
  }

  const userId = user.id

  console.log('Cargando datos de Supabase para:', userId)

  const [
    tasksResult,
    completionsResult,
    remindersResult,
    notesResult,
  ] = await Promise.all([
    supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId),

    supabase
      .from('completions')
      .select('*')
      .eq('user_id', userId),

    supabase
      .from('reminders')
      .select('*')
      .eq('user_id', userId),

    supabase
      .from('notes')
      .select('*')
      .eq('user_id', userId),
  ])

  if (tasksResult.error) {
    console.error('Error cargando tareas:', tasksResult.error)
  }

  if (completionsResult.error) {
    console.error(
      'Error cargando completaciones:',
      completionsResult.error
    )
  }

  if (remindersResult.error) {
    console.error(
      'Error cargando recordatorios:',
      remindersResult.error
    )
  }

  if (notesResult.error) {
    console.error('Error cargando notas:', notesResult.error)
  }

  console.log(
    'Completions recibidas de Supabase:',
    completionsResult.data
  )

  const dbTasks: Task[] = (tasksResult.data || []).map(
    (t: any) => ({
      id: t.id,
      title: t.title,
      area: t.area,
      xp: t.xp,
      time: t.time,
      color: t.color,
      weeklyTarget: t.weekly_target,
    })
  )

  const dbCompletions: Completion[] = (
    completionsResult.data || []
  ).map(
    (c: any) => ({
      taskId: c.task_id,
      date: String(c.date).slice(0, 10),
    })
  )

  const dbReminders: Reminder[] = (
    remindersResult.data || []
  ).map(
    (r: any) => ({
      id: r.id,
      title: r.title,
      time: r.time,
      date: r.date,
      enabled: r.enabled,
    })
  )

  const dbNotes: Note[] = (
    notesResult.data || []
  ).map(
    (n: any) => ({
      id: n.id,
      text: n.content,
      createdAt: n.created_at,
    })
  )

  setStore(current => ({
    tasks: tasksResult.error
      ? current.tasks
      : dbTasks.length
        ? dbTasks
        : current.tasks,

    completions: completionsResult.error
      ? current.completions
      : dbCompletions,

    reminders: remindersResult.error
      ? current.reminders
      : dbReminders,

    notes: notesResult.error
      ? current.notes
      : dbNotes,
  }))

  console.log('Datos sincronizados desde Supabase')
}

  /*
   * ============================================================
   * EFECTOS
   * ============================================================
   */

  useEffect(() => {
    localStorage.setItem(
      'vidaquest-v3',
      JSON.stringify(store)
    )
  }, [store])

  useEffect(() => {
    document.documentElement.dataset.theme = theme

    localStorage.setItem('vidaquest-theme', theme)

    if (theme === 'custom') {
      const palette = buildCustomTheme(
        customColors.primary,
        customColors.secondary
      )

      for (const key of CUSTOM_THEME_VARS) {
        document.documentElement.style.setProperty(
          key,
          palette[key]
        )
      }
    } else {
      for (const key of CUSTOM_THEME_VARS) {
        document.documentElement.style.removeProperty(key)
      }
    }
  }, [theme, customColors])

  useEffect(() => {
    localStorage.setItem(
      'vidaquest-custom-colors',
      JSON.stringify(customColors)
    )
  }, [customColors])

  useEffect(() => {
    navigator.serviceWorker?.register('/sw.js')
  }, [])

  useEffect(() => {
    const supported =
      'serviceWorker' in navigator && 'PushManager' in window

    if (!supported) {
      setPushStatus('unsupported')
      return
    }

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean })
        .standalone === true

    if (isIOS && !isStandalone) {
      setPushStatus('needs-install')
      return
    }

    navigator.serviceWorker.ready.then(async reg => {
      const sub = await reg.pushManager.getSubscription()
      setPushStatus(sub ? 'on' : 'off')
    })
  }, [])

  /*
   * Cuando abre la aplicación:
   * intenta cargar todo desde Supabase.
   */
  useEffect(() => {
    loadSupabaseData()

    if (!supabase) return

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session) {
          await loadSupabaseData()
        } else {
          setAuthUser(null)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  /*
   * Recordatorios
   */
  useEffect(() => {
    const check = () => {
      const due = store.reminders.find(
        r =>
          r.enabled &&
          new Date(`${r.date}T${r.time}`) <= new Date() &&
          !localStorage.getItem(
            `vidaquest-dismissed-${r.id}`
          )
      )

      if (due) {
        toastMsg(`Recordatorio: ${due.title}`)

        localStorage.setItem(
          `vidaquest-dismissed-${due.id}`,
          '1'
        )

        if (Notification.permission === 'granted') {
          new Notification('VidaQuest', {
            body: due.title,
          })
        }
      }
    }

    check()

    const timer = setInterval(check, 30000)

    return () => clearInterval(timer)
  }, [store.reminders])

  /*
   * ============================================================
   * DATOS CALCULADOS
   * ============================================================
   */

  const completedToday = store.completions
  .filter(c => String(c.date).slice(0, 10) === iso())
  .map(c => String(c.taskId))

const isDone = (id: string) =>
  completedToday.includes(String(id))

  const weekStart = ago(6)

  const countWeek = (id: string) =>
    store.completions.filter(
      c =>
        c.taskId === id &&
        c.date >= weekStart
    ).length

  const totalXP = store.completions.reduce(
    (sum, c) =>
      sum +
      (store.tasks.find(
        t => t.id === c.taskId
      )?.xp || 0),
    0
  )

  const progress = store.tasks.length
    ? Math.round(
        (completedToday.length /
          store.tasks.length) *
          100
      )
    : 0

  const level =
    Math.floor(totalXP / 500) + 1

  const streak = useMemo(() => {
    let n = 0

    for (let i = 0; i < 365; i++) {
      if (
        store.completions.some(
          c => c.date === ago(i)
        )
      ) {
        n++
      } else if (i) {
        break
      }
    }

    return n
  }, [store.completions])

  const bestStreak = useMemo(() => {
    const days = Array.from(
      new Set(store.completions.map(c => c.date))
    ).sort()

    let best = 0
    let run = 0
    let prev: string | null = null

    for (const d of days) {
      const diff = prev
        ? (new Date(`${d}T00:00`).getTime() -
            new Date(`${prev}T00:00`).getTime()) /
          86400000
        : 1

      run = diff === 1 ? run + 1 : 1
      best = Math.max(best, run)
      prev = d
    }

    return best
  }, [store.completions])

  const avgPerDay =
    store.completions.filter(c => c.date >= weekStart)
      .length / 7

  const weeklyRate = store.tasks.length
    ? Math.round(
        (store.tasks.reduce(
          (sum, t) =>
            sum +
            Math.min(countWeek(t.id), t.weeklyTarget),
          0
        ) /
          store.tasks.reduce(
            (sum, t) => sum + t.weeklyTarget,
            0
          )) *
          100
      )
    : 0

  const areaBreakdown = useMemo(() => {
    const counts = new Map<string, number>()

    for (const c of store.completions) {
      const t = store.tasks.find(
        t => t.id === c.taskId
      )

      if (!t) continue

      counts.set(
        t.area,
        (counts.get(t.area) || 0) + 1
      )
    }

    const max = Math.max(1, ...counts.values())

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([area, count]) => ({
        area,
        count,
        pct: Math.round((count / max) * 100),
      }))
  }, [store.completions, store.tasks])

  const heatmap = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => {
        const date = ago(27 - i)

        return {
          date,
          count: store.completions.filter(
            c => c.date === date
          ).length,
        }
      }),
    [store.completions]
  )

  const toastMsg = (
    text: string,
    type: 'success' | 'error' | 'info' = 'success'
  ) => {
    setToast({ text, type })

    setTimeout(() => {
      setToast(null)
    }, 2200)
  }

  /*
   * ============================================================
   * MARCAR / DESMARCAR TAREA
   * ============================================================
   */

  const toggle = async (id: string) => {
    if (!supabase) {
      toastMsg('Conectá Supabase primero', 'error')
      return
    }

    const {
      data: userData,
    } = await supabase.auth.getUser()

    const user = userData.user

    if (!user) {
      toastMsg('Iniciá sesión primero', 'error')
      return
    }

    const exists = isDone(id)

    const taskItem = store.tasks.find(
      t => t.id === id
    )

    if (!taskItem) return

    /*
     * DESMARCAR
     */
    if (exists) {
      const { error } = await supabase
        .from('completions')
        .delete()
        .eq('task_id', id)
        .eq('date', iso())
        .eq('user_id', user.id)

      if (error) {
        console.error(
          'Error eliminando completion:',
          error
        )

        toastMsg('No se pudo guardar el cambio', 'error')
        return
      }

      setStore(s => ({
        ...s,
        completions:
          s.completions.filter(
            c =>
              !(
                c.taskId === id &&
                c.date === iso()
              )
          ),
      }))

      return
    }

    /*
     * MARCAR
     */

    const { error } = await supabase
      .from('completions')
      .insert({
        user_id: user.id,
        task_id: id,
        date: iso(),
      })

    if (error) {
      console.error(
        'Error guardando completion:',
        error
      )

      toastMsg('No se pudo guardar el cambio')
      return
    }

    const weeklyCount =
      countWeek(id) + 1

    setStore(s => ({
      ...s,
      completions: [
        ...s.completions,
        {
          taskId: id,
          date: iso(),
        },
      ],
    }))

    const bonus =
      weeklyCount === taskItem.weeklyTarget

    toastMsg(
      bonus
        ? `¡Meta semanal! +${taskItem.xp + 100} XP`
        : `+${taskItem.xp} XP`
    )

    navigator.vibrate?.(25)
  }

  /*
   * ============================================================
   * CREAR TAREA
   * ============================================================
   */

  const addTask = async () => {
    if (!task.title.trim()) return

    if (!supabase) {
      toastMsg('Conectá Supabase primero', 'error')
      return
    }

    const {
      data: userData,
    } = await supabase.auth.getUser()

    const user = userData.user

    if (!user) {
      toastMsg('Iniciá sesión primero', 'error')
      return
    }

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        user_id: user.id,
        title: task.title.trim(),
        area: task.area,
        xp: 30,
        time: task.time || 'Sin horario',
        weekly_target:
          Number(task.target) || 1,
        color:
          ['pink', 'cyan', 'lime'][
            store.tasks.length % 3
          ],
      })
      .select()
      .single()

    if (error) {
      console.error(
        'Error creando tarea:',
        error
      )

      toastMsg('No se pudo crear la tarea', 'error')
      return
    }

    const newTask: Task = {
      id: data.id,
      title: data.title,
      area: data.area,
      xp: data.xp,
      time: data.time,
      color: data.color,
      weeklyTarget: data.weekly_target,
    }

    setStore(s => ({
      ...s,
      tasks: [...s.tasks, newTask],
    }))

    setTask({
      title: '',
      area: 'Personal',
      time: '',
      target: 4,
    })

    setSheet(null)

    toastMsg('Tarea creada')
  }

  /*
   * ============================================================
   * ELIMINAR TAREA
   * ============================================================
   */

  const deleteTask = async (id: string) => {
    if (!supabase) return

    const {
      data: userData,
    } = await supabase.auth.getUser()

    const user = userData.user

    if (!user) return

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error(
        'Error eliminando tarea:',
        error
      )
      toastMsg('No se pudo eliminar la tarea', 'error')
      return
    }

    setStore(s => ({
      ...s,
      tasks: s.tasks.filter(
        t => t.id !== id
      ),
      completions:
        s.completions.filter(
          c => c.taskId !== id
        ),
    }))

    toastMsg('Tarea eliminada', 'info')
  }

  const requestDeleteTask = (t: Task) => {
    setConfirmState({
      title: 'Eliminar tarea',
      message: `Vas a eliminar "${t.title}" y todo su historial de esta semana. Esta acción no se puede deshacer.`,
      action: async () => {
        setConfirmState(null)
        await deleteTask(t.id)
      },
    })
  }

  /*
   * ============================================================
   * CREAR RECORDATORIO
   * ============================================================
   */

  const addReminder = async () => {
    if (!reminder.title.trim()) return

    if (!supabase) {
      toastMsg('Conectá Supabase primero', 'error')
      return
    }

    const target = new Date(
      `${reminder.date}T${reminder.time}`
    )

    if (
      Number.isNaN(target.getTime()) ||
      target.getTime() <= Date.now()
    ) {
      toastMsg('Elegí una fecha y hora futura', 'error')
      return
    }

    const {
      data: userData,
    } = await supabase.auth.getUser()

    const user = userData.user

    if (!user) {
      toastMsg('Iniciá sesión primero', 'error')
      return
    }

    if (
      Notification.permission ===
      'default'
    ) {
      await Notification.requestPermission()
    }

    const {
      data,
      error,
    } = await supabase
      .from('reminders')
      .insert({
        user_id: user.id,
        title: reminder.title.trim(),
        date: reminder.date,
        time: reminder.time,
        enabled: true,
      })
      .select()
      .single()

    if (error) {
      console.error(
        'Error creando recordatorio:',
        error
      )
      toastMsg('No se pudo crear el recordatorio', 'error')
      return
    }

    const newReminder: Reminder = {
      id: data.id,
      title: data.title,
      date: data.date,
      time: data.time,
      enabled: data.enabled,
    }

    setStore(s => ({
      ...s,
      reminders: [
        ...s.reminders,
        newReminder,
      ],
    }))

    setReminder({
      title: '',
      date: iso(),
      time: '09:00',
    })

    setSheet(null)

    toastMsg(
      `Recordatorio guardado para ${fmtReminderDate(
        newReminder.date
      )} · ${newReminder.time}`
    )
  }

  /*
   * ============================================================
   * LOGIN
   * ============================================================
   */

  const signIn = async () => {
    if (!supabase) {
      setAuth(a => ({
        ...a,
        message:
          'Conectá Supabase para usar cuentas reales.',
      }))

      return
    }

    if (!auth.email.trim() || !auth.password) {
      setAuth(a => ({
        ...a,
        message: 'Completá tu correo y contraseña.',
      }))

      return
    }

    setAuthLoading(true)

    setAuth(a => ({ ...a, message: '' }))

    const {
      data,
      error,
    } = await supabase.auth.signInWithPassword({
      email: auth.email.trim(),
      password: auth.password,
    })

    setAuthLoading(false)

    if (error) {
      setAuth(a => ({
        ...a,
        message:
          error.message === 'Invalid login credentials'
            ? 'Correo o contraseña incorrectos.'
            : error.message,
      }))

      toastMsg('No se pudo iniciar sesión', 'error')

      return
    }

    setAuthUser(
      data.user
        ? { id: data.user.id, email: data.user.email ?? '' }
        : null
    )

    setAuth({ email: '', password: '', message: '' })

    await loadSupabaseData()

    setSheet(null)

    toastMsg(
      `¡Bienvenido${
        data.user?.email
          ? ', ' + data.user.email.split('@')[0]
          : ''
      }!`
    )
  }

  const signOut = async () => {
    if (!supabase) return

    const { error } = await supabase.auth.signOut()

    if (error) {
      toastMsg('No se pudo cerrar sesión', 'error')
      return
    }

    setAuthUser(null)
    setStore(starter)
    localStorage.removeItem('vidaquest-v3')
    setSheet(null)
    toastMsg('Sesión cerrada', 'info')
  }

  /*
   * ============================================================
   * NOTIFICACIONES PUSH
   * ============================================================
   */

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat(
      (4 - (base64String.length % 4)) % 4
    )

    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/')

    const rawData = atob(base64)

    return Uint8Array.from(
      [...rawData].map(c => c.charCodeAt(0))
    )
  }

  const enablePush = async () => {
    if (!supabase) {
      toastMsg('Conectá Supabase primero', 'error')
      return
    }

    if (!authUser) {
      toastMsg('Iniciá sesión primero', 'error')
      return
    }

    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY

    if (!vapidKey) {
      toastMsg(
        'Falta configurar la clave VAPID',
        'error'
      )
      return
    }

    setPushStatus('loading')

    const permission =
      await Notification.requestPermission()

    if (permission !== 'granted') {
      setPushStatus('off')
      toastMsg(
        'No diste permiso para notificaciones',
        'error'
      )
      return
    }

    const reg = await navigator.serviceWorker.ready

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey:
        urlBase64ToUint8Array(vapidKey),
    })

    const json = sub.toJSON()

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: authUser.id,
          endpoint: json.endpoint!,
          p256dh: json.keys!.p256dh,
          auth: json.keys!.auth,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      )

    if (error) {
      console.error(
        'Error guardando suscripción push:',
        error
      )
      setPushStatus('off')
      toastMsg(
        'No se pudieron activar las notificaciones',
        'error'
      )
      return
    }

    setPushStatus('on')
    toastMsg('Notificaciones activadas')
  }

  const disablePush = async () => {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()

    if (sub) {
      if (supabase) {
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('endpoint', sub.endpoint)
      }

      await sub.unsubscribe()
    }

    setPushStatus('off')
    toastMsg('Notificaciones desactivadas', 'info')
  }

  useEffect(() => {
    if (!supabase || !authUser || pushStatus !== 'on')
      return

    navigator.serviceWorker.ready.then(async reg => {
      const sub =
        await reg.pushManager.getSubscription()

      if (sub) {
        await supabase!
          .from('push_subscriptions')
          .update({
            last_seen_at: new Date().toISOString(),
          })
          .eq('endpoint', sub.endpoint)
      }
    })
  }, [authUser, pushStatus])

  /*
   * ============================================================
   * NAVEGACIÓN
   * ============================================================
   */

  const nav = [
    ['home', Home, 'Inicio'],
    ['tasks', ClipboardList, 'Tareas'],
    ['stats', Trophy, 'Progreso'],
    ['notes', NotebookPen, 'Notas'],
  ] as const

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span>
            <Gamepad2 size={18} />
          </span>
          vidaquest
        </div>

        <div className="top-buttons">
          <button
            className="plain-icon"
            onClick={() =>
              setSheet('theme')
            }
            aria-label="Elegir tema"
          >
            <Palette size={19} />
          </button>

          <button
            className={`bell ${authUser ? 'linked' : ''}`}
            onClick={() =>
              setSheet('menu')
            }
            aria-label="Cuenta"
          >
            <CircleUserRound size={20} />
          </button>
        </div>
      </header>

      <main>
        {view === 'home' && (
          <>
            <section className="intro">
              <p>
                {new Intl.DateTimeFormat(
                  'es-AR',
                  {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  }
                ).format(new Date())}
              </p>

              <h1>
                Tu vida,
                <br />
                <b>tu aventura.</b>
              </h1>

              <button
                onClick={() =>
                  setSheet('reminder')
                }
                className="tiny-action"
              >
                <Bell size={14} />
                Crear recordatorio
              </button>
            </section>

            <section className="level-card">
              <div className="level-orb">
                {level}
              </div>

              <div>
                <small>
                  NIVEL {level} · EXPLORADOR
                </small>

                <h2>
                  Progreso que se siente
                </h2>

                <div className="xp-line">
                  <span
                    style={{
                      width: `${
                        (totalXP % 500) / 5
                      }%`,
                    }}
                  />
                </div>

                <p>
                  {totalXP} XP total ·{' '}
                  {500 -
                    (totalXP % 500)}{' '}
                  XP para avanzar
                </p>
              </div>

              <Sparkles className="spark" />
            </section>

            <section className="status">
              <div
                className="ring"
                style={
                  {
                    '--progress': `${progress * 3.6}deg`,
                  } as React.CSSProperties
                }
              >
                <b>{progress}%</b>
              </div>

              <div>
                <p>
                  PROGRESO DE HOY
                </p>

                <strong>
                  {completedToday.length} de{' '}
                  {store.tasks.length} tareas
                </strong>

                <span>
                  <Flame size={14} />{' '}
                  {streak} días de racha
                </span>
              </div>

              <button
                onClick={() =>
                  setSheet('task')
                }
              >
                <Plus size={20} />
              </button>
            </section>

            <Title
              label="TAREAS DE HOY"
              title="Pequeñas victorias"
              action={() =>
                setView('tasks')
              }
            />

            <TaskList
              tasks={store.tasks.slice(0, 5)}
              done={isDone}
              onToggle={toggle}
            />

            <section className="insight">
              <Sparkles size={17} />

              <p>
                <b>
                  Tu señal del día
                </b>{' '}
                {progress >= 75
                  ? 'Estás a una tarea de cerrar un gran día.'
                  : 'La consistencia de hoy construye tu próxima versión.'}
              </p>
            </section>
          </>
        )}

        {view === 'tasks' && (
          <Page
            title="Mis tareas"
            back={() =>
              setView('home')
            }
            action={() =>
              setSheet('task')
            }
          >
            <p className="filter">
              Tocá una tarea para marcarla.
              Podés eliminar las que ya no
              necesitás.
            </p>

            <TaskList
              tasks={store.tasks}
              done={isDone}
              onToggle={toggle}
              onDelete={requestDeleteTask}
              weekly={countWeek}
            />
          </Page>
        )}

        {view === 'stats' && (
          <Page
            title="Tu progreso"
            back={() =>
              setView('home')
            }
          >
            <section className="stat-grid">
              <Stat
                label="XP acumulado"
                value={String(totalXP)}
                icon="✦"
              />

              <Stat
                label="Racha actual"
                value={`${streak} días`}
                icon="🔥"
              />

              <Stat
                label="Racha récord"
                value={`${bestStreak} días`}
                icon="🏆"
              />

              <Stat
                label="Tareas hechas"
                value={String(
                  store.completions.length
                )}
                icon="✓"
              />

              <Stat
                label="Promedio diario"
                value={avgPerDay.toFixed(1)}
                icon="📊"
              />

              <Stat
                label="Cumplimiento semanal"
                value={`${weeklyRate}%`}
                icon="🎯"
              />
            </section>

            <section className="chart-card">
              <p>
                ÚLTIMOS 7 DÍAS
              </p>

              <h2>
                Tu consistencia
              </h2>

              <div className="bar-chart">
                {Array.from(
                  { length: 7 },
                  (_, i) =>
                    ago(6 - i)
                ).map(
                  (date, i) => {
                    const n =
                      store.completions.filter(
                        c =>
                          c.date === date
                      ).length

                    return (
                      <div
                        key={date}
                      >
                        <span
                          style={{
                            height: `${
                              Math.max(
                                n
                                  ? (n /
                                      Math.max(
                                        store.tasks
                                          .length,
                                        1
                                      )) *
                                      100
                                  : 6,
                                6
                              )
                            }%`,
                          }}
                        />

                        <small>
                          {i === 6
                            ? 'Hoy'
                            : new Intl.DateTimeFormat(
                                'es',
                                {
                                  weekday:
                                    'narrow',
                                }
                              ).format(
                                new Date(
                                  `${date}T12:00`
                                )
                              )}
                        </small>
                      </div>
                    )
                  }
                )}
              </div>
            </section>

            <section className="chart-card">
              <p>
                ÚLTIMOS 28 DÍAS
              </p>

              <h2>
                Tu constancia
              </h2>

              <div className="heatmap">
                {heatmap.map(({ date, count }) => (
                  <span
                    key={date}
                    className="heat-cell"
                    title={`${fmtReminderDate(
                      date
                    )} · ${count} tarea${
                      count === 1 ? '' : 's'
                    }`}
                    style={{
                      background: count
                        ? 'var(--accent)'
                        : 'var(--line)',
                      opacity: count
                        ? Math.min(
                            1,
                            0.3 +
                              (count /
                                Math.max(
                                  store.tasks.length,
                                  1
                                )) *
                                0.7
                          )
                        : 1,
                    }}
                  />
                ))}
              </div>

              <div className="heatmap-legend">
                <span>Menos</span>
                <i style={{ background: 'var(--line)' }} />
                <i
                  style={{
                    background: 'var(--accent)',
                    opacity: 0.4,
                  }}
                />
                <i
                  style={{
                    background: 'var(--accent)',
                    opacity: 0.7,
                  }}
                />
                <i style={{ background: 'var(--accent)' }} />
                <span>Más</span>
              </div>
            </section>

            <section className="chart-card">
              <p>
                POR ÁREA
              </p>

              <h2>
                Dónde ponés tu energía
              </h2>

              {areaBreakdown.length ? (
                <div className="area-breakdown">
                  {areaBreakdown.map(a => (
                    <div
                      className="area-row"
                      key={a.area}
                    >
                      <span>{a.area}</span>

                      <div className="area-line">
                        <i
                          style={{
                            width: `${a.pct}%`,
                          }}
                        />
                      </div>

                      <b>{a.count}</b>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty text="Completá tareas para ver tu energía por área." />
              )}
            </section>

            <Title
              label="OBJETIVOS SEMANALES"
              title="Bonus de experiencia"
            />

            {store.tasks.map(t => {
              const n =
                countWeek(t.id)

              const ready =
                n >=
                t.weeklyTarget

              return (
                <section
                  className={`weekly ${
                    ready
                      ? 'achieved'
                      : ''
                  }`}
                  key={t.id}
                >
                  <div>
                    <b>
                      {t.title}
                    </b>

                    <p>
                      {n}/
                      {
                        t.weeklyTarget
                      } veces esta semana
                    </p>
                  </div>

                  <strong>
                    {ready
                      ? '¡+100 XP!'
                      : '+100 XP'}
                  </strong>

                  <div className="weekly-line">
                    <span
                      style={{
                        width: `${Math.min(
                          100,
                          (n /
                            t.weeklyTarget) *
                            100
                        )}%`,
                      }}
                    />
                  </div>
                </section>
              )
            })}
          </Page>
        )}

        {view === 'notes' && (
          <Page
            title="Bitácora"
            back={() =>
              setView('home')
            }
          >
            <section className="note-composer">
              <p>
                ¿Qué querés recordar de hoy?
              </p>

              <textarea
                value={note}
                onChange={e =>
                  setNote(e.target.value)
                }
                placeholder="Una idea, una reflexión o algo que no quieras olvidar..."
              />

              <button
                onClick={async () => {
                  if (!note.trim())
                    return

                  if (!supabase) {
                    toastMsg(
                      'Conectá Supabase primero',
                      'error'
                    )
                    return
                  }

                  const {
                    data: userData,
                  } =
                    await supabase.auth.getUser()

                  const user =
                    userData.user

                  if (!user) {
                    toastMsg(
                      'Iniciá sesión primero',
                      'error'
                    )
                    return
                  }

                  const {
                    data,
                    error,
                  } =
                    await supabase
                      .from('notes')
                      .insert({
                        user_id:
                          user.id,
                        content:
                          note.trim(),
                      })
                      .select()
                      .single()

                  if (error) {
                    console.error(
                      error
                    )
                    toastMsg(
                      'No se pudo guardar la nota',
                      'error'
                    )
                    return
                  }

                  setStore(s => ({
                    ...s,
                    notes: [
                      {
                        id: data.id,
                        text: data.content,
                        createdAt:
                          data.created_at,
                      },
                      ...s.notes,
                    ],
                  }))

                  setNote('')

                  toastMsg(
                    'Guardado en tu bitácora'
                  )
                }}
              >
                Guardar en mi bitácora
              </button>
            </section>

            <Title
              label="RECUERDOS"
              title="Tu registro personal"
            />

            {store.notes.length ? (
              store.notes.map(n => (
                <article
                  className="note"
                  key={n.id}
                >
                  <p>
                    {n.text}
                  </p>

                  <small>
                    {new Intl.DateTimeFormat(
                      'es-AR',
                      {
                        dateStyle:
                          'medium',
                        timeStyle:
                          'short',
                      }
                    ).format(
                      new Date(
                        n.createdAt
                      )
                    )}
                  </small>
                </article>
              ))
            ) : (
              <Empty
                text="Tu bitácora está lista para guardar lo importante."
              />
            )}
          </Page>
        )}
      </main>

      <nav className="bottom-nav">
        {nav.map(
          ([key, Icon, text]) => (
            <button
              key={key}
              className={
                view === key
                  ? 'active'
                  : ''
              }
              onClick={() =>
                setView(key)
              }
            >
              <Icon size={20} />
              <span>{text}</span>
            </button>
          )
        )}
      </nav>

      {toast && (
        <div className={`celebrate ${toast.type}`}>
          {toast.type === 'error' ? (
            <CircleAlert size={17} />
          ) : toast.type === 'info' ? (
            <Bell size={17} />
          ) : (
            <Sparkles size={17} />
          )}
          {toast.text}
        </div>
      )}

      {sheet && (
        <div
          className="sheet-bg"
          onMouseDown={() =>
            setSheet(null)
          }
        >
          <section
            className="sheet"
            onMouseDown={e =>
              e.stopPropagation()
            }
          >
            <div className="sheet-handle" />

            <button
              className="sheet-close"
              onClick={() =>
                setSheet(null)
              }
            >
              <X size={18} />
            </button>

            {sheet === 'task' && (
              <>
                <span className="sheet-icon">
                  <Target />
                </span>

                <h2>
                  Nueva tarea
                </h2>

                <p>
                  Definí qué querés hacer y
                  cuánto querés repetirlo esta
                  semana.
                </p>

                <input
                  autoFocus
                  placeholder="Ej. Caminar 20 minutos"
                  value={task.title}
                  onChange={e =>
                    setTask({
                      ...task,
                      title:
                        e.target.value,
                    })
                  }
                />

                <div className="form-row">
                  <select
                    value={task.area}
                    onChange={e =>
                      setTask({
                        ...task,
                        area:
                          e.target.value,
                      })
                    }
                  >
                    <option>
                      Personal
                    </option>
                    <option>
                      Salud
                    </option>
                    <option>
                      Aprendizaje
                    </option>
                    <option>
                      Mentalidad
                    </option>
                    <option>
                      Orden
                    </option>
                  </select>

                  <input
                    type="time"
                    value={task.time}
                    onChange={e =>
                      setTask({
                        ...task,
                        time:
                          e.target.value,
                      })
                    }
                  />
                </div>

                <label className="target">
                  Objetivo semanal{' '}
                  <b>
                    {task.target}{' '}
                    veces
                  </b>

                  <input
                    type="range"
                    min="1"
                    max="7"
                    value={task.target}
                    onChange={e =>
                      setTask({
                        ...task,
                        target:
                          Number(
                            e.target
                              .value
                          ),
                      })
                    }
                  />

                  <small>
                    Al cumplirlo ganás +100
                    XP extra.
                  </small>
                </label>

                <button
                  className="primary"
                  onClick={addTask}
                >
                  Crear tarea · +30 XP
                </button>
              </>
            )}

            {sheet === 'reminder' && (
              <>
                <span className="sheet-icon">
                  <Bell />
                </span>

                <h2>
                  Nuevo recordatorio
                </h2>

                <p>
                  Te avisaremos en este
                  dispositivo cuando la
                  aplicación esté abierta.
                </p>

                <input
                  autoFocus
                  placeholder="Ej. Tomar agua"
                  value={
                    reminder.title
                  }
                  onChange={e =>
                    setReminder({
                      ...reminder,
                      title:
                        e.target.value,
                    })
                  }
                />

                <div className="form-row">
                  <input
                    className="half"
                    type="date"
                    min={iso()}
                    value={
                      reminder.date
                    }
                    onChange={e =>
                      setReminder({
                        ...reminder,
                        date:
                          e.target.value,
                      })
                    }
                  />

                  <input
                    className="half"
                    type="time"
                    value={
                      reminder.time
                    }
                    onChange={e =>
                      setReminder({
                        ...reminder,
                        time:
                          e.target.value,
                      })
                    }
                  />
                </div>

                <button
                  className="primary"
                  onClick={
                    addReminder
                  }
                >
                  <Calendar size={16} />
                  Guardar recordatorio
                </button>
              </>
            )}

            {sheet === 'reminders' && (
              <Reminders
                data={
                  store.reminders
                }
                add={() =>
                  setSheet(
                    'reminder'
                  )
                }
                toggle={async id => {
                  if (!supabase)
                    return

                  const reminderItem =
                    store.reminders.find(
                      r =>
                        r.id === id
                    )

                  if (
                    !reminderItem
                  )
                    return

                  const {
                    error,
                  } =
                    await supabase
                      .from(
                        'reminders'
                      )
                      .update({
                        enabled:
                          !reminderItem.enabled,
                      })
                      .eq(
                        'id',
                        id
                      )

                  if (error) {
                    console.error(
                      error
                    )
                    return
                  }

                  setStore(s => ({
                    ...s,
                    reminders:
                      s.reminders.map(
                        r =>
                          r.id === id
                            ? {
                                ...r,
                                enabled:
                                  !r.enabled,
                              }
                            : r
                      ),
                  }))
                }}
              />
            )}

            {sheet === 'theme' && (
              <>
                <span className="sheet-icon">
                  <Palette />
                </span>

                <h2>
                  Elegí tu tema
                </h2>

                <p>
                  Cambia los colores de toda la
                  aplicación. Se guarda en este
                  dispositivo.
                </p>

                <div className="theme-grid">
                  {THEMES.map(t => (
                    <button
                      key={t.id}
                      className={`theme-swatch ${
                        theme === t.id
                          ? 'active'
                          : ''
                      }`}
                      onClick={() =>
                        setTheme(t.id)
                      }
                    >
                      <span
                        className="theme-preview"
                        data-theme={t.id}
                      >
                        <i />
                        {theme === t.id && (
                          <Check size={14} />
                        )}
                      </span>

                      <b>{t.name}</b>

                      <small>
                        {t.dark ? (
                          <Moon size={11} />
                        ) : (
                          <Sun size={11} />
                        )}
                        {t.dark
                          ? 'Oscuro'
                          : 'Claro'}
                      </small>
                    </button>
                  ))}

                  <button
                    className={`theme-swatch ${
                      theme === 'custom'
                        ? 'active'
                        : ''
                    }`}
                    onClick={() =>
                      setTheme('custom')
                    }
                  >
                    <span className="theme-preview">
                      <i
                        style={{
                          background: `linear-gradient(135deg, ${customColors.primary}, ${customColors.secondary})`,
                        }}
                      />
                      {theme === 'custom' && (
                        <Check size={14} />
                      )}
                    </span>

                    <b>Personalizado</b>

                    <small>
                      <Palette size={11} />A
                      tu gusto
                    </small>
                  </button>
                </div>

                {theme === 'custom' && (
                  <div className="custom-colors">
                    <label>
                      Color primario
                      <input
                        type="color"
                        value={
                          customColors.primary
                        }
                        onChange={e =>
                          setCustomColors(c => ({
                            ...c,
                            primary:
                              e.target.value,
                          }))
                        }
                      />
                    </label>

                    <label>
                      Color secundario
                      <input
                        type="color"
                        value={
                          customColors.secondary
                        }
                        onChange={e =>
                          setCustomColors(c => ({
                            ...c,
                            secondary:
                              e.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                )}
              </>
            )}

            {sheet === 'menu' && (
              <>
                <span className="sheet-icon">
                  <CircleUserRound />
                </span>

                <h2>
                  Tu cuenta
                </h2>

                <div
                  className={`account-card ${
                    authUser ? 'linked' : ''
                  }`}
                >
                  <span className="avatar">
                    {authUser ? (
                      authUser.email
                        .charAt(0)
                        .toUpperCase()
                    ) : (
                      <CircleUserRound size={22} />
                    )}
                  </span>

                  <div>
                    <b>
                      {authUser
                        ? authUser.email
                        : 'Invitado'}
                    </b>

                    <small>
                      {authUser
                        ? `Nivel ${level} · ${totalXP} XP`
                        : 'Iniciá sesión para guardar tu progreso'}
                    </small>
                  </div>
                </div>

                {!authUser && (
                  <button
                    className="primary"
                    onClick={() =>
                      setSheet('auth')
                    }
                  >
                    <LogIn size={16} />
                    Iniciar sesión
                  </button>
                )}

                <button
                  className="menu-row"
                  onClick={() =>
                    setSheet(
                      'reminders'
                    )
                  }
                >
                  <Bell />

                  <span>
                    <b>
                      Recordatorios
                    </b>

                    <small>
                      {
                        store
                          .reminders
                          .length
                      }{' '}
                      configurados
                    </small>
                  </span>
                </button>

                {authUser && (
                  <button
                    className="menu-row"
                    disabled={
                      pushStatus === 'unsupported' ||
                      pushStatus === 'needs-install' ||
                      pushStatus === 'loading'
                    }
                    onClick={
                      pushStatus === 'on'
                        ? disablePush
                        : enablePush
                    }
                  >
                    {pushStatus === 'loading' ? (
                      <LoaderCircle
                        size={20}
                        className="spin"
                      />
                    ) : (
                      <BellRing />
                    )}

                    <span>
                      <b>
                        Notificaciones push
                      </b>

                      <small>
                        {pushStatus ===
                          'unsupported' &&
                          'No disponible en este navegador'}
                        {pushStatus ===
                          'needs-install' &&
                          'Agregá la app a tu pantalla de inicio primero'}
                        {pushStatus === 'off' &&
                          'Racha, recordatorios y más'}
                        {pushStatus === 'on' &&
                          'Activadas · tocá para desactivar'}
                        {pushStatus ===
                          'loading' &&
                          'Activando...'}
                      </small>
                    </span>
                  </button>
                )}

                {authUser && (
                  <button
                    className="menu-row danger-row"
                    onClick={signOut}
                  >
                    <LogOut />

                    <span>
                      <b>
                        Cerrar sesión
                      </b>

                      <small>
                        Tus datos quedan
                        guardados en la nube
                      </small>
                    </span>
                  </button>
                )}
              </>
            )}

            {sheet === 'auth' && (
              authUser ? (
                <>
                  <span className="sheet-icon">
                    <CircleUserRound />
                  </span>

                  <h2>
                    Tu cuenta
                  </h2>

                  <p>
                    Sesión iniciada como{' '}
                    <b>{authUser.email}</b>.
                  </p>

                  <button
                    className="danger"
                    onClick={signOut}
                  >
                    <LogOut size={16} />
                    Cerrar sesión
                  </button>
                </>
              ) : (
                <>
                  <span className="sheet-icon">
                    <Lock />
                  </span>

                  <h2>
                    Bienvenido de nuevo
                  </h2>

                  <p>
                    Iniciá sesión para
                    sincronizar tu progreso
                    en todos tus dispositivos.
                  </p>

                  <div className="field">
                    <Mail size={16} />

                    <input
                      autoFocus
                      type="email"
                      placeholder="tu@email.com"
                      value={
                        auth.email
                      }
                      onChange={e =>
                        setAuth({
                          ...auth,
                          email:
                            e.target
                              .value,
                        })
                      }
                    />
                  </div>

                  <div className="field">
                    <Lock size={16} />

                    <input
                      type={
                        showPassword
                          ? 'text'
                          : 'password'
                      }
                      placeholder="Contraseña"
                      value={
                        auth.password
                      }
                      onChange={e =>
                        setAuth({
                          ...auth,
                          password:
                            e.target
                              .value,
                        })
                      }
                      onKeyDown={e =>
                        e.key ===
                          'Enter' &&
                        signIn()
                      }
                    />

                    <button
                      type="button"
                      className="field-action"
                      onClick={() =>
                        setShowPassword(
                          s => !s
                        )
                      }
                      aria-label={
                        showPassword
                          ? 'Ocultar contraseña'
                          : 'Mostrar contraseña'
                      }
                    >
                      {showPassword ? (
                        <EyeOff size={16} />
                      ) : (
                        <Eye size={16} />
                      )}
                    </button>
                  </div>

                  <button
                    className="primary"
                    onClick={signIn}
                    disabled={authLoading}
                  >
                    {authLoading ? (
                      <LoaderCircle
                        size={16}
                        className="spin"
                      />
                    ) : (
                      <LogIn size={16} />
                    )}
                    {authLoading
                      ? 'Ingresando...'
                      : 'Entrar a mi cuenta'}
                  </button>

                  {auth.message && (
                    <p className="alert-error">
                      <CircleAlert size={14} />
                      {auth.message}
                    </p>
                  )}
                </>
              )
            )}
          </section>
        </div>
      )}

      {confirmState && (
        <div
          className="sheet-bg"
          onMouseDown={() =>
            setConfirmState(null)
          }
        >
          <section
            className="confirm-card"
            onMouseDown={e =>
              e.stopPropagation()
            }
          >
            <span className="sheet-icon danger">
              <TriangleAlert />
            </span>

            <h2>{confirmState.title}</h2>

            <p>{confirmState.message}</p>

            <div className="confirm-actions">
              <button
                className="ghost"
                onClick={() =>
                  setConfirmState(null)
                }
              >
                Cancelar
              </button>

              <button
                className="danger"
                onClick={confirmState.action}
              >
                Eliminar
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

/*
 * ============================================================
 * COMPONENTE TASK LIST
 * ============================================================
 */

function TaskList({
  tasks,
  done,
  onToggle,
  onDelete,
  weekly,
}: {
  tasks: Task[]
  done: (id: string) => boolean
  onToggle: (id: string) => void
  onDelete?: (t: Task) => void
  weekly?: (id: string) => number
}) {
  return (
    <section className="missions">
      {tasks.length ? (
        tasks.map(t => (
          <div
            className={`mission ${
              done(t.id)
                ? 'complete'
                : ''
            }`}
            key={t.id}
          >
            <button
              className="task-main"
              onClick={() =>
                onToggle(t.id)
              }
            >
              <span className="check">
                {done(t.id) && (
                  <Check size={15} />
                )}
              </span>

              <i className={t.color} />

              <span>
                <b>
                  {t.title}
                </b>

                <small>
                  {t.area} · {t.time}
                  {weekly &&
                    ` · ${weekly(
                      t.id
                    )}/${
                      t.weeklyTarget
                    } semanal`}
                </small>
              </span>

              <em>
                +{t.xp} XP
              </em>
            </button>

            {onDelete && (
              <button
                className="delete"
                aria-label={`Eliminar ${t.title}`}
                onClick={() =>
                  onDelete(t)
                }
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))
      ) : (
        <Empty text="Todavía no creaste tareas." />
      )}
    </section>
  )
}

/*
 * ============================================================
 * RECORDATORIOS
 * ============================================================
 */

function Reminders({
  data,
  add,
  toggle,
}: {
  data: Reminder[]
  add: () => void
  toggle: (id: string) => void
}) {
  return (
    <>
      <span className="sheet-icon">
        <Bell />
      </span>

      <h2>
        Recordatorios
      </h2>

      <button
        className="new-inline"
        onClick={add}
      >
        <Plus size={16} />
        Nuevo recordatorio
      </button>

      <div className="reminders">
        {data.length ? (
          data.map(r => (
            <label key={r.id}>
              <span>
                <b>
                  {r.title}
                </b>

                <small>
                  {fmtReminderDate(r.date)} · {r.time}
                </small>
              </span>

              <input
                type="checkbox"
                checked={
                  r.enabled
                }
                onChange={() =>
                  toggle(r.id)
                }
              />
            </label>
          ))
        ) : (
          <Empty text="Todavía no tenés recordatorios." />
        )}
      </div>
    </>
  )
}

/*
 * ============================================================
 * COMPONENTES AUXILIARES
 * ============================================================
 */

function Page({
  title,
  back,
  action,
  children,
}: {
  title: string
  back: () => void
  action?: () => void
  children: React.ReactNode
}) {
  return (
    <section className="subpage">
      <header className="page-head">
        <button onClick={back}>
          <ChevronLeft />
        </button>

        <h1>{title}</h1>

        {action ? (
          <button
            onClick={action}
          >
            <CirclePlus />
          </button>
        ) : (
          <span />
        )}
      </header>

      {children}
    </section>
  )
}

function Title({
  label,
  title,
  action,
}: {
  label: string
  title: string
  action?: () => void
}) {
  return (
    <div className="section-title">
      <div>
        <p>{label}</p>
        <h2>{title}</h2>
      </div>

      {action && (
        <button
          onClick={action}
        >
          Ver todas
        </button>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon: string
}) {
  return (
    <div className="stat">
      <span>{icon}</span>
      <p>{label}</p>
      <b>{value}</b>
    </div>
  )
}

function Empty({
  text,
}: {
  text: string
}) {
  return (
    <div className="empty">
      {text}
    </div>
  )
}