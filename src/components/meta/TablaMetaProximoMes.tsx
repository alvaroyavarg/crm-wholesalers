"use client";

import { Fragment, useState, useTransition } from "react";
import { guardarMetaMes, obtenerDetalleMeta } from "@/app/(app)/actions";
import { Chip } from "@/components/ui/Chip";
import { FACTOR_UC_EU } from "@/lib/importar/unidades";
import { formatEUs } from "@/lib/metrics";
import type { DetalleMetaItem, MetaClienteRow } from "@/lib/types";

type Columna = "nombre" | "eus_a" | "eus_b" | "eus_c" | "meta_eus";

interface Props {
  filas: MetaClienteRow[];
  fyMeta: number;
  periodoMeta: number;
  etiquetas: { a: string; b: string; c: string };
  periodos: {
    a: { fy: number; periodo: number };
    b: { fy: number; periodo: number };
    c: { fy: number; periodo: number };
  };
}

// Estado local de edición: EUS y UC se muestran como texto mientras se
// escribe (para no pelear con el cursor) y se derivan uno del otro con el
// factor estándar. No corrige por el mix de Smirnoff Ice del cliente — a
// nivel de meta agregada no hay un único factor correcto para eso.
interface EdicionMeta {
  eus: string;
  uc: string;
}

function etiquetaBottler(b: string | null): string {
  return b === "KOA" ? "Andina" : b === "KOE" ? "Embonor" : "—";
}

function eusAUc(eus: number): string {
  return (eus / FACTOR_UC_EU).toFixed(1);
}

function ucAEus(uc: number): string {
  return Math.round(uc * FACTOR_UC_EU).toString();
}

