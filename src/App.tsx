import { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  Check,
  ChevronLeft,
  CirclePlus,
  ClipboardList,
  Flame,
  Gamepad2,
  Home,
  LogIn,
  Menu,
  Moon,
  NotebookPen,
  Plus,
  Sparkles,
  Sun,
  Target,
  Trash2,
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
    'task' | 'reminder' | 'reminders' | 'menu' | 'auth' | null
  >(null)

  const [toast, setToast] = useState('')

  const [dark, setDark] = useState(
    () => localStorage.getItem('vidaquest-theme') === 'dark'
  )

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

    const { data: userData, error: userError } =
      await supabase.auth.getUser()

    if (userError || !userData.user) {
      console.log('No hay usuario autenticado')
      return
    }

    const userId = userData.user.id

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
    ).map((c: any) => ({
      taskId: c.task_id,
      date: c.date,
    }))

    const dbReminders: Reminder[] = (
      remindersResult.data || []
    ).map((r: any) => ({
      id: r.id,
      title: r.title,
      time: r.time,
      date: r.date,
      enabled: r.enabled,
    }))

    const dbNotes: Note[] = (notesResult.data || []).map(
      (n: any) => ({
        id: n.id,
        text: n.content,
        createdAt: n.created_at,
      })
    )

    setStore({
      tasks: dbTasks.length ? dbTasks : load().tasks,
      completions: dbCompletions,
      reminders: dbReminders,
      notes: dbNotes,
    })

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
    document.documentElement.dataset.theme = dark
      ? 'dark'
      : 'light'

    localStorage.setItem(
      'vidaquest-theme',
      dark ? 'dark' : 'light'
    )
  }, [dark])

  useEffect(() => {
    navigator.serviceWorker?.register('/sw.js')
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
    .filter(c => c.date === iso())
    .map(c => c.taskId)

  const isDone = (id: string) =>
    completedToday.includes(id)

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

  const toastMsg = (text: string) => {
    setToast(text)

    setTimeout(() => {
      setToast('')
    }, 1600)
  }

  /*
   * ============================================================
   * MARCAR / DESMARCAR TAREA
   * ============================================================
   */

  const toggle = async (id: string) => {
    if (!supabase) {
      toastMsg('Conectá Supabase primero')
      return
    }

    const {
      data: userData,
    } = await supabase.auth.getUser()

    const user = userData.user

    if (!user) {
      toastMsg('Iniciá sesión primero')
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

        toastMsg('No se pudo guardar el cambio')
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
      toastMsg('Conectá Supabase primero')
      return
    }

    const {
      data: userData,
    } = await supabase.auth.getUser()

    const user = userData.user

    if (!user) {
      toastMsg('Iniciá sesión primero')
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

      toastMsg('No se pudo crear la tarea')
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

    toastMsg('Tarea eliminada')
  }

  /*
   * ============================================================
   * CREAR RECORDATORIO
   * ============================================================
   */

  const addReminder = async () => {
    if (!reminder.title.trim()) return

    if (!supabase) {
      toastMsg('Conectá Supabase primero')
      return
    }

    const {
      data: userData,
    } = await supabase.auth.getUser()

    const user = userData.user

    if (!user) {
      toastMsg('Iniciá sesión primero')
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

    const {
      error,
    } = await supabase.auth.signInWithPassword({
      email: auth.email,
      password: auth.password,
    })

    if (error) {
      setAuth(a => ({
        ...a,
        message: error.message,
      }))

      return
    }

    setAuth(a => ({
      ...a,
      message:
        'Sesión iniciada correctamente.',
    }))

    await loadSupabaseData()

    setTimeout(() => {
      setSheet(null)
    }, 500)
  }

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
              setDark(!dark)
            }
            aria-label="Cambiar tema"
          >
            {dark ? (
              <Sun size={19} />
            ) : (
              <Moon size={19} />
            )}
          </button>

          <button
            className="bell"
            onClick={() =>
              setSheet('menu')
            }
            aria-label="Menú"
          >
            <Menu size={20} />
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
              deleteTask={deleteTask}
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
                label="Tareas hechas"
                value={String(
                  store.completions.length
                )}
                icon="✓"
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
                      'Conectá Supabase primero'
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
                      'Iniciá sesión primero'
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
        <div className="celebrate">
          <Sparkles size={17} />
          {toast}
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

                <input
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

                <button
                  className="primary"
                  onClick={
                    addReminder
                  }
                >
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

            {sheet === 'menu' && (
              <>
                <span className="sheet-icon">
                  <Gamepad2 />
                </span>

                <h2>
                  Tu espacio
                </h2>

                <button
                  className="menu-row"
                  onClick={() =>
                    setDark(!dark)
                  }
                >
                  {dark ? (
                    <Sun />
                  ) : (
                    <Moon />
                  )}

                  <span>
                    <b>
                      Modo{' '}
                      {dark
                        ? 'claro'
                        : 'oscuro'}
                    </b>

                    <small>
                      Personalizá los
                      colores de
                      VidaQuest
                    </small>
                  </span>
                </button>

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

                <button
                  className="menu-row"
                  onClick={() =>
                    setSheet('auth')
                  }
                >
                  <LogIn />

                  <span>
                    <b>
                      Iniciar sesión
                    </b>

                    <small>
                      Sincronizá tus
                      datos entre
                      dispositivos
                    </small>
                  </span>
                </button>
              </>
            )}

            {sheet === 'auth' && (
              <>
                <span className="sheet-icon">
                  <LogIn />
                </span>

                <h2>
                  Iniciar sesión
                </h2>

                <p>
                  Conectá tu cuenta para
                  guardar tu progreso en la
                  nube.
                </p>

                <input
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

                <input
                  type="password"
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
                />

                <button
                  className="primary"
                  onClick={signIn}
                >
                  Entrar a mi cuenta
                </button>

                {auth.message && (
                  <p className="auth-msg">
                    {auth.message}
                  </p>
                )}
              </>
            )}
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
  deleteTask,
  weekly,
}: {
  tasks: Task[]
  done: (id: string) => boolean
  onToggle: (id: string) => void
  deleteTask?: (id: string) => void
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

            {deleteTask && (
              <button
                className="delete"
                aria-label={`Eliminar ${t.title}`}
                onClick={() =>
                  deleteTask(t.id)
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
                  {r.time}
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