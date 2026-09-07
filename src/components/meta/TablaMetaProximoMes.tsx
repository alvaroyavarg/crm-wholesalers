"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { guardarMetaMes, guardarMetaSku, obtenerDetalleMeta } from "@/app/(app)/actions";
import { PanelCliente } from "@/components/meta/PanelCliente";
import { Chip } from "@/components/ui/Chip";
import { FACTOR_UC_EU } from "@/lib/importar/unidades";
import { formatEUs } from "@/lib/metrics";
import type { DetalleMetaItem, MetaClienteRow, SkuCatalogo } from "@/lib/types";

type Columna =
  | "cod" | "bottler" | "zona" | "desarrollador" | "nombre"
  | "eus_a" | "eus_b" | "eus_c" | "eus_d" | "meta_eus";
type ColumnaDetalle = "sku" | "eus_a" | "eus_b" | "eus_c" | "eus_d" | "meta_eus";

interface Props {
  filas: MetaClienteRow[];
  fyMeta: number;
  periodoMeta: number;
  etiquetas: { a: string; b: string; c: string; d: string };
  periodos: {
    a: { fy: number; periodo: number };
    b: { fy: number; periodo: number };
    c: { fy: number; periodo: number };
    d: { fy: number; periodo: number };
  };
  catalogo: SkuCatalogo[];
}

// EUS y UC se muestran como texto mientras se escribe y se derivan uno del
// otro con el factor estándar (no corrige por el mix de Smirnoff Ice: a
// nivel de meta agregada no hay un único factor correcto).
interface EdicionMeta {
  eus: string;
  uc: string;
}

const NUM_COLS = 12; // chevron + 10 columnas (incl. Meta) + Meta UC

function etiquetaBottler(b: string | null): string {
  return b === "KOA" ? "Andina" : b === "KOE" ? "Embonor" : "—";
}
function eusAUc(eus: number): string {
  return (eus / FACTOR_UC_EU).toFixed(1);
}
function ucAEus(uc: number): string {
  return Math.round(uc * FACTOR_UC_EU).toString();
}
function claveSku(clienteId: string, marca: string, formato: string) {
  return `${clienteId}|${marca}|${formato}`;
}

