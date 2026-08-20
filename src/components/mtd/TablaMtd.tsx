"use client";

import { useState } from "react";
import Link from "next/link";
import { guardarMetaMes } from "@/app/(app)/actions";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Chip } from "@/components/ui/Chip";
import { formatEUs, formatPct, pctVsLY } from "@/lib/metrics";
import type { MtdClienteRow, Segmento } from "@/lib/types";

type Columna = "nombre" | "mtd" | "meta" | "avance" | "vsLy" | "bottler";

// Ritmo esperado del mes: se recibe ya calculado desde la fecha de corte,
// para que cada fila se compare contra el mismo patrón que el encabezado.
export function TablaMtd({
  filas,
  fy,
  periodo,
  pctTranscurrido,
}: {
  filas: MtdClienteRow[];
  fy: number;
  periodo: number;
  pctTranscurrido: number;
}) {
  const [orden, setOrden] = useState<Columna>("mtd");
  const [asc, setAsc] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);

  const columnas: { col: Columna; etiqueta: string; alinear?: "right" }[] = [
    { col: "nombre", etiqueta: "Cliente" },
    { col: "bottler", etiqueta: "Distribuidor" },
    { col: "mtd", etiqueta: "MTD", alinear: "right" },
    { col: "meta", etiqueta: "Meta del mes", alinear: "right" },
    { col: "avance", etiqueta: "Avance" },
    { col: "vsLy", etiqueta: "vs LY", alinear: "right" },
  ];

  function valor(f: MtdClienteRow, col: Columna): number | string {
    switch (col) {
      case "nombre":
        return f.nombre_corto ?? f.nombre;
      case "bottler":
        return f.bottler ?? "";
      case "mtd":
        return Number(f.mtd_eus);
      case "meta":
        return Number(f.plan_mes_eus);
      case "avance":
        return Number(f.plan_mes_eus) > 0
          ? (Number(f.mtd_eus) / Number(f.plan_mes_eus)) * 100
          : -1;
      case "vsLy":
        return pctVsLY(Number(f.mtd_eus), Number(f.mtd_ly_eus)) ?? -Infinity;
    }
  }

  const ordenadas = [...filas].sort((a, b) => {
    const va = valor(a, orden);
    const vb = valor(b, orden);
    const cmp =
      typeof va === "string" && typeof vb === "string"
        ? va.localeCompare(vb, "es")
        : Number(va) - Number(vb);
    return asc ? cmp : -cmp;
  });

  function ordenarPor(col: Columna) {
    if (col === orden) setAsc(!asc);
    else {
      setOrden(col);
      setAsc(col === "nombre" || col === "bottler");
    }
  }

  const etiquetaBottler = (b: string | null) =>
    b === "KOA" ? "Andina" : b === "KOE" ? "Embonor" : "—";

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
            {columnas.map((c) => (
              <th
                key={c.col}
                onClick={() => ordenarPor(c.col)}
                className={`cursor-pointer select-none px-3 py-3 font-medium first:pl-5 hover:text-gray-700 ${
                  c.alinear === "right" ? "text-right" : ""
                }`}
              >
                {c.etiqueta}
                {orden === c.col && (
                  <span className="ml-1 text-gray-400">{asc ? "▲" : "▼"}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((f) => {
            const mtd = Number(f.mtd_eus);
            const meta = Number(f.plan_mes_eus);
            const avance = meta > 0 ? (mtd / meta) * 100 : null;
            const vsLy = pctVsLY(mtd, Number(f.mtd_ly_eus));
            // Al ritmo = va al menos tan avanzado como el mes con datos.
            const alRitmo = avance != null && avance >= pctTranscurrido;
            const enEdicion = editando === f.cliente_id;

            return (
              <tr
                key={f.cliente_id}
                className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60"
              >
                <td className="px-3 py-3 pl-5">
                  <Link
                    href={`/clientes/${f.cliente_id}`}
                    className="font-medium text-gray-900 hover:text-verde"
                  >
                    {f.nombre_corto ?? f.nombre}
                  </Link>
                  {f.segmento === "TOP3" && (
                    <span className="ml-2 align-middle">
                      <Chip variante="azul">TOP3</Chip>
                    </span>
                  )}
                </td>

                <td className="px-3 py-3 text-gray-600">
                  {etiquetaBottler(f.bottler)}
                  {Number(f.mtd_koa) > 0 && Number(f.mtd_koe) > 0 && (
                    <span className="ml-2 align-middle">
                      <Chip
                        variante="ambar"
                        title={`Andina ${formatEUs(Number(f.mtd_koa))} · Embonor ${formatEUs(Number(f.mtd_koe))} EUs`}
                      >
                        frontera
                      </Chip>
                    </span>
                  )}
                </td>

                <td className="px-3 py-3 text-right font-medium text-gray-900">
                  {formatEUs(mtd)}
                </td>

                <td className="px-3 py-3 text-right">
                  {enEdicion ? (
                    <form
                      action={async (fd) => {
                        await guardarMetaMes(fd);
                        setEditando(null);
                      }}
                      className="flex items-center justify-end gap-1"
                    >
                      <input type="hidden" name="clienteId" value={f.cliente_id} />
                      <input type="hidden" name="anioFiscal" value={fy} />
                      <input type="hidden" name="periodo" value={periodo} />
                      <input
                        name="eus"
                        type="number"
                        min={0}
                        step="1"
                        defaultValue={Math.round(meta)}
                        autoFocus
                        className="w-24 rounded-lg border border-verde px-2 py-1 text-right text-sm outline-none"
                      />
                      <button
                        type="submit"
                        className="rounded-lg bg-verde px-2 py-1 text-xs font-medium text-white"
                      >
                        OK
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditando(null)}
                        className="px-1 text-xs text-gray-400 hover:text-gray-600"
                      >
                        ✕
                      </button>
                    </form>
                  ) : (
                    <button
                      onClick={() => setEditando(f.cliente_id)}
                      title="Editar la meta de este mes"
                      className="rounded px-1 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    >
                      {meta > 0 ? formatEUs(meta) : "—"}
                      <span className="ml-1 text-[10px] text-gray-300">✎</span>
                    </button>
                  )}
                </td>

                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <BarraAvance pct={avance} />
                    {avance != null && (
                      <Chip variante={alRitmo ? "verde" : "ambar"}>
                        {alRitmo ? "al ritmo" : "atrás"}
                      </Chip>
                    )}
                  </div>
                </td>

                <td
                  className={`px-3 py-3 text-right font-medium ${
                    vsLy == null
                      ? "text-gray-400"
                      : vsLy >= 0
                        ? "text-verde"
                        : "text-rojo"
                  }`}
                >
                  {formatPct(vsLy)}
                  <span className="ml-1 block text-[11px] font-normal text-gray-400">
                    LY {formatEUs(Number(f.mtd_ly_eus))}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
