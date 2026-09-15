import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { ImportForm } from "./ImportForm";
import { ImportBottlerForm } from "./ImportBottlerForm";
import { MatrizCargas } from "@/components/datos/MatrizCargas";
import { fiscalActual } from "@/lib/fiscal";
import type { Importacion } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DatosPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>;
}) {
  const supabase = await createClient();
  const sp = await searchParams;
  const actual = fiscalActual();
  const fySel = Number(sp.fy) || actual.fy;

  const [ultimoPeriodo, totalClientes, activos, cargasRes, fysRes] = await Promise.all([
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
    supabase
      .from("importaciones")
      .select("*")
      .eq("anio_fiscal", fySel)
      .order("creado_at", { ascending: true }),
    supabase.from("importaciones").select("anio_fiscal"),
  ]);

  const cargas = (cargasRes.data ?? []) as Importacion[];
  const fys = Array.from(
    new Set([actual.fy, ...(fysRes.data ?? []).map((r) => Number(r.anio_fiscal))]),
  ).sort((a, b) => b - a);

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

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-4 font-display text-base font-semibold text-gray-900">
            Importar base de ventas
          </h2>
          <ImportForm />
        </Card>

        <Card className="lg:col-span-3">
          <h2 className="mb-1 font-display text-base font-semibold text-gray-900">
            Importar venta de los bottlers
          </h2>
          <p className="mb-4 text-xs text-gray-500">
            Los archivos que exporta Andina (KOA) y Embonor (KOE) directamente, sin pasar por la
            base consolidada de Diageo. Cada archivo trae toda la venta del canal — acá se filtra
            a la cartera gestionada (40 cuentas), el resto se agrupa en “Otros Andina” / “Otros
            Embonor”, y se convierte de UC a EUs (5,678/9, ÷10 extra para Smirnoff Ice).
          </p>
          <div className="max-w-md">
            <ImportBottlerForm />
          </div>
        </Card>

        <Card className="lg:col-span-3">
          <h2 className="mb-1 font-display text-base font-semibold text-gray-900">
            Qué hay cargado por mes
          </h2>
          <p className="mb-4 text-xs text-gray-500">
            Cada celda es una carga: la fecha de corte del archivo del bottler manda en Meta
            (facturado = venta real + pedidos facturados después del corte). La base Diageo
            trae meses cerrados. Un mes en amarillo está parcial: vuelve a cargarlo cuando
            tengas el archivo actualizado y el corte se mueve solo.
          </p>
          <MatrizCargas
            fy={fySel}
            periodoActual={fySel === actual.fy ? actual.periodo : null}
            cargas={cargas}
            fys={fys}
          />
        </Card>

        <Card className="h-fit lg:col-span-3">
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