export function TablaMetaProximoMes({ filas, fyMeta, periodoMeta, etiquetas, periodos, catalogo }: Props) {
  // ---- orden ----
  const [orden, setOrden] = useState<Columna>("eus_a");
  const [asc, setAsc] = useState(false);
  const [ordenDet, setOrdenDet] = useState<ColumnaDetalle>("eus_a");
  const [ascDet, setAscDet] = useState(false);
  // ---- filtros ----
  const [fBottler, setFBottler] = useState("");
  const [fZona, setFZona] = useState("");
  const [fDes, setFDes] = useState("");
  const [fTipo, setFTipo] = useState<"todos" | "cartera" | "otros">("todos");
  const [fTexto, setFTexto] = useState("");
  // ---- edición ----
  const [ediciones, setEdiciones] = useState<Record<string, EdicionMeta>>({});
  const [guardando, setGuardando] = useState<Record<string, boolean>>({});
  const [expandido, setExpandido] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Record<string, DetalleMetaItem[] | "cargando">>({});
  const [skuEdits, setSkuEdits] = useState<Record<string, string>>({});
  const [nuevoSku, setNuevoSku] = useState<Record<string, string>>({});
  const [panelId, setPanelId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const filaPanel = panelId ? filas.find((f) => f.cliente_id === panelId) ?? null : null;

  const zonas = useMemo(
    () => [...new Set(filas.map((f) => f.zona).filter((z): z is string => !!z))].sort(),
    [filas],
  );
  const desarrolladores = useMemo(
    () => [...new Set(filas.map((f) => f.desarrollador).filter((d): d is string => !!d))].sort(),
    [filas],
  );

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
    setEdiciones((p) => ({
      ...p,
      [clienteId]: { eus: valor, uc: valor.trim() === "" || !Number.isFinite(n) ? "" : eusAUc(n) },
    }));
  }
  function cambiarUc(clienteId: string, valor: string) {
    const n = Number(valor.replace(",", "."));
    setEdiciones((p) => ({
      ...p,
      [clienteId]: { uc: valor, eus: valor.trim() === "" || !Number.isFinite(n) ? "" : ucAEus(n) },
    }));
  }
  async function guardarTotal(clienteId: string) {
    const e = ediciones[clienteId];
    if (!e) return;
    const eus = Number(e.eus.replace(",", "."));
    if (!Number.isFinite(eus) || eus < 0) return;
    setGuardando((p) => ({ ...p, [clienteId]: true }));
    const fd = new FormData();
    fd.set("clienteId", clienteId);
    fd.set("anioFiscal", String(fyMeta));
    fd.set("periodo", String(periodoMeta));
    fd.set("eus", String(eus));
    try {
      await guardarMetaMes(fd);
    } finally {
      setGuardando((p) => ({ ...p, [clienteId]: false }));
    }
  }

  function cargarDetalle(clienteId: string) {
    setDetalle((p) => ({ ...p, [clienteId]: "cargando" }));
    startTransition(async () => {
      const items = await obtenerDetalleMeta(
        clienteId,
        periodos.a.fy, periodos.a.periodo,
        periodos.b.fy, periodos.b.periodo,
        periodos.c.fy, periodos.c.periodo,
        periodos.d.fy, periodos.d.periodo,
        fyMeta, periodoMeta,
      );
      setDetalle((p) => ({ ...p, [clienteId]: items }));
    });
  }
  function toggleExpandir(f: MetaClienteRow) {
    const abrir = expandido !== f.cliente_id;
    setExpandido(abrir ? f.cliente_id : null);
    if (abrir && detalle[f.cliente_id] === undefined) cargarDetalle(f.cliente_id);
  }

  // Refleja en la tabla una meta por SKU ya guardada (desde el desglose o
  // desde el panel): nueva meta total + el ítem en el desglose si está cargado.
  function aplicarMetaSku(clienteId: string, marca: string, formato: string, eus: number, total: number) {
    setEdiciones((p) => ({ ...p, [clienteId]: { eus: total > 0 ? String(Math.round(total)) : "", uc: total > 0 ? eusAUc(total) : "" } }));
    setSkuEdits((p) => ({ ...p, [claveSku(clienteId, marca, formato)]: eus > 0 ? String(Math.round(eus)) : "" }));
    setDetalle((p) => {
      const items = p[clienteId];
      if (!Array.isArray(items)) return p;
      const existe = items.some((it) => it.marca === marca && it.formato === formato);
      return {
        ...p,
        [clienteId]: existe
          ? items.map((it) => (it.marca === marca && it.formato === formato ? { ...it, meta_eus: eus } : it))
          : [{ categoria: "", marca, formato, eus_a: 0, eus_b: 0, eus_c: 0, eus_d: 0, meta_eus: eus }, ...items],
      };
    });
  }

  // Meta por SKU: guarda el SKU y refleja la nueva meta total del cliente
  // (la acción devuelve la suma de SKUs, que pasa a ser plan_ventas).
  async function guardarSku(clienteId: string, marca: string, formato: string) {
    const k = claveSku(clienteId, marca, formato);
    const txt = skuEdits[k];
    if (txt === undefined) return;
    const eus = txt.trim() === "" ? 0 : Number(txt.replace(",", "."));
    if (!Number.isFinite(eus) || eus < 0) return;
    setGuardando((p) => ({ ...p, [k]: true }));
    try {
      const total = await guardarMetaSku({ clienteId, anioFiscal: fyMeta, periodo: periodoMeta, marca, formato, eus });
      aplicarMetaSku(clienteId, marca, formato, eus, total);
    } finally {
      setGuardando((p) => ({ ...p, [k]: false }));
    }
  }
  function agregarSku(clienteId: string) {
    const sel = nuevoSku[clienteId];
    if (!sel) return;
    const [marca, formato] = sel.split("|");
    const cat = catalogo.find((c) => c.marca === marca && c.formato === formato);
    setDetalle((p) => {
      const items = Array.isArray(p[clienteId]) ? (p[clienteId] as DetalleMetaItem[]) : [];
      if (items.some((it) => it.marca === marca && it.formato === formato)) return p;
      return { ...p, [clienteId]: [{ categoria: cat?.categoria ?? "", marca, formato, eus_a: 0, eus_b: 0, eus_c: 0, eus_d: 0, meta_eus: 0 }, ...items] };
    });
    setNuevoSku((p) => ({ ...p, [clienteId]: "" }));
  }

  // ---- columnas / orden ----
  const columnas: { col: Columna; etiqueta: string; alinear?: "right" }[] = [
    { col: "cod", etiqueta: "ID cliente" },
    { col: "bottler", etiqueta: "Distribuidor" },
    { col: "zona", etiqueta: "Zona" },
    { col: "desarrollador", etiqueta: "Desarrollador" },
    { col: "nombre", etiqueta: "Cliente" },
    { col: "eus_a", etiqueta: etiquetas.a, alinear: "right" },
    { col: "eus_b", etiqueta: etiquetas.b, alinear: "right" },
    { col: "eus_c", etiqueta: etiquetas.c, alinear: "right" },
    { col: "eus_d", etiqueta: `${etiquetas.d} (LY)`, alinear: "right" },
    { col: "meta_eus", etiqueta: "Meta", alinear: "right" },
  ];
  function valor(f: MetaClienteRow, col: Columna): number | string {
    switch (col) {
      case "cod": return Number(String(f.cod_diageo ?? "").split(" / ")[0]) || 0;
      case "bottler": return etiquetaBottler(f.bottler);
      case "zona": return f.zona ?? "";
      case "desarrollador": return f.desarrollador ?? "";
      case "nombre": return f.nombre_corto ?? f.nombre;
      case "meta_eus": return Number(ediciones[f.cliente_id]?.eus ?? f.meta_eus) || 0;
      default: return Number(f[col]);
    }
  }
  function valorDetalle(it: DetalleMetaItem, col: ColumnaDetalle): number | string {
    return col === "sku" ? `${it.marca} ${it.formato}` : Number(it[col]);
  }
  function comparar(va: number | string, vb: number | string, ascendente: boolean) {
    const cmp = typeof va === "string" && typeof vb === "string" ? va.localeCompare(vb, "es") : Number(va) - Number(vb);
    return ascendente ? cmp : -cmp;
  }
  function ordenarPor(col: Columna) {
    if (col === orden) setAsc(!asc);
    else { setOrden(col); setAsc(["nombre", "bottler", "cod", "zona", "desarrollador"].includes(col)); }
  }
  function ordenarDetalle(col: ColumnaDetalle) {
    if (col === ordenDet) setAscDet(!ascDet);
    else { setOrdenDet(col); setAscDet(col === "sku"); }
  }
  const indicador = (activa: boolean, ascendente: boolean) => (
    <span className={`ml-1 ${activa ? "text-gray-600" : "text-gray-300"}`}>{activa ? (ascendente ? "▲" : "▼") : "⇅"}</span>
  );

  // ---- filtro + orden ----
  const texto = fTexto.trim().toLowerCase();
  const visibles = filas
    .filter((f) => !fBottler || f.bottler === fBottler)
    .filter((f) => !fZona || f.zona === fZona)
    .filter((f) => !fDes || f.desarrollador === fDes)
    .filter((f) => fTipo === "todos" || (fTipo === "otros" ? f.es_otros : !f.es_otros))
    .filter((f) => !texto || `${f.nombre_corto ?? ""} ${f.nombre} ${f.cod_diageo ?? ""}`.toLowerCase().includes(texto))
    .sort((a, b) => comparar(valor(a, orden), valor(b, orden), asc));

  const selectCls = "rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700";

  return (
    <div>
      {/* ---- Filtros ---- */}
      <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
        <input
          value={fTexto}
          onChange={(e) => setFTexto(e.target.value)}
          placeholder="Buscar cliente o ID…"
          className={`${selectCls} w-44`}
        />
        <select value={fBottler} onChange={(e) => setFBottler(e.target.value)} className={selectCls}>
          <option value="">Distribuidor: todos</option>
          <option value="KOA">Andina</option>
          <option value="KOE">Embonor</option>
        </select>
        <select value={fZona} onChange={(e) => setFZona(e.target.value)} className={selectCls}>
          <option value="">Zona: todas</option>
          {zonas.map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
        <select value={fDes} onChange={(e) => setFDes(e.target.value)} className={selectCls}>
          <option value="">Desarrollador: todos</option>
          {desarrolladores.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={fTipo} onChange={(e) => setFTipo(e.target.value as typeof fTipo)} className={selectCls}>
          <option value="todos">Cartera + Otros</option>
          <option value="cartera">Solo cartera</option>
          <option value="otros">Solo Otros</option>
        </select>
        {(fBottler || fZona || fDes || fTipo !== "todos" || fTexto) && (
          <button
            onClick={() => { setFBottler(""); setFZona(""); setFDes(""); setFTipo("todos"); setFTexto(""); }}
            className="text-xs text-gray-400 hover:text-gray-700"
          >
            ✕ limpiar
          </button>
        )}
        <span className="ml-auto text-xs text-gray-400">{visibles.length} de {filas.length}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="w-8 px-2 py-3" />
              {columnas.map((c) => (
                <th
                  key={c.col}
                  onClick={() => ordenarPor(c.col)}
                  title="Ordenar (clic de nuevo invierte)"
                  className={`cursor-pointer select-none px-3 py-3 font-medium hover:text-gray-700 ${c.alinear === "right" ? "text-right" : ""}`}
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
            {visibles.map((f) => {
              const edicion = valorEdicion(f);
              const abierto = expandido === f.cliente_id;
              const items = detalle[f.cliente_id];
              const metaTotal = Number(edicion.eus) || 0;
              const sumaSku = Array.isArray(items)
                ? items.reduce((s, it) => s + Number(it.meta_eus), 0)
                : Number(f.meta_sku_eus);
              const desglosado = sumaSku > 0;

              return (
                <Fragment key={f.cliente_id}>
                  <tr className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/60 ${f.es_otros ? "bg-gray-50/40" : ""}`}>
                    <td className="px-2 py-3 text-center">
                      <button onClick={() => toggleExpandir(f)} title="Compra por SKU y meta por SKU" className="text-gray-400 hover:text-gray-700">
                        {abierto ? "▾" : "▸"}
                      </button>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-gray-500">{f.es_otros ? "—" : (f.cod_diageo ?? "—")}</td>
                    <td className="px-3 py-3 text-gray-600">
                      {etiquetaBottler(f.bottler)}
                      {f.es_frontera && <span className="ml-1.5 align-middle"><Chip variante="ambar">frontera</Chip></span>}
                    </td>
                    <td className="px-3 py-3 text-gray-600">{f.zona ?? "—"}</td>
                    <td className="px-3 py-3 text-gray-600">{f.desarrollador ?? "—"}</td>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => setPanelId(f.cliente_id)}
                        onDoubleClick={() => toggleExpandir(f)}
                        title="Abrir panel del cliente (doble clic: desglose por SKU en la tabla)"
                        className={`text-left font-medium hover:text-verde ${panelId === f.cliente_id ? "text-verde" : "text-gray-900"}`}
                      >
                        {f.nombre_corto ?? f.nombre}
                      </button>
                      {f.es_otros ? (
                        <span className="ml-2 align-middle"><Chip variante="gris" title="Suma de los clientes de la base mayorista que no se gestionan directo">Otros</Chip></span>
                      ) : f.segmento === "TOP3" ? (
                        <span className="ml-2 align-middle"><Chip variante="azul">TOP3</Chip></span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-right text-gray-700">{formatEUs(f.eus_a)}</td>
                    <td className="px-3 py-3 text-right text-gray-700">{formatEUs(f.eus_b)}</td>
                    <td className="px-3 py-3 text-right text-gray-700">{formatEUs(f.eus_c)}</td>
                    <td className="px-3 py-3 text-right text-gray-500">{formatEUs(f.eus_d)}</td>
                    <td className="px-3 py-3 text-right">
                      <input
                        value={edicion.eus}
                        onChange={(e) => cambiarEus(f.cliente_id, e.target.value)}
                        onBlur={() => guardarTotal(f.cliente_id)}
                        placeholder="—"
                        inputMode="decimal"
                        className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-verde"
                      />
                      {desglosado && Math.round(sumaSku) !== Math.round(metaTotal) && (
                        <div className="mt-0.5 text-[10px] text-ambar" title="La suma de las metas por SKU no coincide con la meta total">
                          SKU suman {formatEUs(sumaSku)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <input
                        value={edicion.uc}
                        onChange={(e) => cambiarUc(f.cliente_id, e.target.value)}
                        onBlur={() => guardarTotal(f.cliente_id)}
                        placeholder="—"
                        inputMode="decimal"
                        className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-verde"
                      />
                      {guardando[f.cliente_id] && <span className="ml-1 text-[10px] text-gray-400">…</span>}
                    </td>
                  </tr>

                  {abierto && (items === "cargando" || items === undefined) && (
                    <tr className="bg-gray-50/60"><td colSpan={NUM_COLS} className="px-5 py-3 text-xs text-gray-400">Cargando compra por SKU…</td></tr>
                  )}

                  {abierto && Array.isArray(items) && (
                    <>
                      <tr className="bg-gray-50/60 text-[11px] text-gray-400">
                        <td /><td /><td /><td /><td />
                        {([["sku", "SKU"], ["eus_a", etiquetas.a], ["eus_b", etiquetas.b], ["eus_c", etiquetas.c], ["eus_d", `${etiquetas.d} (LY)`], ["meta_eus", "Meta SKU"]] as [ColumnaDetalle, string][]).map(([col, et]) => (
                          <td key={col} onClick={() => ordenarDetalle(col)} className={`cursor-pointer select-none px-3 py-1.5 font-medium hover:text-gray-600 ${col === "sku" ? "" : "text-right"}`}>
                            {et}{indicador(ordenDet === col, ascDet)}
                          </td>
                        ))}
                        <td className="px-3 py-1.5 text-right font-medium">UC</td>
                      </tr>
                      {[...items]
                        .sort((x, y) => comparar(valorDetalle(x, ordenDet), valorDetalle(y, ordenDet), ascDet))
                        .map((it) => {
                          const k = claveSku(f.cliente_id, it.marca, it.formato);
                          const txt = skuEdits[k] ?? (it.meta_eus > 0 ? String(Math.round(it.meta_eus)) : "");
                          const n = Number(txt.replace(",", "."));
                          return (
                            <tr key={k} className="bg-gray-50/60 text-xs">
                              <td /><td /><td /><td /><td />
                              <td className="px-3 py-1.5 text-gray-700">
                                {it.marca}
                                {it.formato && <span className="text-gray-400"> · {it.formato}</span>}
                                {it.categoria && <span className="ml-1.5 text-[10px] text-gray-300">{it.categoria}</span>}
                              </td>
                              <td className="px-3 py-1.5 text-right text-gray-600">{formatEUs(it.eus_a)}</td>
                              <td className="px-3 py-1.5 text-right text-gray-600">{formatEUs(it.eus_b)}</td>
                              <td className="px-3 py-1.5 text-right text-gray-600">{formatEUs(it.eus_c)}</td>
                              <td className="px-3 py-1.5 text-right text-gray-400">{formatEUs(it.eus_d)}</td>
                              <td className="px-3 py-1.5 text-right">
                                <input
                                  value={txt}
                                  onChange={(e) => setSkuEdits((p) => ({ ...p, [k]: e.target.value }))}
                                  onBlur={() => guardarSku(f.cliente_id, it.marca, it.formato)}
                                  placeholder="—"
                                  inputMode="decimal"
                                  className="w-16 rounded-lg border border-gray-200 px-2 py-0.5 text-right text-xs outline-none focus:border-verde"
                                />
                                {guardando[k] && <span className="ml-1 text-[10px] text-gray-400">…</span>}
                              </td>
                              <td className="px-3 py-1.5 text-right text-gray-400">{Number.isFinite(n) && n > 0 ? eusAUc(n) : "—"}</td>
                            </tr>
                          );
                        })}
                      <tr className="bg-gray-50/60 text-xs">
                        <td /><td /><td /><td /><td />
                        <td colSpan={7} className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <select value={nuevoSku[f.cliente_id] ?? ""} onChange={(e) => setNuevoSku((p) => ({ ...p, [f.cliente_id]: e.target.value }))} className={selectCls}>
                              <option value="">+ Agregar SKU a la meta…</option>
                              {catalogo.map((c) => (
                                <option key={`${c.marca}|${c.formato}`} value={`${c.marca}|${c.formato}`}>{c.marca}{c.formato ? ` · ${c.formato}` : ""}</option>
                              ))}
                            </select>
                            <button onClick={() => agregarSku(f.cliente_id)} disabled={!nuevoSku[f.cliente_id]} className="rounded-lg bg-verde px-2 py-1 text-xs font-medium text-white disabled:opacity-40">Agregar</button>
                            <span className="text-[11px] text-gray-400">Al guardar una meta por SKU, la meta total pasa a ser la suma de los SKUs. Si preferís, escribí solo el total arriba.</span>
                          </div>
                        </td>
                      </tr>
                    </>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {filaPanel && (
        <PanelCliente
          key={filaPanel.cliente_id}
          fila={filaPanel}
          fyMeta={fyMeta}
          periodoMeta={periodoMeta}
          etiquetas={etiquetas}
          periodos={periodos}
          catalogo={catalogo}
          metaActual={Number(valorEdicion(filaPanel).eus) || 0}
          onClose={() => setPanelId(null)}
          onMetaSku={aplicarMetaSku}
        />
      )}
    </div>
  );
}
