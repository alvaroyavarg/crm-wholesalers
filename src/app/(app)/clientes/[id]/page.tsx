import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { ContactosClaves } from "@/components/cliente/ContactosClaves";
import { DetalleCompras } from "@/components/cliente/DetalleCompras";
import { MixCategorias } from "@/components/cliente/MixCategorias";
import { RecomendacionesCliente } from "@/components/cliente/RecomendacionesCliente";
import { etiquetaFY, etiquetaPeriodo, mesDePeriodo } from "@/lib/fiscal";
import {
  formatCLP,
  formatEUs,
  formatFecha,
  formatPct,
  pctVsLY,
  senalesCliente,
} from "@/lib/metrics";
import { fichaCliente } from "@/lib/queries";
import type { TipoNota } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // generar recomendaciones corre el loop del agente

const iconoNota: Record<TipoNota, string> = {
  visita: "🚗",
  llamada: "📞",
  acuerdo: "🤝",
  rechazo: "🚫",
  nota: "📝",
  compromiso: "📌",
  idea: "💡",
};

export default async function FichaClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fy?: string }>;
}) {
  const { id } = await params;
  const { fy: fyParam } = await searchParams;

  let data;
  try {
    data = await fichaCliente(id, fyParam ? Number(fyParam) : undefined);
  } catch {
    notFound();
  }

  const {
    fy,
    periodo,
    cliente,
    perfil,
    notas,
    mix,
    serie,
    resumen,
    contactos,
    fys,
    fyDetalle,
    detalle,
    mixSkus,
    recomendaciones,
  } = data;
  const vsLy = resumen
    ? pctVsLY(Number(resumen.ytd_eus), Number(resumen.ytd_ly_eus))
    : null;
  const senales = resumen ? senalesCliente(resumen) : [];

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/" className="mb-4 inline-block text-sm text-gray-400 hover:text-verde">
        ← Volver al dashboard
      </Link>

      {/* Header */}
      <Card className="mb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-2xl font-semibold text-gray-900">
                {cliente.nombre_corto ?? cliente.nombre}
              </h1>
              <Chip variante={cliente.segmento === "TOP3" ? "verde" : "azul"}>
                {cliente.segmento}
              </Chip>
              {cliente.bottler && <Chip variante="gris">{cliente.bottler}</Chip>}
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {cliente.nombre_corto && <>{cliente.nombre} · </>}
              {cliente.rut && <>RUT {cliente.rut} · </>}
              {(cliente.comuna ?? cliente.region) && (
                <>{cliente.comuna ?? cliente.region} · </>
              )}
              {cliente.cliente_desde && (
                <>Cliente desde {new Date(cliente.cliente_desde).getFullYear()}</>
              )}
            </p>

            {/* Tags: verde = dato duro, azul = aprendido por el agente, ámbar = alerta/oportunidad */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {perfil?.frecuencia_compra && (
                <Chip variante="verde">Compra {perfil.frecuencia_compra.toLowerCase()}</Chip>
              )}
              {perfil?.decisor && <Chip variante="azul">Decisor: {perfil.decisor}</Chip>}
              {perfil?.estilo_negociacion && (
                <Chip variante="azul">{perfil.estilo_negociacion}</Chip>
              )}
              {perfil?.marcas_afines.map((m) => (
                <Chip key={m} variante="azul">
                  Afín a {m}
                </Chip>
              ))}
              {senales.map((s) => (
                <Chip key={s.tipo} variante="ambar" title={s.detalle}>
                  {s.etiqueta}
                </Chip>
              ))}
            </div>
          </div>

          {resumen && (
            <div className="flex shrink-0 gap-6 md:text-right">
              <div>
                <p className="text-xs text-gray-400">YTD {etiquetaFY(fy)}</p>
                <p className="font-display text-xl font-semibold text-gray-900">
                  {formatEUs(Number(resumen.ytd_eus))} EUs
                </p>
                <p className={`text-xs ${vsLy != null && vsLy < 0 ? "text-rojo" : "text-verde"}`}>
                  {formatPct(vsLy)} vs LY
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Inventario</p>
                <p className="font-display text-xl font-semibold text-gray-900">
                  {cliente.dias_inventario != null
                    ? `${Math.round(Number(cliente.dias_inventario))} días`
                    : "—"}
                </p>
                <p className="text-xs text-gray-400">
                  Crédito:{" "}
                  {cliente.credito_disponible != null
                    ? formatCLP(Number(cliente.credito_disponible))
                    : "—"}
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Columna 1-2 */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <h2 className="mb-4 font-display text-base font-semibold text-gray-900">
              Mix por categoría vs pares
            </h2>
            <MixCategorias
              mix={mix}
              skus={mixSkus}
              segmento={cliente.segmento}
            />
          </Card>

          <Card>
            <h2 className="mb-4 font-display text-base font-semibold text-gray-900">
              {etiquetaFY(fy)} vs {etiquetaFY(fy - 1)} mes a mes
            </h2>
            <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr className="text-left text-gray-400">
                  <th className="py-1.5 pr-2 font-medium">FY</th>
                  {serie.map((s) => (
                    <th
                      key={s.periodo}
                      className={`px-1.5 py-1.5 text-right font-medium ${
                        s.periodo === periodo ? "text-verde" : ""
                      }`}
                    >
                      {etiquetaPeriodo(s.periodo)}
                      <span className="block text-[10px] font-normal">
                        {mesDePeriodo(s.periodo)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-50">
                  <td className="py-2 pr-2 font-medium text-gray-500">
                    {etiquetaFY(fy - 1)}
                  </td>
                  {serie.map((s) => (
                    <td key={s.periodo} className="px-1.5 py-2 text-right text-gray-500">
                      {formatEUs(Number(s.eus_ly))}
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-gray-50">
                  <td className="py-2 pr-2 font-medium text-gray-900">
                    {etiquetaFY(fy)}
                  </td>
                  {serie.map((s) => (
                    <td
                      key={s.periodo}
                      className={`px-1.5 py-2 text-right font-medium ${
                        s.periodo > periodo
                          ? "text-gray-300"
                          : Number(s.eus_actual) >= Number(s.eus_ly)
                            ? "text-verde"
                            : "text-rojo"
                      }`}
                    >
                      {s.periodo > periodo ? "·" : formatEUs(Number(s.eus_actual))}
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-gray-100">
                  <td className="py-2 pr-2 font-medium text-gray-400">Δ %</td>
                  {serie.map((s) => {
                    if (s.periodo > periodo) {
                      return (
                        <td
                          key={s.periodo}
                          className="px-1.5 py-2 text-right text-gray-300"
                        >
                          ·
                        </td>
                      );
                    }
                    const delta = pctVsLY(
                      Number(s.eus_actual),
                      Number(s.eus_ly),
                    );
                    return (
                      <td
                        key={s.periodo}
                        className={`px-1.5 py-2 text-right font-semibold ${
                          delta == null
                            ? "text-gray-300"
                            : delta >= 0
                              ? "text-verde"
                              : "text-rojo"
                        }`}
                      >
                        {formatPct(delta, 0)}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
            </div>
            <p className="mt-2 text-[11px] text-gray-400">
              Δ %: crecimiento (verde) o caída (rojo) de {etiquetaFY(fy)} vs el
              mismo mes de {etiquetaFY(fy - 1)}
            </p>
          </Card>

          <Card>
            <h2 className="mb-4 font-display text-base font-semibold text-gray-900">
              Detalle de compras {etiquetaFY(fyDetalle)}
            </h2>
            <DetalleCompras
              clienteId={cliente.id}
              fy={fyDetalle}
              fys={fys}
              periodoActual={periodo}
              fyActual={fy}
              items={detalle}
            />
          </Card>

          <Card>
            <h2 className="mb-4 font-display text-base font-semibold text-gray-900">
              Recomendaciones del copiloto
            </h2>
            <RecomendacionesCliente
              clienteId={cliente.id}
              nombre={cliente.nombre_corto ?? cliente.nombre}
              recomendaciones={recomendaciones}
            />
          </Card>
        </div>

        {/* Columna 3: contactos y memoria */}
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 font-display text-base font-semibold text-gray-900">
              Contactos claves
            </h2>
            <ContactosClaves clienteId={cliente.id} contactos={contactos} />
          </Card>

          {perfil?.resumen && (
            <Card>
              <h2 className="mb-2 font-display text-base font-semibold text-gray-900">
                Perfil del comprador
              </h2>
              <p className="text-sm leading-relaxed text-gray-600">{perfil.resumen}</p>
            </Card>
          )}

          <Card>
            <h2 className="mb-4 font-display text-base font-semibold text-gray-900">
              Últimas notas
            </h2>
            {notas.length === 0 ? (
              <p className="text-sm text-gray-400">Sin notas todavía.</p>
            ) : (
              <ol className="space-y-4">
                {notas.map((n) => (
                  <li key={n.id} className="flex gap-3">
                    <span className="mt-0.5">{iconoNota[n.tipo]}</span>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-400">
                        {formatFecha(n.fecha)} ·{" "}
                        <span className="capitalize">{n.tipo}</span>
                        {n.creado_por_agente && " · agente"}
                      </p>
                      <p className="mt-0.5 text-sm leading-snug text-gray-700">
                        {n.contenido_raw}
                      </p>
                      {n.contenido_estructurado && (
                        <div className="mt-1.5 space-y-1">
                          {(n.contenido_estructurado.acuerdos ?? []).map(
                            (a, i) => (
                              <p key={`a${i}`} className="text-xs text-verde">
                                🤝 {a}
                              </p>
                            ),
                          )}
                          {(n.contenido_estructurado.rechazos ?? []).map(
                            (r, i) => (
                              <p key={`r${i}`} className="text-xs text-rojo">
                                🚫 {r}
                              </p>
                            ),
                          )}
                          {(n.contenido_estructurado.proximos_pasos ?? []).map(
                            (p, i) => (
                              <p key={`p${i}`} className="text-xs text-azul">
                                → {p}
                              </p>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
