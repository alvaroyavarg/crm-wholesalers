"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Chip } from "@/components/ui/Chip";
import { analizarBoletin, eliminarBoletin } from "@/app/(app)/actions";
import type { Boletin, PromocionBoletin } from "@/lib/types";

function formatFechaCorta(iso: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${iso}T12:00:00`));
}

// Render mínimo del markdown del resumen: viñetas y párrafos.
function Resumen({ texto }: { texto: string }) {
  const lineas = texto.split("\n").filter((l) => l.trim());
  return (
    <div className="mt-2 space-y-1 text-sm text-gray-600">
      {lineas.map((l, i) => {
        const bullet = l.trim().replace(/^[-*•]\s*/, "");
        const esBullet = /^[-*•]/.test(l.trim());
        return esBullet ? (
          <div key={i} className="flex gap-2">
            <span className="text-verde">•</span>
            <span>{bullet}</span>
          </div>
        ) : (
          <p key={i}>{bullet}</p>
        );
      })}
    </div>
  );
}

export function BoletinItem({
  boletin,
  urlFirmada,
  vigente,
}: {
  boletin: Boletin;
  urlFirmada: string | null;
  vigente: boolean;
}) {
  const router = useRouter();
  const [analizando, startAnalisis] = useTransition();
  const [error, setError] = useState("");
  const [abierto, setAbierto] = useState(false);

  const promos = (boletin.promociones ?? []) as PromocionBoletin[];

  function analizar() {
    setError("");
    const fd = new FormData();
    fd.set("id", boletin.id);
    startAnalisis(async () => {
      try {
        await analizarBoletin(fd);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al analizar");
      }
    });
  }

  return (
    <li className="border-b border-gray-50 px-5 py-4 last:border-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-gray-900">{boletin.titulo}</p>
            <Chip variante={boletin.origen === "KOA" ? "azul" : "ambar"}>
              {boletin.origen}
            </Chip>
            <Chip variante={vigente ? "verde" : "gris"}>
              {vigente ? "Vigente" : "Fuera de vigencia"}
            </Chip>
            {boletin.analizado_at && (
              <Chip variante="verde">✓ Analizado con IA</Chip>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-400">
            Vigencia: {formatFechaCorta(boletin.vigente_desde)} —{" "}
            {formatFechaCorta(boletin.vigente_hasta)}
          </p>

          {boletin.resumen_accionable ? (
            <Resumen texto={boletin.resumen_accionable} />
          ) : (
            <p className="mt-1 text-xs italic text-gray-400">
              {analizando
                ? "Analizando con IA…"
                : "Sin analizar. Usa “Analizar con IA” para extraer escalones y focos."}
            </p>
          )}

          {boletin.focos && boletin.focos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {boletin.focos.map((f) => (
                <Chip key={f} variante="ambar">
                  {f}
                </Chip>
              ))}
            </div>
          )}

          {promos.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => setAbierto(!abierto)}
                className="text-xs font-medium text-verde hover:underline"
              >
                {abierto ? "▾" : "▸"} {promos.length} promociones por SKU
              </button>
              {abierto && (
                <div className="mt-2 overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-gray-400">
                        <th className="px-3 py-2 font-medium">SKU</th>
                        <th className="px-3 py-2 font-medium">Categoría</th>
                        <th className="px-3 py-2 font-medium">Detalle</th>
                        <th className="px-3 py-2 text-right font-medium">
                          Mejor costo
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Desc. máx
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {promos.map((p, i) => (
                        <tr key={i} className="border-b border-gray-50 last:border-0">
                          <td className="px-3 py-2 font-medium text-gray-800">
                            {p.sku}
                          </td>
                          <td className="px-3 py-2 text-gray-500">
                            {p.categoria}
                          </td>
                          <td className="px-3 py-2 text-gray-600">{p.detalle}</td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums text-gray-900">
                            {p.mejor_costo || "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-verde">
                            {p.descuento_max || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {error && <p className="mt-2 text-xs text-rojo">{error}</p>}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {boletin.archivo_url && (
            <button
              onClick={analizar}
              disabled={analizando}
              className="rounded-lg bg-verde-suave px-3 py-1.5 text-xs font-semibold text-verde transition hover:bg-verde hover:text-white disabled:opacity-50"
            >
              {analizando
                ? "Analizando…"
                : boletin.analizado_at
                  ? "Re-analizar"
                  : "Analizar con IA"}
            </button>
          )}
          {urlFirmada && (
            <a
              href={urlFirmada}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-verde hover:underline"
            >
              Ver archivo
            </a>
          )}
          <form action={eliminarBoletin}>
            <input type="hidden" name="id" value={boletin.id} />
            <input
              type="hidden"
              name="archivo_url"
              value={boletin.archivo_url ?? ""}
            />
            <button
              type="submit"
              className="text-xs text-gray-300 transition hover:text-rojo"
              title="Eliminar boletín"
            >
              Eliminar
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}