export function TablaMetaProximoMes({ filas, fyMeta, periodoMeta, etiquetas, periodos }: Props) {
  const [orden, setOrden] = useState<Columna>("eus_a");
  const [asc, setAsc] = useState(false);
  const [ediciones, setEdiciones] = useState<Record<string, EdicionMeta>>({});
  const [guardando, setGuardando] = useState<Record<string, boolean>>({});
  const [expandido, setExpandido] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Record<string, DetalleMetaItem[] | "cargando">>({});
  const [, startTransition] = useTransition();

  function valorEdicion(f: MetaClienteRow): EdicionMeta {
    return (
      ediciones[f.cliente_id] ?? {
        eus: f.meta_eus > 0 ? String(Math.round(f.meta_eus)) : "",
        uc: f.meta_eus > 0 ? eusAUc(f.meta_eus) : "",
      }
    );
  }

  function cambiarEus(clienteId: string, valor: string) {
    const n = Number(valor.replace(",", "."));
    setEdiciones((prev) => ({
      ...prev,
      [clienteId]: {
        eus: valor,
        uc: valor.trim() === "" || !Number.isFinite(n) ? "" : eusAUc(n),
      },
    }));
  }

  function cambiarUc(clienteId: string, valor: string) {
    const n = Number(valor.replace(",", "."));
    setEdiciones((prev) => ({
      ...prev,
      [clienteId]: {
        uc: valor,
        eus: valor.trim() === "" || !Number.isFinite(n) ? "" : ucAEus(n),
      },
    }));
  }

  async function guardar(clienteId: string) {
    const edicion = ediciones[clienteId];
    if (!edicion) return;
    const eus = Number(edicion.eus.replace(",", "."));
    if (!Number.isFinite(eus) || eus < 0) return;

    setGuardando((prev) => ({ ...prev, [clienteId]: true }));
    const fd = new FormData();
    fd.set("clienteId", clienteId);
    fd.set("anioFiscal", String(fyMeta));
    fd.set("periodo", String(periodoMeta));
    fd.set("eus", String(eus));
    try {
      await guardarMetaMes(fd);
    } finally {
      setGuardando((prev) => ({ ...prev, [clienteId]: false }));
    }
  }

  function toggleExpandir(f: MetaClienteRow) {
    const abrir = expandido !== f.cliente_id;
    setExpandido(abrir ? f.cliente_id : null);
    if (abrir && detalle[f.cliente_id] === undefined) {
      setDetalle((prev) => ({ ...prev, [f.cliente_id]: "cargando" }));
      startTransition(async () => {
        const items = await obtenerDetalleMeta(
          f.cliente_id,
          periodos.a.fy,
          periodos.a.periodo,
          periodos.b.fy,
          periodos.b.periodo,
          periodos.c.fy,
          periodos.c.periodo,
        );
        setDetalle((prev) => ({ ...prev, [f.cliente_id]: items }));
      });
    }
  }

  const columnas: { col: Columna; etiqueta: string; alinear?: "right" }[] = [
    { col: "nombre", etiqueta: "Cliente" },
    { col: "eus_a", etiqueta: etiquetas.a, alinear: "right" },
    { col: "eus_b", etiqueta: etiquetas.b, alinear: "right" },
    { col: "eus_c", etiqueta: `${etiquetas.c} (LY)`, alinear: "right" },
    { col: "meta_eus", etiqueta: "Meta", alinear: "right" },
  ];

  function valor(f: MetaClienteRow, col: Columna): number | string {
    if (col === "nombre") return f.nombre_corto ?? f.nombre;
    if (col === "meta_eus") return Number(f.meta_eus);
    return Number(f[col]);
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
      setAsc(col === "nombre");
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
            <th className="w-8 px-2 py-3" />
            <th className="px-3 py-3 font-medium">ID cliente</th>
            <th className="px-3 py-3 font-medium">Distribuidor</th>
            {columnas.map((c) => (
              <th
                key={c.col}
                onClick={() => ordenarPor(c.col)}
                className={`cursor-pointer select-none px-3 py-3 font-medium hover:text-gray-700 ${
                  c.alinear === "right" ? "text-right" : ""
                }`}
              >
                {c.etiqueta}
                {orden === c.col && (
                  <span className="ml-1 text-gray-400">{asc ? "▲" : "▼"}</span>
                )}
              </th>
            ))}
            <th className="px-3 py-3 text-right font-medium" title="Meta en cajas del bottler (UC), derivada con el factor estándar EU = UC × 5,678/9">
              Meta UC
            </th>
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((f) => {
            const edicion = valorEdicion(f);
            const abierto = expandido === f.cliente_id;
            const items = detalle[f.cliente_id];

            return (
              <Fragment key={f.cliente_id}>
                <tr className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  <td className="px-2 py-3 text-center">
                    <button
                      onClick={() => toggleExpandir(f)}
                      title="Ver compra por SKU"
                      className="text-gray-400 hover:text-gray-700"
                    >
                      {abierto ? "▾" : "▸"}
                    </button>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-gray-500">
                    {f.cod_diageo ?? "—"}
                  </td>
                  <td className="px-3 py-3">
                    <button
                      onClick={() => toggleExpandir(f)}
                      className="text-left font-medium text-gray-900 hover:text-verde"
                    >
                      {f.nombre_corto ?? f.nombre}
                    </button>
                    {f.segmento === "TOP3" && (
                      <span className="ml-2 align-middle">
                        <Chip variante="azul">TOP3</Chip>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-gray-600">
                    {etiquetaBottler(f.bottler)}
                    {f.es_frontera && (
                      <span className="ml-1.5 align-middle">
                        <Chip variante="ambar">frontera</Chip>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right text-gray-700">{formatEUs(f.eus_a)}</td>
                  <td className="px-3 py-3 text-right text-gray-700">{formatEUs(f.eus_b)}</td>
                  <td className="px-3 py-3 text-right text-gray-500">{formatEUs(f.eus_c)}</td>

                  <td className="px-3 py-3 text-right">
                    <input
                      value={edicion.eus}
                      onChange={(e) => cambiarEus(f.cliente_id, e.target.value)}
                      onBlur={() => guardar(f.cliente_id)}
                      placeholder="—"
                      inputMode="decimal"
                      className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-verde"
                    />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <input
                      value={edicion.uc}
                      onChange={(e) => cambiarUc(f.cliente_id, e.target.value)}
                      onBlur={() => guardar(f.cliente_id)}
                      placeholder="—"
                      inputMode="decimal"
                      className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-verde"
                    />
                    {guardando[f.cliente_id] && (
                      <span className="ml-1 text-[10px] text-gray-400">...</span>
                    )}
                  </td>
                </tr>

                {abierto && (
                  <tr className="bg-gray-50/60">
                    <td colSpan={9} className="px-5 py-3">
                      {items === "cargando" || items === undefined ? (
                        <p className="text-xs text-gray-400">Cargando compra por SKU…</p>
                      ) : items.length === 0 ? (
                        <p className="text-xs text-gray-400">
                          Sin compras en {etiquetas.a}, {etiquetas.b} o {etiquetas.c}.
                        </p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-gray-400">
                              <th className="py-1 font-medium">SKU</th>
                              <th className="py-1 text-right font-medium">{etiquetas.a}</th>
                              <th className="py-1 text-right font-medium">{etiquetas.b}</th>
                              <th className="py-1 text-right font-medium">{etiquetas.c}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((it, i) => (
                              <tr key={i} className="border-t border-gray-100">
                                <td className="py-1.5 text-gray-700">
                                  {it.marca}
                                  {it.formato && (
                                    <span className="text-gray-400"> · {it.formato}</span>
                                  )}
                                  <span className="ml-1.5 text-[10px] text-gray-300">
                                    {it.categoria}
                                  </span>
                                </td>
                                <td className="py-1.5 text-right text-gray-600">
                                  {formatEUs(it.eus_a)}
                                </td>
                                <td className="py-1.5 text-right text-gray-600">
                                  {formatEUs(it.eus_b)}
                                </td>
                                <td className="py-1.5 text-right text-gray-400">
                                  {formatEUs(it.eus_c)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
