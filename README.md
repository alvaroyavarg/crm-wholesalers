# CRM Mayoristas + Copiloto KAM

CRM personal de cuentas clave del canal mayorista (Diageo Chile) con copiloto de IA.
Stack: Next.js (App Router) + TypeScript + Supabase + Tailwind + API de Anthropic.

Calendario fiscal: **FY de julio a junio** — P1 = julio … P12 = junio (FY27 = jul 2026 – jun 2027).

## Setup

1. **Crear proyecto en [Supabase](https://supabase.com)** (región South America si está disponible).
2. **Ejecutar migraciones** en el SQL Editor de Supabase, en orden:
   - `supabase/migrations/0001_schema.sql`
   - `supabase/migrations/0002_funciones.sql`
3. **Crear usuarios** en Authentication → Users → *Add user* (email + password, 2–3 usuarios).
   En Authentication → Sign In / Up, desactivar *Allow new users to sign up*.
4. **Variables de entorno**: copiar `.env.local.example` a `.env.local` y completar con
   los valores de Project Settings → API.
5. **Instalar y poblar data de prueba**:

   ```bash
   npm install
   npm run seed     # 25 clientes, 5 años fiscales de ventas, plan FY27 = real FY26
   npm run dev      # http://localhost:3000
   ```

## Estructura

- `supabase/migrations/` — schema + funciones SQL de agregación (los cálculos viven en SQL/TS, no en el modelo)
- `src/lib/fiscal.ts` — calendario fiscal (FY, P, Q, H)
- `src/lib/metrics.ts` — vs LY, avance vs plan, señales de "Compra Inteligente"
- `src/app/(app)/` — Dashboard, Ficha de cliente, Plan de venta
- `scripts/seed.ts` — data ficticia de desarrollo (se reemplaza con el importador real en Fase 2)

## Fases

1. ✅ Setup + schema + Dashboard + Ficha + Plan de venta
2. Importador de ventas (Excel/CSV) + notas + conocimiento + boletines (resumen vía Haiku)
3. Agente con tool use, perfil auto-mantenido, recomendaciones con evidencia, chat
4. Prompt caching, consolidación de memoria, pulido desktop
5. (Futura) Versión móvil / de terreno
