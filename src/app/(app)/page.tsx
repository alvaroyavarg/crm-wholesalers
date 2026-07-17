import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { KpiCard } from "@/components/ui/KpiCard";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { etiquetaFY, etiquetaPeriodo, mesDePeriodo } from "@/lib/fiscal";
import {
  avancePct,
  estaCreciendo,
  formatEUs,
  formatFecha,
  formatPct,
  pctVsLY,
  senalesCliente,
} from "@/lib/metrics";
import { resumenCartera } from "@/lib/queries";

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

  const { fy, periodo, clientes } = await resumenCartera();

  const totalMes = clientes.reduce((acc, c) => acc + Number(c.mes_eus), 0);
  const totalYtd = clientes.reduce((acc, c) => acc + Number(c.ytd_eus), 0);
  const totalPlanYtd = clientes.reduce(
    (acc, c) => acc + Number(c.plan_ytd_eus),
    0,
  );
  const totalYtdLy = clientes.reduce((acc, c) => acc + Number(c.ytd_ly_eus), 0);

  const conSenales = clientes.filter((c) => senalesCliente(c).length > 0);

  const visibles = clientes.filter((c) => {
    if (filtro === "oportunidad") return senalesCliente(c).length > 0;
    if (filtro === "creciendo") return estaCreciendo(c);
    return true;
  });

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

      <section className="mb-6 grid grid-cols-3 gap-4">
        <KpiCard
          icono="📦"
          etiqueta={`Volumen ${etiquetaPeriodo(periodo)}`}
          valor={`${formatEUs(totalMes)} EUs`}
          detalle={`YTD ${etiquetaFY(fy)}: ${formatEUs(totalYtd)} EUs`}
        />
        <KpiCard
          icono="🎯"
          etiqueta="Avance YTD vs plan"
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

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="px-5 py-3 font-medium">Cliente</th>
              <th className="px-3 py-3 font-medium">YTD {etiquetaFY(fy)}</th>
              <th className="px-3 py-3 font-medium">vs LY</th>
              <th className="px-3 py-3 font-medium">
                Avance {etiquetaPeriodo(periodo)}
              </th>
              <th className="px-3 py-3 font-medium">Oportunidades</th>
              <th className="px-5 py-3 font-medium">Última visita</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((c) => {
              const vsLy = pctVsLY(Number(c.ytd_eus), Number(c.ytd_ly_eus));
              const senales = senalesCliente(c);
              return (
                <tr
                  key={c.cliente_id}
                  className="border-b border-gray-50 transition hover:bg-gray-50/60"
                >
                  <td className="px-5 py-3">
                    <Link
                      href={`/clientes/${c.cliente_id}`}
                      className="font-medium text-gray-900 hover:text-verde"
                    >
                      {c.nombre}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-2">
                      <Chip variante={c.segmento === "TOP3" ? "verde" : "azul"}>
                        {c.segmento}
                      </Chip>
                      {c.comuna && (
                        <span className="text-xs text-gray-400">{c.comuna}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 font-medium text-gray-900">
                    {formatEUs(Number(c.ytd_eus))}
                  </td>
                  <td className="px-3 py-3">
                    <Chip
                      variante={
                        vsLy == null ? "gris" : vsLy >= 0 ? "verde" : "rojo"
                      }
                    >
                      {formatPct(vsLy)}
                    </Chip>
                  </td>
                  <td className="px-3 py-3">
                    <BarraAvance
                      pct={avancePct(Number(c.mes_eus), Number(c.plan_mes_eus))}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {senales.length === 0 ? (
                        <span className="text-xs text-gray-300">—</span>
                      ) : (
                        senales.map((s) => (
                          <Chip key={s.tipo} variante="ambar" title={s.detalle}>
                            {s.etiqueta}
                          </Chip>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500">
                    {formatFecha(c.ultima_visita)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
