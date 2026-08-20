import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { KpiCard } from "@/components/ui/KpiCard";
import { TablaMtd } from "@/components/mtd/TablaMtd";
import { etiquetaFY, etiquetaPeriodo, inicioPeriodo, mesDePeriodo } from "@/lib/fiscal";
import { formatEUs, formatFecha, formatPct, pctVsLY, ritmoMes } from "@/lib/metrics";
import { mtdCompleto } from "@/lib/queries";

export const dynamic = "force-dynamic";

const NOMBRE_BOTTLER: Record<string, string> = {
  KOA: "Andina",
  KOE: "Embonor",
};

export default async function MtdPage() {
  const { fy, periodo, fechaCorte, clientes, categorias, bottlers, cargas } =
    await mtdCompleto();

  const totalMtd = clientes.reduce((a, c) => a + Number(c.mtd_eus), 0);
  const totalLy = clientes.reduce((a, c) => a + Number(c.mtd_ly_eus), 0);
  const totalMeta = clientes.reduce((a, c) => a + Number(c.plan_mes_eus), 0);

  const ritmo = ritmoMes(inicioPeriodo(fy, periodo), fechaCorte, totalMtd, totalMeta);
  const vsLy = pctVsLY(totalMtd, totalLy);
  const brecha = totalMeta - totalMtd;

  const sinMeta = clientes.filter((c) => Number(c.plan_mes_eus) <= 0).length;

  return (
    <div>
      {/* ---- Encabezado ---- */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-gray-900">
            Mes en curso
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {etiquetaPeriodo(periodo)} · {mesDePeriodo(periodo)} {etiquetaFY(fy)} ·
            cartera activa ({clientes.length} cuentas)
          </p>
        </div>
        <div className="text-right">
          {fechaCorte ? (
            <Chip variante="verde">Datos al {formatFecha(fechaCorte)}</Chip>
          ) : (
            <Chip variante="ambar" title="Sin importaciones registradas para este período">
              Sin fecha de corte · se asume hoy
            </Chip>
          )}
          <p className="mt-1 text-xs text-gray-400">
            día {ritmo.diasConDatos} de {ritmo.diasMes} ·{" "}
            {Math.round(ritmo.pctTranscurrido)}% del mes con datos
          </p>
        </div>
      </div>

      {/* ---- KPIs ---- */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icono="📦"
          etiqueta="Volumen MTD"
          valor={`${formatEUs(totalMtd)} EUs`}
          detalle={
            <span className={(vsLy ?? 0) >= 0 ? "text-verde" : "text-rojo"}>
              {formatPct(vsLy)} vs LY ({formatEUs(totalLy)})
            </span>
          }
        />
        <KpiCard
          icono="🎯"
          etiqueta="Avance de la meta"
          valor={ritmo.avancePct != null ? `${Math.round(ritmo.avancePct)}%` : "—"}
          detalle={`Meta ${formatEUs(totalMeta)} EUs`}
        />
        <KpiCard
          icono="📈"
          etiqueta="Proyección de cierre"
          valor={`${formatEUs(ritmo.proyeccion)} EUs`}
          detalle={
            <span
              className={
                (ritmo.proyeccionPct ?? 0) >= 100 ? "text-verde" : "text-rojo"
              }
            >
              {ritmo.proyeccionPct != null
                ? `${Math.round(ritmo.proyeccionPct)}% de la meta`
                : "Sin meta"}
            </span>
          }
        />
        <KpiCard
          icono={brecha > 0 ? "⚠️" : "✅"}
          etiqueta={brecha > 0 ? "Falta para la meta" : "Sobre la meta"}
          valor={`${formatEUs(Math.abs(brecha))} EUs`}
          detalle={
            ritmo.diasConDatos < ritmo.diasMes && brecha > 0
              ? `${formatEUs(brecha / Math.max(ritmo.diasMes - ritmo.diasConDatos, 1))} EUs/día restantes`
              : undefined
          }
        />
      </div>

      {/* ---- Barra de ritmo ---- */}
      <Card className="mb-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium text-gray-700">Ritmo vs meta</p>
          <Chip variante={ritmo.alRitmo ? "verde" : "ambar"}>
            {ritmo.alRitmo ? "Al ritmo o mejor" : "Bajo el ritmo"}
          </Chip>
        </div>
        <div className="relative mt-4 h-3 w-full rounded-full bg-gray-100">
          <div
            className={`h-full rounded-full ${ritmo.alRitmo ? "bg-verde" : "bg-ambar"}`}
            style={{ width: `${Math.min(ritmo.avancePct ?? 0, 100)}%` }}
          />
          <div
            className="absolute top-[-3px] h-[18px] w-[2px] rounded bg-gray-400"
            style={{ left: `${Math.min(ritmo.pctTranscurrido, 100)}%` }}
            title={`${Math.round(ritmo.pctTranscurrido)}% del mes con datos`}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-gray-400">
          La marca gris es el % del mes que cubre la data cargada
          {ritmo.corteEstimado && " (estimado con la fecha de hoy: registrá una importación para afinarlo)"}
        </p>
      </Card>

      {/* ---- Desgloses ---- */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="mb-3 text-sm font-medium text-gray-700">Por distribuidor</p>
          {bottlers.length === 0 ? (
            <p className="text-sm text-gray-400">Sin venta cargada este mes.</p>
          ) : (
            <ul className="space-y-3">
              {bottlers.map((b) => {
                const pct = totalMtd > 0 ? (Number(b.eus) / totalMtd) * 100 : 0;
                const delta = pctVsLY(Number(b.eus), Number(b.eus_ly));
                return (
                  <li key={b.bottler}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-medium text-gray-800">
                        {NOMBRE_BOTTLER[b.bottler] ?? b.bottler}
                        <span className="ml-2 text-xs font-normal text-gray-400">
                          {b.clientes} cuentas
                        </span>
                      </span>
                      <span className="text-gray-600">
                        {formatEUs(Number(b.eus))} EUs
                        <span
                          className={`ml-2 text-xs font-medium ${
                            (delta ?? 0) >= 0 ? "text-verde" : "text-rojo"
                          }`}
                        >
                          {formatPct(delta)}
                        </span>
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-verde"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <p className="mb-3 text-sm font-medium text-gray-700">Por categoría</p>
          {categorias.length === 0 ? (
            <p className="text-sm text-gray-400">Sin venta cargada este mes.</p>
          ) : (
            <ul className="space-y-2">
              {categorias.map((c) => {
                const delta = pctVsLY(Number(c.eus), Number(c.eus_ly));
                const pct = totalMtd > 0 ? (Number(c.eus) / totalMtd) * 100 : 0;
                return (
                  <li
                    key={c.categoria}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0 truncate text-gray-800">
                      {c.categoria}
                      <span className="ml-2 text-xs text-gray-400">
                        {Math.round(pct)}%
                      </span>
                    </span>
                    <span className="shrink-0 text-gray-600">
                      {formatEUs(Number(c.eus))}
                      <span
                        className={`ml-2 text-xs font-medium ${
                          (delta ?? 0) >= 0 ? "text-verde" : "text-rojo"
                        }`}
                      >
                        {formatPct(delta)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* ---- Cartera ---- */}
      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
          <p className="text-sm font-medium text-gray-700">
            Avance por cuenta
            <span className="ml-2 text-xs font-normal text-gray-400">
              clic en la meta para editarla
            </span>
          </p>
          {sinMeta > 0 && (
            <Chip variante="ambar">
              {sinMeta} {sinMeta === 1 ? "cuenta sin meta" : "cuentas sin meta"}
            </Chip>
          )}
        </div>
        <div className="mt-3">
          <TablaMtd
            filas={clientes}
            fy={fy}
            periodo={periodo}
            pctTranscurrido={ritmo.pctTranscurrido}
          />
        </div>
      </Card>

      {/* ---- Cargas del período ---- */}
      <Card className="mt-6">
        <p className="mb-3 text-sm font-medium text-gray-700">
          Cargas de este período
        </p>
        {cargas.length === 0 ? (
          <p className="text-sm text-gray-400">
            Todavía no se registró ninguna importación para{" "}
            {mesDePeriodo(periodo)} {etiquetaFY(fy)}.
          </p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {cargas.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-3">
                <span className="text-gray-700">
                  {NOMBRE_BOTTLER[c.origen] ?? c.origen}
                  <span className="ml-2 text-xs text-gray-400">
                    corte {formatFecha(c.fecha_corte)}
                  </span>
                </span>
                <span className="text-xs text-gray-500">
                  {formatEUs(Number(c.eus))} EUs · {c.filas} filas
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
