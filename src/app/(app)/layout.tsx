import { NavLinks } from "@/components/nav/NavLinks";
import { Sidebar } from "@/components/nav/Sidebar";
import { NotaRapida } from "@/components/notas/NotaRapida";
import { createClient } from "@/lib/supabase/server";
import { cerrarSesion } from "./actions";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const { data: clientesActivos } = await supabase
    .from("clientes")
    .select("id, nombre, nombre_corto")
    .eq("activo", true)
    .order("nombre");

  const opciones = (clientesActivos ?? []).map((c) => ({
    id: c.id as string,
    nombre: (c.nombre_corto ?? c.nombre) as string,
  }));

  return (
    <div className="min-h-screen">
      <Sidebar>
        <div className="mb-6 flex items-center gap-3 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-verde font-display text-sm font-bold text-white">
            CM
          </div>
          <div>
            <p className="font-display text-sm font-semibold leading-tight text-gray-900">
              CRM Mayoristas
            </p>
            <p className="text-[11px] text-gray-400">Canal mayorista · KAM</p>
          </div>
        </div>

        <NavLinks />

        <form action={cerrarSesion} className="mt-auto">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-500 transition hover:bg-gray-50"
          >
            <span>↩︎</span> Cerrar sesión
          </button>
        </form>
      </Sidebar>

      <main className="px-4 pb-24 pt-20 lg:ml-60 lg:px-8 lg:pb-8 lg:pt-8">
        {children}
      </main>

      <NotaRapida clientes={opciones} />
    </div>
  );
}
