import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente con service role: SOLO usar en el servidor (storage, tareas del agente).
// Nunca importar desde componentes cliente.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
