# VidaQuest

Dashboard de vida gamificada: misiones diarias, XP, rachas, estadísticas, bitácora y recordatorios. Funciona en modo local para la demostración y está preparado para Supabase.

## Ejecutar

`npm run dev`

## Activar cuentas y base de datos

1. Creá un proyecto en Supabase y habilitá Email/Password en Authentication.
2. Ejecutá `supabase/schema.sql` en su SQL Editor.
3. Copiá `.env.example` como `.env.local` y completá las dos variables.

El esquema aplica Row Level Security: cada persona puede acceder únicamente a sus hábitos, registros, notas y recordatorios.
