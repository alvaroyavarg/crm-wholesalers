import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { TablaMes, type FilaMes } from "@/components/dashboard/TablaMes";
import { etiquetaFY, etiquetaMesCalendario, etiquetaPeriodo, inicioPeriodo } from "@/lib/fiscal";
import { facturadoMes, formatEUs, formatFecha, ritmoMes } from "@/lib/metrics";
import { dashboardMes } from "@/lib/queries";

export const dynamic = "force-dynamic";

// Portada: el mes actual con la misma verdad que /meta. Meta = Σ metas por
// SKU; facturado = venta real si el bottler cargó el mes, si no pedidos
// facturados; ritmo calculado contra la fecha de corte de la data, no hoy.
export default async function Dashboard() {
  const d = await dashboardMes();
  const { fy, periodo, clientes, cortes, ytd, compromisos, propuestasPendientes } = d;
  const etiquetaMes = etiquetaMesCalendario(fy, periodo);

  const facturadoDe = (c: (typeof clientes)[number]) => facturadoMes(c);

  // Totales de la cartera (incluye Otros: son parte de la meta del canal)
  const tot = clientes.reduce(
    (a, c) => ({
      meta: a.meta + Number(c.meta_eus),
      comprometido: a.comprometido + Number(c.ped_comprometido),
      ingresado: a.ingresado + Number(c.ped_ingresado),
      facturado: a.facturado + facturadoDe(c),
    }),
    { meta: 0, comprometido: 0, ingresado: 0, facturado: 0 },
  );
  const brecha = tot.meta - tot.facturado;
  const cuentas = clientes.filter((c) => !c.es_otros);
  const sinMeta = cuentas.filter((c) => Number(c.meta_eus) <= 0).length;

  // Ritmo: corte = el menor de los bottlers que cargaron; si ninguno cargó, no hay ritmo
  const cargados = cortes.filter((c) => c.fecha_corte);
  const corte = cargados.length ? cargados.map((c) => c.fecha_corte as string).sort()[0] : null;
  const ritmo = corte ? ritmoMes(inicioPeriodo(fy, periodo), corte, tot.facturado, tot.meta) : null;

  const ytdTot = clientes.reduce(
    (a, c) => {
      const v = ytd.get(c.cliente_id);
      return v ? { ytd: a.ytd + v.ytd, ly: a.ly + v.ytdLy } : a;
    },
    { ytd: 0, ly: 0 },
  );
  const hayYtd = ytd.size > 0;
  const vsLy = ytdTot.ly > 0 ? ((ytdTot.ytd - ytdTot.ly) / ytdTot.ly) * 100 : null;

  const compPorCliente = new Map<string, number>();
  for (const c of compromisos) compPorCliente.set(c.cliente_id, (compPorCliente.get(c.cliente_id) ?? 0) + 1);
  const vencidos = compromisos.filter((c) => c.vencido).length;
  const propuestasTotal = [...propuestasPendientes.values()].reduce((a, b) => a + b, 0);

  const filas: FilaMes[] = clientes.map((c) => {
    const meta = Number(c.meta_eus);
    const fac = facturadoDe(c);
    const y = ytd.get(c.cliente_id);
    return {
      id: c.cliente_id,
      nombre: c.nombre_corto ?? c.nombre,
      esOtros: c.es_otros,
      bottler: c.bottler,
      meta,
      comprometido: Number(c.ped_comprometido),
      ingresado: Number(c.ped_ingresado),
      facturado: fac,
      ventaCargada: c.venta_cargada,
      brecha: meta - fac,
      ytd: y?.ytd ?? null,
      ytdLy: y?.ytdLy ?? null,
      compromisos: compPorCliente.get(c.cliente_id) ?? 0,
      propuestas: propuestasPendientes.get(c.cliente_id) ?? 0,
      alRitmo: meta > 0 && ritmo && c.venta_cargada ? (fac / meta) * 100 >= ritmo.pctTranscurrido : null,
    };
  });

  const kpi = (etiqueta: string, valor: string, detalle?: string, tono: "verde" | "ambar" | "azul" | "gris" = "gris") => (
    <div className="rounded-(--radius-card) bg-white p-4 shadow-card sm:p-5">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${{ verde: "bg-verde", ambar: "bg-ambar", azul: "bg-azul", gris: "bg-gray-300" }[tono]}`} />
        <p className="truncate text-xs text-gray-500 sm:text-sm">{etiqueta}</p>
      </div>
      <p className={`mt-1 font-display text-2xl font-semibold sm:text-3xl ${tono === "ambar" ? "text-ambar" : "text-gray-900"}`}>{valor}</p>
      {detalle && <p className="mt-0.5 text-[11px] text-gray-400">{detalle}</p>}
    </div>
  );
  const pct = (v: number) => (tot.meta > 0 ? `${Math.round((v / tot.meta) * 100)}% de la meta` : "");

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-gray-900">Dashboard · {etiquetaMes}</h1>
          <p className="text-sm text-gray-500">
            {etiquetaPeriodo(periodo)} {etiquetaFY(fy)} · {cuentas.length} cuentas + Otros por bottler
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {cortes.map((c) => (
            <Chip key={c.origen} variante={c.fecha_corte ? "verde" : "gris"}>
              {c.origen === "KOA" ? "Andina" : "Embonor"}: {c.fecha_corte ? `datos al ${formatFecha(c.fecha_corte)}` : "sin carga este mes"}
            </Chip>
          ))}
          <Link href="/meta" className="rounded-lg bg-verde px-3 py-1.5 font-medium text-white hover:opacity-90">
            Trabajar la meta →
          </Link>
        </div>
      </header>

      {/* ---- Avance del mes ---- */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        {kpi(`Meta ${etiquetaMes}`, tot.meta > 0 ? formatEUs(tot.meta) : "—", sinMeta > 0 ? `${sinMeta} cuentas sin meta` : "todas con meta", "verde")}
        {kpi("Facturado", formatEUs(tot.facturado), cargados.length ? `${pct(tot.facturado)} · venta real en ${cargados.length === 2 ? "ambos bottlers" : cargados[0].origen === "KOA" ? "Andina" : "Embonor"}` : `${pct(tot.facturado)} · según pedidos`, "verde")}
        {kpi("Ingresado", formatEUs(tot.ingresado), pct(tot.ingresado), "azul")}
        {kpi("Comprometido", formatEUs(tot.comprometido), pct(tot.comprometido), "gris")}
        {kpi("Brecha (Meta − Fact.)", tot.meta > 0 ? formatEUs(brecha) : "—", brecha <= 0 && tot.meta > 0 ? "meta cubierta" : `${formatEUs(Math.max(0, brecha - tot.ingresado - tot.comprometido))} sin pedido aún`, brecha <= 0 && tot.meta > 0 ? "verde" : "ambar")}
      </div>

      {/* ---- Ritmo ---- */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-sm font-medium text-gray-700">
            Ritmo del mes
            {hayYtd && vsLy != null && (
              <span className="ml-3 text-xs font-normal text-gray-500">
                YTD {etiquetaFY(fy)}: {formatEUs(ytdTot.ytd)} EUs ·{" "}
                <span className={vsLy >= 0 ? "text-verde" : "text-rojo"}>{vsLy >= 0 ? "+" : ""}{Math.round(vsLy)}% vs LY</span>
              </span>
            )}
          </p>
          {ritmo ? (
            <Chip variante={ritmo.alRitmo ? "verde" : "ambar"}>
              {ritmo.alRitmo ? "Al ritmo o mejor" : "Bajo el ritmo"} · día {ritmo.diasConDatos} de {ritmo.diasMes}
            </Chip>
          ) : (
            <Chip variante="gris">Sin carga de bottler este mes: el avance es solo pedidos</Chip>
          )}
        </div>
        {ritmo && (
          <>
            <div className="relative mt-4 h-3 w-full rounded-full bg-gray-100">
              <div className={`h-full rounded-full ${ritmo.alRitmo ? "bg-verde" : "bg-ambar"}`} style={{ width: `${Math.min(ritmo.avancePct ?? 0, 100)}%` }} />
              <div className="absolute top-[-3px] h-[18px] w-[2px] rounded bg-gray-400" style={{ left: `${Math.min(ritmo.pctTranscurrido, 100)}%` }} title={`${Math.round(ritmo.pctTranscurrido)}% del mes con datos`} />
            </div>
            <p className="mt-1.5 text-[11px] text-gray-400">
              {Math.round(ritmo.avancePct ?? 0)}% de la meta facturado con {Math.round(ritmo.pctTranscurrido)}% del mes con datos · proyección de cierre{" "}
              <b className="text-gray-600">{formatEUs(ritmo.proyeccion)} EUs</b>
              {ritmo.proyeccionPct != null && ` (${Math.round(ritmo.proyeccionPct)}% de la meta)`}
              {cargados.length === 1 && " · solo un bottler cargó: el ritmo del otro no se puede medir todavía"}
            </p>
          </>
        )}
      </Card>

      {/* ---- Agenda ---- */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">Compromisos pendientes</p>
            {vencidos > 0 ? <Chip variante="rojo">{vencidos} vencidos</Chip> : <Chip variante="gris">{compromisos.length}</Chip>}
          </div>
          {compromisos.length === 0 ? (
            <p className="text-xs text-gray-400">Nada pendiente. Los compromisos se anotan en la bitácora del cliente, en Meta.</p>
          ) : (
            <ul className="space-y-2">
              {compromisos.slice(0, 8).map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-xs">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${c.vencido ? "bg-rojo" : "bg-ambar"}`} />
                  <div className="min-w-0">
                    <Link href={`/meta?cliente=${c.cliente_id}`} className="font-medium text-gray-900 hover:text-verde">{c.cliente}</Link>
                    <span className="text-gray-600"> · {c.contenido}</span>
                    <span className="ml-1 text-[10px] text-gray-400">{c.vence ? `vence ${formatFecha(c.vence)}` : `anotado ${formatFecha(c.fecha.slice(0, 10))}`}</span>
                  </div>
                </li>
              ))}
              {compromisos.length > 8 && <li className="text-[11px] text-gray-400">y {compromisos.length - 8} más…</li>}
            </ul>
          )}
        </Card>
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">Propuestas del copiloto sin resolver</p>
            <Chip variante={propuestasTotal > 0 ? "azul" : "gris"}>{propuestasTotal}</Chip>
          </div>
          {propuestasTotal === 0 ? (
            <p className="text-xs text-gray-400">Sin propuestas pendientes para {etiquetaMes}. Pídelas desde el panel del cliente en Meta.</p>
          ) : (
            <ul className="space-y-1.5">
              {[...propuestasPendientes.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([id, n]) => {
                  const c = clientes.find((x) => x.cliente_id === id);
                  return (
                    <li key={id} className="flex items-center justify-between text-xs">
                      <Link href={`/meta?cliente=${id}`} className="font-medium text-gray-900 hover:text-verde">{c?.nombre_corto ?? c?.nombre ?? "?"}</Link>
                      <span className="text-gray-500">{n} SKU por revisar</span>
                    </li>
                  );
                })}
            </ul>
          )}
        </Card>
      </div>

      {/* ---- Cuentas ---- */}
      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
          <p className="text-sm font-medium text-gray-700">
            Cuentas · avance vs meta
            <span className="ml-2 text-xs font-normal text-gray-400">toca el nombre para abrir su panel en Meta</span>
          </p>
          <p className="text-[11px] text-gray-400">● = venta real del bottler · Brecha = Meta − Facturado</p>
        </div>
        <div className="mt-3">
          <TablaMes filas={filas} hayYtd={hayYtd} />
        </div>
      </Card>
    </div>
  );
}
