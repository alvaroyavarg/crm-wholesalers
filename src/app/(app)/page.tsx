import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { GloboMes } from "@/components/dashboard/GloboMes";
import {
  TablaCartera,
  type FilaCartera,
} from "@/components/dashboard/TablaCartera";
import { etiquetaFY, etiquetaPeriodo, mesDePeriodo } from "@/lib/fiscal";
import {
  avancePct,
  estaCreciendo,
  formatEUs,
  formatPct,
  pctVsLY,
  senalesCliente,
} from "@/lib/metrics";
import { resumenCartera, serieCanal } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Filtro = "todas" | "oportunidad" | "creciendo";

const filtros: { valor: Filtro; etiqueta: string }[] = [
  { valor: "todas", etiqueta: "Todas" },
  { valor: "oportunidad", etiqueta: "Compra Inteligente" },
  { valor: "creciendo", etiqueta: "Creciendo" },
];

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const { filtro: filtroParam } = await searchParams;
  const filtro: Filtro =
    filtroParam === "oportunidad" || filtroParam === "creciendo"
      ? filtroParam
      : "todas";

  const [{ fy, periodo, clientes }, canal] = await Promise.all([
    resumenCartera(),
    serieCanal(),
  ]);

  const totalMes = clientes.reduce((acc, c) => acc + Number(c.mes_eus), 0);
  const totalYtd = clientes.reduce((acc, c) => acc + Number(c.ytd_eus), 0);
  const totalPlanYtd = clientes.reduce(
    (acc, c) => acc + Number(c.plan_ytd_eus),
    0,
  );
  const totalYtdLy = clientes.reduce((acc, c) => acc + Number(c.ytd_ly_eus), 0);
  const totalPlanMes = clientes.reduce(
    (acc, c) => acc + Number(c.plan_mes_eus),
    0,
  );
  const totalMesLy = clientes.reduce((acc, c) => acc + Number(c.mes_ly_eus), 0);

  // Metas a nivel CANAL COMPLETO: la cola larga "empata LY" por defecto,
  // así que su plan implícito es su real del año pasado.
  const canalMes = canal.serie.find((p) => p.periodo === periodo);
  const canalMesEus = Number(canalMes?.eus_actual ?? 0);
  const canalMesLy = Number(canalMes?.eus_ly ?? 0);
  const restoMesLy = canalMesLy - totalMesLy;
  const planCanalMes = totalPlanMes + restoMesLy;

  const conSenales = clientes.filter((c) => senalesCliente(c).length > 0);

  const visibles = clientes.filter((c) => {
    if (filtro === "oportunidad") return senalesCliente(c).length > 0;
    if (filtro === "creciendo") return estaCreciendo(c);
    return true;
  });

  const filasTabla: FilaCartera[] = visibles.map((c) => ({
    id: c.cliente_id,
    nombre: c.nombre_corto ?? c.nombre,
    nombreCompleto: c.nombre,
    segmento: c.segmento,
    ytd: Number(c.ytd_eus),
    vsLy: pctVsLY(Number(c.ytd_eus), Number(c.ytd_ly_eus)),
    mtd: Number(c.mes_eus),
    mesLy: Number(c.mes_ly_eus),
    avance: avancePct(Number(c.mes_eus), Number(c.plan_mes_eus)),
    senales: senalesCliente(c),
    ultimaVisita: c.ultima_visita,
  }));

  const cicloLabel = `${etiquetaPeriodo(periodo)} (${mesDePeriodo(periodo)}) · ${etiquetaFY(fy)}`;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-gray-900">
          Dashboard
        </h1>
        <p className="text-sm text-gray-500">
          Cartera de cuentas clave · {cicloLabel}
        </p>
      </header>

      <GloboMes
        fy={fy}
        periodo={periodo}
        mesEus={canalMesEus}
        planMesEus={planCanalMes}
        mesLyEus={canalMesLy}
      />

      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <KpiCard
          icono="📦"
          etiqueta={`Volumen ${etiquetaPeriodo(periodo)} · cartera`}
          valor={`${formatEUs(totalMes)} EUs`}
          detalle={`YTD ${etiquetaFY(fy)}: ${formatEUs(totalYtd)} EUs`}
        />
        <KpiCard
          icono="🎯"
          etiqueta="Avance YTD cartera vs plan"
          valor={
            totalPlanYtd > 0
              ? `${Math.round((totalYtd / totalPlanYtd) * 100)}%`
              : "—"
          }
          detalle={
            <>
              vs LY:{" "}
              <span
                className={
                  (pctVsLY(totalYtd, totalYtdLy) ?? 0) >= 0
                    ? "text-verde"
                    : "text-rojo"
                }
              >
                {formatPct(pctVsLY(totalYtd, totalYtdLy))}
              </span>
            </>
          }
        />
        <KpiCard
          icono="💡"
          etiqueta="Compra Inteligente"
          valor={`${conSenales.length} cuentas`}
          detalle="con oportunidad detectada"
        />
      </section>

      <Card className="overflow-visible p-0">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="font-display text-base font-semibold text-gray-900">
            Cartera ({visibles.length})
          </h2>
          <div className="flex gap-2">
            {filtros.map((f) => (
              <Link
                key={f.valor}
                href={f.valor === "todas" ? "/" : `/?filtro=${f.valor}`}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  filtro === f.valor
                    ? "bg-verde text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {f.etiqueta}
              </Link>
            ))}
          </div>
        </div>

        <TablaCartera filas={filasTabla} fy={fy} periodo={periodo} />
      </Card>
    </div>
  );
}
