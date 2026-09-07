"use client";

import { Fragment, useState, useTransition } from "react";
import { guardarMetaMes, obtenerDetalleMeta } from "@/app/(app)/actions";
import { Chip } from "@/components/ui/Chip";
import { FACTOR_UC_EU } from "@/lib/importar/unidades";
import { formatEUs } from "@/lib/metrics";
import type { DetalleMetaItem, MetaClienteRow } from "@/lib/types";

type Columna = "cod" | "bottler" | "nombre" | "eus_a" | "eus_b" | "eus_c" | "meta_eus";
type ColumnaDetalle = "sku" | "eus_a" | "eus_b" | "eus_c";

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
  const [ordenDet, setOrdenDet] = useState<ColumnaDetalle>("eus_a");
  const [ascDet, setAscDet] = useState(false);
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

  const columnas: { col: Columna; etiqueta: string; alinear?: "right"; title?: string }[] = [
    { col: "cod", etiqueta: "ID cliente" },
    { col: "bottler", etiqueta: "Distribuidor" },
    { col: "nombre", etiqueta: "Cliente" },
    { col: "eus_a", etiqueta: etiquetas.a, alinear: "right" },
    { col: "eus_b", etiqueta: etiquetas.b, alinear: "right" },
    { col: "eus_c", etiqueta: `${etiquetas.c} (LY)`, alinear: "right" },
    { col: "meta_eus", etiqueta: "Meta", alinear: "right" },
  ];

  function valor(f: MetaClienteRow, col: Columna): number | string {
    if (col === "cod") return Number(String(f.cod_diageo ?? "").split(" / ")[0]) || 0;
    if (col === "bottler") return etiquetaBottler(f.bottler);
    if (col === "nombre") return f.nombre_corto ?? f.nombre;
    if (col === "meta_eus") return Number(f.meta_eus);
    return Number(f[col]);
  }

  function valorDetalle(it: DetalleMetaItem, col: ColumnaDetalle): number | string {
    if (col === "sku") return `${it.marca} ${it.formato}`;
    return Number(it[col]);
  }

  function ordenarDetalle(col: ColumnaDetalle) {
    if (col === ordenDet) setAscDet(!ascDet);
    else {
      setOrdenDet(col);
      setAscDet(col === "sku");
    }
  }

  function comparar(va: number | string, vb: number | string, ascendente: boolean) {
    const cmp =
      typeof va === "string" && typeof vb === "string"
        ? va.localeCompare(vb, "es")
        : Number(va) - Number(vb);
    return ascendente ? cmp : -cmp;
  }

  // Indicador de orden: visible siempre (tenue) para que se note que la
  // columna es ordenable; marcado cuando está activa.
  const indicador = (activa: boolean, ascendente: boolean) => (
    <span className={`ml-1 ${activa ? "text-gray-600" : "text-gray-300"}`}>
      {activa ? (ascendente ? "▲" : "▼") : "⇅"}
    </span>
  );

  const ordenadas = [...filas].sort((a, b) => comparar(valor(a, orden), valor(b, orden), asc));

  function ordenarPor(col: Columna) {
    if (col === orden) setAsc(!asc);
    else {
      setOrden(col);
      setAsc(col === "nombre" || col === "bottler" || col === "cod");
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
            <th className="w-8 px-2 py-3" />
            {columnas.map((c) => (
              <th
                key={c.col}
                onClick={() => ordenarPor(c.col)}
                title="Ordenar (clic de nuevo invierte)"
                className={`cursor-pointer select-none px-3 py-3 font-medium hover:text-gray-700 ${
                  c.alinear === "right" ? "text-right" : ""
                }`}
              >
                {c.etiqueta}
                {indicador(orden === c.col, asc)}
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
                  <td className="px-3 py-3 text-gray-600">
                    {etiquetaBottler(f.bottler)}
                    {f.es_frontera && (
                      <span className="ml-1.5 align-middle">
                        <Chip variante="ambar">frontera</Chip>
                      </span>
                    )}
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

                {abierto && (items === "cargando" || items === undefined) && (
                  <tr className="bg-gray-50/60">
                    <td colSpan={9} className="px-5 py-3 text-xs text-gray-400">
                      Cargando compra por SKU…
                    </td>
                  </tr>
                )}
                {abierto && Array.isArray(items) && items.length === 0 && (
                  <tr className="bg-gray-50/60">
                    <td colSpan={9} className="px-5 py-3 text-xs text-gray-400">
                      Sin compras en {etiquetas.a}, {etiquetas.b} o {etiquetas.c}.
                    </td>
                  </tr>
                )}
                {abierto && Array.isArray(items) && items.length > 0 && (
                  <>
                    {/* Encabezado del desglose: mismas celdas que la tabla, así
                        cada mes cae exactamente bajo su columna. */}
                    <tr className="bg-gray-50/60 text-[11px] text-gray-400">
                      <td />
                      <td />
                      <td />
                      {(
                        [
                          ["sku", "SKU"],
                          ["eus_a", etiquetas.a],
                          ["eus_b", etiquetas.b],
                          ["eus_c", `${etiquetas.c} (LY)`],
                        ] as [ColumnaDetalle, string][]
                      ).map(([col, et]) => (
                        <td
                          key={col}
                          onClick={() => ordenarDetalle(col)}
                          className={`cursor-pointer select-none px-3 py-1.5 font-medium hover:text-gray-600 ${
                            col === "sku" ? "" : "text-right"
                          }`}
                        >
                          {et}
                          {indicador(ordenDet === col, ascDet)}
                        </td>
                      ))}
                      <td />
                      <td />
                    </tr>
                    {[...items]
                      .sort((x, y) => comparar(valorDetalle(x, ordenDet), valorDetalle(y, ordenDet), ascDet))
                      .map((it, i) => (
                        <tr key={i} className="bg-gray-50/60 text-xs">
                          <td />
                          <td />
                          <td />
                          <td className="px-3 py-1.5 text-gray-700">
                            {it.marca}
                            {it.formato && <span className="text-gray-400"> · {it.formato}</span>}
                            <span className="ml-1.5 text-[10px] text-gray-300">{it.categoria}</span>
                          </td>
                          <td className="px-3 py-1.5 text-right text-gray-600">{formatEUs(it.eus_a)}</td>
                          <td className="px-3 py-1.5 text-right text-gray-600">{formatEUs(it.eus_b)}</td>
                          <td className="px-3 py-1.5 text-right text-gray-400">{formatEUs(it.eus_c)}</td>
                          <td />
                          <td />
                        </tr>
                      ))}
                  </>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
