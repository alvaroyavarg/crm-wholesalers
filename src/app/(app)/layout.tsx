import { Sidebar } from "@/components/nav/Sidebar";
import { NotaRapida } from "@/components/notas/NotaRapida";
import { createClient } from "@/lib/supabase/server";

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
      {/* El shell (sidebar + main) es cliente: el estado plegado/desplegado
          del menú tiene que mover también el margen del contenido. */}
      <Sidebar>{children}</Sidebar>

      <NotaRapida clientes={opciones} />
    </div>
  );
}
