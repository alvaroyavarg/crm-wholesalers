import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { ImportForm } from "./ImportForm";

export const dynamic = "force-dynamic";

export default async function DatosPage() {
  const supabase = await createClient();

  const [ultimoPeriodo, totalClientes, activos] = await Promise.all([
    supabase
      .from("ventas")
      .select("periodo")
      .order("periodo", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("clientes").select("id", { count: "exact", head: true }),
    supabase
      .from("clientes")
      .select("id", { count: "exact", head: true })
      .eq("activo", true),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-gray-900">
          Datos
        </h1>
        <p className="text-sm text-gray-500">
          Importación de la base de ventas del canal. Sube el mismo Excel
          actualizado mes a mes: los períodos que trae el archivo se reemplazan
          completos (sin duplicar).
        </p>
      </header>

      <div className="grid grid-cols-3 gap-6">
        <Card className="col-span-2">
          <h2 className="mb-4 font-display text-base font-semibold text-gray-900">
            Importar base de ventas
          </h2>
          <ImportForm />
        </Card>

        <Card className="h-fit">
          <h2 className="mb-3 font-display text-base font-semibold text-gray-900">
            Estado de la data
          </h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Último período cargado</dt>
              <dd className="font-medium text-gray-900">
                {ultimoPeriodo.data?.periodo ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Clientes del canal</dt>
              <dd className="font-medium text-gray-900">
                {totalClientes.count ?? 0}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Cuentas clave activas</dt>
              <dd className="font-medium text-gray-900">{activos.count ?? 0}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-gray-400">
            El matching de clientes usa el código de cliente de la base. Las
            cuentas nuevas que no son de la cartera quedan como cola larga
            (cuentan para las métricas del canal, no se gestionan aquí).
          </p>
        </Card>
      </div>
    </div>
  );
}
