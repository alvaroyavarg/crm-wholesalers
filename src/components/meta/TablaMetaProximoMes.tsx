"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { guardarMetaSku, obtenerDetalleMeta } from "@/app/(app)/actions";
import { formatoUnidad, SwitchUnidad, usePublicarAvance, useUnidad } from "@/components/meta/MetaAvance";
import { PanelCliente } from "@/components/meta/PanelCliente";
import { Chip } from "@/components/ui/Chip";
import { FACTOR_UC_EU } from "@/lib/importar/unidades";
import type { DetalleMetaItem, MetaClienteRow, SkuCatalogo } from "@/lib/types";

type Columna =
  | "cod" | "bottler" | "zona" | "desarrollador" | "nombre"
  | "eus_a" | "eus_b" | "eus_c" | "eus_d" | "meta_eus"
  | "ped_comprometido" | "ped_ingresado" | "facturado" | "brecha";
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

// Columnas que se pueden ocultar (Cliente siempre visible). Se recuerda en
// el navegador.
type ColumnaOcultable = Exclude<Columna, "nombre"> | "meta_uc";
const OCULTABLES: { col: ColumnaOcultable; etiqueta: string }[] = [
  { col: "cod", etiqueta: "ID cliente" },
  { col: "bottler", etiqueta: "Distribuidor" },
  { col: "zona", etiqueta: "Zona" },
  { col: "desarrollador", etiqueta: "Desarrollador" },
  { col: "eus_a", etiqueta: "Mes -3" },
  { col: "eus_b", etiqueta: "Mes -2" },
  { col: "eus_c", etiqueta: "Mes -1" },
  { col: "eus_d", etiqueta: "Mismo mes LY" },
  { col: "meta_eus", etiqueta: "Meta" },
  { col: "ped_comprometido", etiqueta: "Comprometido" },
  { col: "ped_ingresado", etiqueta: "Ingresado" },
  { col: "facturado", etiqueta: "Facturado" },
  { col: "brecha", etiqueta: "Brecha" },
  { col: "meta_uc", etiqueta: "Meta UC" },
];
const CLAVE_COLUMNAS = "crm.meta.columnasOcultas";
const CLAVE_BRECHA = "crm.meta.brecha";

// Brecha = Meta − lo que elijas descontar. Facturado ya respeta la regla
// "si el bottler cargó el mes, la venta real es la única verdad".
type Descuento = "facturado" | "ped_ingresado" | "ped_comprometido";
const DESCUENTOS: { col: Descuento; etiqueta: string; corta: string }[] = [
  { col: "facturado", etiqueta: "Facturado", corta: "Fact." },
  { col: "ped_ingresado", etiqueta: "Ingresado", corta: "Ingr." },
  { col: "ped_comprometido", etiqueta: "Comprometido", corta: "Comp." },
];
// Facturado efectivo: venta real si el bottler ya cargó el mes; si no, pedidos facturados.
function facturadoDe(f: MetaClienteRow): number {
  return f.venta_cargada ? Number(f.venta_real) : Number(f.ped_facturado);
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
  // ---- columnas visibles ----
  const [ocultas, setOcultas] = useState<Set<ColumnaOcultable>>(new Set());
  const [menuColumnas, setMenuColumnas] = useState(false);
  const [menuBrecha, setMenuBrecha] = useState(false);
  const [descuentos, setDescuentos] = useState<Set<Descuento>>(new Set(["facturado"]));
  // Pedidos cambiados desde el panel (sin recargar la página)
  const [pedidosLocal, setPedidosLocal] = useState<Record<string, { comprometido: number; ingresado: number; facturado: number }>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CLAVE_COLUMNAS);
      if (raw) setOcultas(new Set(JSON.parse(raw) as ColumnaOcultable[]));
      const rawB = localStorage.getItem(CLAVE_BRECHA);
      if (rawB) setDescuentos(new Set(JSON.parse(rawB) as Descuento[]));
    } catch { /* sin preferencia guardada */ }
  }, []);
  function alternarDescuento(d: Descuento) {
    setDescuentos((prev) => {
      const s = new Set(prev);
      if (s.has(d)) s.delete(d); else s.add(d);
      try { localStorage.setItem(CLAVE_BRECHA, JSON.stringify([...s])); } catch { /* sin storage */ }
      return s;
    });
  }
  // fila con los pedidos vivos (los del panel pisan los de la carga)
  function conPedidos(f: MetaClienteRow): MetaClienteRow {
    const l = pedidosLocal[f.cliente_id];
    return l ? { ...f, ped_comprometido: l.comprometido, ped_ingresado: l.ingresado, ped_facturado: l.facturado } : f;
  }
  function brechaDe(f: MetaClienteRow, metaTotal: number): number {
    let b = metaTotal;
    if (descuentos.has("facturado")) b -= facturadoDe(f);
    if (descuentos.has("ped_ingresado")) b -= Number(f.ped_ingresado);
    if (descuentos.has("ped_comprometido")) b -= Number(f.ped_comprometido);
    return b;
  }
  const etiquetaBrecha = descuentos.size === 0
    ? "Brecha = Meta"
    : `Meta − ${DESCUENTOS.filter((d) => descuentos.has(d.col)).map((d) => d.corta).join(" − ")}`;

  // Publicar el resumen grande (toda la cartera, con cifras vivas)
  const { unidad } = useUnidad();
  const fmt = (n: number) => formatoUnidad(n, unidad);
  const publicar = usePublicarAvance();
  useEffect(() => {
    if (!publicar) return;
    const todas = filas.map(conPedidos);
    const metaDe = (f: MetaClienteRow) => Number(ediciones[f.cliente_id]?.eus ?? f.meta_eus) || 0;
    publicar({
      meta: todas.reduce((s, f) => s + metaDe(f), 0),
      comprometido: todas.reduce((s, f) => s + Number(f.ped_comprometido), 0),
      ingresado: todas.reduce((s, f) => s + Number(f.ped_ingresado), 0),
      facturado: todas.reduce((s, f) => s + facturadoDe(f), 0),
      brecha: todas.reduce((s, f) => s + brechaDe(f, metaDe(f)), 0),
      etiquetaBrecha,
      conVentaReal: todas.filter((f) => f.venta_cargada).length,
      cuentas: todas.length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, ediciones, pedidosLocal, descuentos]);
  function alternarColumna(col: ColumnaOcultable) {
    setOcultas((prev) => {
      const s = new Set(prev);
      if (s.has(col)) s.delete(col); else s.add(col);
      try { localStorage.setItem(CLAVE_COLUMNAS, JSON.stringify([...s])); } catch { /* sin storage */ }
      return s;
    });
  }
  function fijarOcultas(cols: ColumnaOcultable[]) {
    const s = new Set(cols);
    setOcultas(s);
    try { localStorage.setItem(CLAVE_COLUMNAS, JSON.stringify(cols)); } catch { /* sin storage */ }
  }
  const ver = (col: ColumnaOcultable) => !ocultas.has(col);
  // celdas vacías que preceden al SKU en las filas de desglose: chevron + columnas de texto visibles
  const relleno = 1 + (["cod", "bottler", "zona", "desarrollador"] as ColumnaOcultable[]).filter(ver).length;
  const numCols = 2 + OCULTABLES.filter((c) => ver(c.col)).length; // chevron + Cliente + visibles
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
    { col: "meta_eus", etiqueta: unidad === "UC" ? "Meta (UC)" : "Meta", alinear: "right" },
    { col: "ped_comprometido", etiqueta: "Comprometido", alinear: "right" },
    { col: "ped_ingresado", etiqueta: "Ingresado", alinear: "right" },
    { col: "facturado", etiqueta: "Facturado", alinear: "right" },
    { col: "brecha", etiqueta: etiquetaBrecha, alinear: "right" },
  ];
  function valor(f0: MetaClienteRow, col: Columna): number | string {
    const f = conPedidos(f0);
    switch (col) {
      case "cod": return Number(String(f.cod_diageo ?? "").split(" / ")[0]) || 0;
      case "bottler": return etiquetaBottler(f.bottler);
      case "zona": return f.zona ?? "";
      case "desarrollador": return f.desarrollador ?? "";
      case "nombre": return f.nombre_corto ?? f.nombre;
      case "meta_eus": return Number(ediciones[f.cliente_id]?.eus ?? f.meta_eus) || 0;
      case "facturado": return facturadoDe(f);
      case "brecha": return brechaDe(f, Number(ediciones[f.cliente_id]?.eus ?? f.meta_eus) || 0);
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
        <SwitchUnidad />
        <div className="relative hidden lg:block">
          <button
            onClick={() => setMenuColumnas((v) => !v)}
            className={`${selectCls} ${ocultas.size > 0 ? "border-verde text-verde" : ""}`}
            title="Mostrar u ocultar columnas"
          >
            ⚙ Columnas{ocultas.size > 0 ? ` (${ocultas.size} ocultas)` : ""}
          </button>
          {menuColumnas && <div className="fixed inset-0 z-10" onClick={() => setMenuColumnas(false)} />}
          {menuColumnas && (
            <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-gray-200 bg-white p-2 text-xs shadow-lg">
              {OCULTABLES.map((c) => (
                <label key={c.col} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-gray-50">
                  <input type="checkbox" checked={ver(c.col)} onChange={() => alternarColumna(c.col)} />
                  <span className="text-gray-700">
                    {c.col === "eus_a" ? etiquetas.a : c.col === "eus_b" ? etiquetas.b : c.col === "eus_c" ? etiquetas.c : c.col === "eus_d" ? `${etiquetas.d} (LY)` : c.etiqueta}
                  </span>
                </label>
              ))}
              <div className="mt-1 flex justify-between gap-1 border-t border-gray-100 pt-1.5">
                <button onClick={() => fijarOcultas(["cod", "bottler", "zona", "desarrollador"])} className="rounded px-1.5 py-1 text-gray-500 hover:bg-gray-50 hover:text-gray-800">Solo ventas y meta</button>
                <button onClick={() => fijarOcultas([])} className="rounded px-1.5 py-1 text-gray-500 hover:bg-gray-50 hover:text-gray-800">Todas</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---- Móvil: tarjetas (la tabla de 12 columnas no cabe) ---- */}
      <ul className="divide-y divide-gray-100 lg:hidden">
        {visibles.map((f) => {
          const edicion = valorEdicion(f);
          return (
            <li key={f.cliente_id} className={`px-4 py-3 ${f.es_otros ? "bg-gray-50/40" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <button onClick={() => setPanelId(f.cliente_id)} className="min-w-0 text-left">
                  <span className={`block truncate font-medium ${panelId === f.cliente_id ? "text-verde" : "text-gray-900"}`}>
                    {f.nombre_corto ?? f.nombre}
                  </span>
                  <span className="block truncate text-[11px] text-gray-500">
                    {f.es_otros ? "Otros · " : f.cod_diageo ? `${f.cod_diageo} · ` : ""}
                    {etiquetaBottler(f.bottler)}
                    {f.zona ? ` · ${f.zona}` : ""}
                    {f.desarrollador ? ` · ${f.desarrollador}` : ""}
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  {f.segmento === "TOP3" && !f.es_otros && <Chip variante="azul">TOP3</Chip>}
                  {f.es_frontera && <Chip variante="ambar">frontera</Chip>}
                  <button onClick={() => setPanelId(f.cliente_id)} className="rounded-lg px-2 py-1 text-gray-400 hover:text-gray-700" title="Abrir panel">
                    ›
                  </button>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1 text-center">
                {([["a", f.eus_a], ["b", f.eus_b], ["c", f.eus_c], ["d", f.eus_d]] as const).map(([k, v]) => (
                  <div key={k} className="rounded-md bg-gray-50 py-1">
                    <p className="text-[10px] text-gray-400">{etiquetas[k]}{k === "d" ? " LY" : ""}</p>
                    <p className={`text-xs ${k === "d" ? "text-gray-500" : "text-gray-800"}`}>{fmt(Number(v))}</p>
                  </div>
                ))}
              </div>
              {(() => { const fp = conPedidos(f); const m = Number(edicion.eus) || 0; const fac = facturadoDe(fp); return (fac > 0 || Number(fp.ped_ingresado) > 0 || Number(fp.ped_comprometido) > 0) ? (
                <p className="mt-1.5 text-[11px] text-gray-500">
                  Fact. {fmt(fac)}{fp.venta_cargada ? " ●" : ""} · Ingr. {fmt(fp.ped_ingresado)} · Comp. {fmt(fp.ped_comprometido)}
                  {m > 0 && <span className={`ml-2 font-medium ${brechaDe(fp, m) <= 0 ? "text-verde" : "text-ambar"}`}>brecha {fmt(brechaDe(fp, m))}</span>}
                </p>
              ) : null; })()}
              <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-gray-500">
                <span>
                  Meta <b className="text-sm text-gray-900">{Number(edicion.eus) > 0 ? fmt(Number(edicion.eus)) : "—"}</b> {unidad}
                  {Number(edicion.eus) > 0 && <span className="ml-1 text-gray-400">({unidad === "UC" ? `${formatoUnidad(Number(edicion.eus), "EU")} EU` : `${edicion.uc} UC`})</span>}
                </span>
                <button onClick={() => setPanelId(f.cliente_id)} className="text-verde">asignar por SKU ›</button>
              </div>
            </li>
          );
        })}
        {visibles.length === 0 && <li className="px-4 py-6 text-center text-xs text-gray-400">Sin clientes con esos filtros.</li>}
      </ul>

      {/* ---- Escritorio: tabla completa ---- */}
      <div className="hidden overflow-x-auto lg:block">
        <table className={`w-full text-sm ${ocultas.size >= 4 ? "min-w-[760px]" : "min-w-[1180px]"}`}>
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="w-8 px-2 py-3" />
              {columnas.filter((c) => c.col === "nombre" || ver(c.col)).map((c) => (
                <th
                  key={c.col}
                  onClick={() => ordenarPor(c.col)}
                  title={c.col === "facturado" ? "Si el bottler ya cargó el mes: venta real. Si no: pedidos facturados." : "Ordenar (clic de nuevo invierte)"}
                  className={`relative cursor-pointer select-none px-3 py-3 font-medium hover:text-gray-700 ${c.alinear === "right" ? "text-right" : ""}`}
                >
                  {c.etiqueta}
                  {indicador(orden === c.col, asc)}
                  {c.col === "brecha" && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuBrecha((v) => !v); }}
                        title="Elegir qué se descuenta de la meta"
                        className="ml-1 rounded border border-gray-200 px-1 text-[10px] text-gray-500 hover:border-verde hover:text-verde"
                      >
                        ⚙
                      </button>
                      {menuBrecha && <div className="fixed inset-0 z-10 cursor-default" onClick={(e) => { e.stopPropagation(); setMenuBrecha(false); }} />}
                      {menuBrecha && (
                        <div onClick={(e) => e.stopPropagation()} className="absolute right-0 z-20 mt-1 w-52 cursor-default rounded-lg border border-gray-200 bg-white p-2 text-left text-xs font-normal shadow-lg">
                          <p className="mb-1 text-[10px] uppercase tracking-wide text-gray-400">Brecha = Meta −</p>
                          {DESCUENTOS.map((d) => (
                            <label key={d.col} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-gray-50">
                              <input type="checkbox" checked={descuentos.has(d.col)} onChange={() => alternarDescuento(d.col)} />
                              <span className="text-gray-700">{d.etiqueta}</span>
                            </label>
                          ))}
                          <p className="mt-1 border-t border-gray-100 pt-1.5 text-[10px] text-gray-400">
                            Facturado usa la venta real del bottler cuando ese mes ya está cargado; los pedidos facturados que no vinieron en la venta valen 0.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </th>
              ))}
              {ver("meta_uc") && (
                <th className="px-3 py-3 text-right font-medium" title="Meta en cajas del bottler (UC), derivada con el factor estándar EU = UC × 5,678/9">
                  {unidad === "UC" ? "Meta (EU)" : "Meta UC"}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => {
              const edicion = valorEdicion(f);
              const fp = conPedidos(f);
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
                    {ver("cod") && <td className="px-3 py-3 font-mono text-xs text-gray-500">{f.es_otros ? "—" : (f.cod_diageo ?? "—")}</td>}
                    {ver("bottler") && (
                      <td className="px-3 py-3 text-gray-600">
                        {etiquetaBottler(f.bottler)}
                        {f.es_frontera && <span className="ml-1.5 align-middle"><Chip variante="ambar">frontera</Chip></span>}
                      </td>
                    )}
                    {ver("zona") && <td className="px-3 py-3 text-gray-600">{f.zona ?? "—"}</td>}
                    {ver("desarrollador") && <td className="px-3 py-3 text-gray-600">{f.desarrollador ?? "—"}</td>}
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
                    {ver("eus_a") && <td className="px-3 py-3 text-right text-gray-700">{fmt(f.eus_a)}</td>}
                    {ver("eus_b") && <td className="px-3 py-3 text-right text-gray-700">{fmt(f.eus_b)}</td>}
                    {ver("eus_c") && <td className="px-3 py-3 text-right text-gray-700">{fmt(f.eus_c)}</td>}
                    {ver("eus_d") && <td className="px-3 py-3 text-right text-gray-500">{fmt(f.eus_d)}</td>}
                    {ver("meta_eus") && (
                      <td className="px-3 py-3 text-right" title="La meta es la suma de las metas por SKU: ábrelo con la flecha o el panel para asignarla">
                        <button onClick={() => toggleExpandir(f)} className={`rounded px-1.5 py-0.5 font-medium hover:bg-gray-100 ${metaTotal > 0 ? "text-gray-900" : "text-gray-300"}`}>
                          {metaTotal > 0 ? fmt(metaTotal) : "—"}
                          <span className="ml-1 text-[10px] text-gray-300">▾</span>
                        </button>
                        {desglosado && Math.round(sumaSku) !== Math.round(metaTotal) && (
                          <div className="mt-0.5 text-[10px] text-ambar" title="La meta total no coincide con la suma de SKU: corre la migración 0023 o vuelve a guardar un SKU">
                            SKU suman {fmt(sumaSku)}
                          </div>
                        )}
                      </td>
                    )}
                    {ver("ped_comprometido") && <td className="px-3 py-3 text-right text-gray-500">{Number(fp.ped_comprometido) > 0 ? fmt(fp.ped_comprometido) : "—"}</td>}
                    {ver("ped_ingresado") && <td className="px-3 py-3 text-right text-gray-500">{Number(fp.ped_ingresado) > 0 ? fmt(fp.ped_ingresado) : "—"}</td>}
                    {ver("facturado") && (
                      <td className="px-3 py-3 text-right text-gray-700" title={fp.venta_cargada ? `Venta real cargada del bottler${Number(fp.ped_facturado) > 0 ? ` · pedidos facturados: ${fmt(fp.ped_facturado)}` : ""}` : "Pedidos marcados facturados (el bottler aún no carga este mes)"}>
                        {facturadoDe(fp) > 0 ? fmt(facturadoDe(fp)) : "—"}
                        {fp.venta_cargada && <span className="ml-1 text-[9px] text-verde" title="Venta real del bottler">●</span>}
                      </td>
                    )}
                    {ver("brecha") && (() => { const b = brechaDe(fp, metaTotal); return (
                      <td className={`px-3 py-3 text-right font-medium ${metaTotal <= 0 ? "text-gray-300" : b <= 0 ? "text-verde" : "text-ambar"}`}>
                        {metaTotal > 0 ? fmt(b) : "—"}
                      </td>
                    ); })()}
                    {ver("meta_uc") && (
                      <td className="px-3 py-3 text-right text-gray-500">
                        {metaTotal > 0 ? (unidad === "UC" ? formatoUnidad(metaTotal, "EU") : edicion.uc) : "—"}
                      </td>
                    )}
                  </tr>

                  {abierto && (items === "cargando" || items === undefined) && (
                    <tr className="bg-gray-50/60"><td colSpan={numCols} className="px-5 py-3 text-xs text-gray-400">Cargando compra por SKU…</td></tr>
                  )}

                  {abierto && Array.isArray(items) && (
                    <>
                      <tr className="bg-gray-50/60 text-[11px] text-gray-400">
                        {Array.from({ length: relleno }, (_, i) => <td key={i} />)}
                        {([["sku", "SKU"], ["eus_a", etiquetas.a], ["eus_b", etiquetas.b], ["eus_c", etiquetas.c], ["eus_d", `${etiquetas.d} (LY)`], ["meta_eus", unidad === "UC" ? "Meta SKU (UC)" : "Meta SKU (EU)"]] as [ColumnaDetalle, string][])
                          .filter(([col]) => col === "sku" || ver(col as ColumnaOcultable))
                          .map(([col, et]) => (
                          <td key={col} onClick={() => ordenarDetalle(col)} className={`cursor-pointer select-none px-3 py-1.5 font-medium hover:text-gray-600 ${col === "sku" ? "" : "text-right"}`}>
                            {et}{indicador(ordenDet === col, ascDet)}
                          </td>
                        ))}
                        {ver("ped_comprometido") && <td />}{ver("ped_ingresado") && <td />}{ver("facturado") && <td />}{ver("brecha") && <td />}
                        {ver("meta_uc") && <td className="px-3 py-1.5 text-right font-medium">{unidad === "UC" ? "Meta SKU (EU)" : "UC"}</td>}
                      </tr>
                      {[...items]
                        .sort((x, y) => comparar(valorDetalle(x, ordenDet), valorDetalle(y, ordenDet), ascDet))
                        .map((it) => {
                          const k = claveSku(f.cliente_id, it.marca, it.formato);
                          const txt = skuEdits[k] ?? (it.meta_eus > 0 ? String(Math.round(it.meta_eus)) : "");
                          const n = Number(txt.replace(",", "."));
                          return (
                            <tr key={k} className="bg-gray-50/60 text-xs">
                              {Array.from({ length: relleno }, (_, i) => <td key={i} />)}
                              <td className="px-3 py-1.5 text-gray-700">
                                {it.marca}
                                {it.formato && <span className="text-gray-400"> · {it.formato}</span>}
                                {it.categoria && <span className="ml-1.5 text-[10px] text-gray-300">{it.categoria}</span>}
                              </td>
                              {ver("eus_a") && <td className="px-3 py-1.5 text-right text-gray-600">{fmt(it.eus_a)}</td>}
                              {ver("eus_b") && <td className="px-3 py-1.5 text-right text-gray-600">{fmt(it.eus_b)}</td>}
                              {ver("eus_c") && <td className="px-3 py-1.5 text-right text-gray-600">{fmt(it.eus_c)}</td>}
                              {ver("eus_d") && <td className="px-3 py-1.5 text-right text-gray-400">{fmt(it.eus_d)}</td>}
                              {ver("meta_eus") && <td className="px-3 py-1.5 text-right">
                                <input
                                  value={txt}
                                  onChange={(e) => setSkuEdits((p) => ({ ...p, [k]: e.target.value }))}
                                  onBlur={() => guardarSku(f.cliente_id, it.marca, it.formato)}
                                  placeholder="—"
                                  inputMode="decimal"
                                  className="w-16 rounded-lg border border-gray-200 px-2 py-0.5 text-right text-xs outline-none focus:border-verde"
                                />
                                {guardando[k] && <span className="ml-1 text-[10px] text-gray-400">…</span>}
                              </td>}
                              {ver("ped_comprometido") && <td />}{ver("ped_ingresado") && <td />}{ver("facturado") && <td />}{ver("brecha") && <td />}
                              {ver("meta_uc") && <td className="px-3 py-1.5 text-right text-gray-400">{Number.isFinite(n) && n > 0 ? eusAUc(n) : "—"}</td>}
                            </tr>
                          );
                        })}
                      <tr className="bg-gray-50/60 text-xs">
                        {Array.from({ length: relleno }, (_, i) => <td key={i} />)}
                        <td colSpan={numCols - relleno} className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <select value={nuevoSku[f.cliente_id] ?? ""} onChange={(e) => setNuevoSku((p) => ({ ...p, [f.cliente_id]: e.target.value }))} className={selectCls}>
                              <option value="">+ Agregar SKU a la meta…</option>
                              {catalogo.map((c) => (
                                <option key={`${c.marca}|${c.formato}`} value={`${c.marca}|${c.formato}`}>{c.marca}{c.formato ? ` · ${c.formato}` : ""}</option>
                              ))}
                            </select>
                            <button onClick={() => agregarSku(f.cliente_id)} disabled={!nuevoSku[f.cliente_id]} className="rounded-lg bg-verde px-2 py-1 text-xs font-medium text-white disabled:opacity-40">Agregar</button>
                            <span className="text-[11px] text-gray-400">La meta del cliente es la suma de estas líneas. “Sin desglose” es lo que aún no está repartido por SKU: bájalo a medida que asignes.</span>
                          </div>
                        </td>
                      </tr>
                    </>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            {(() => {
              const vis = visibles.map(conPedidos);
              const sum = (fn: (f: MetaClienteRow) => number) => vis.reduce((s, f) => s + fn(f), 0);
              const metaDe = (f: MetaClienteRow) => Number(ediciones[f.cliente_id]?.eus ?? f.meta_eus) || 0;
              const cell = "px-3 py-3 text-right";
              return (
                <tr className="border-t border-gray-200 bg-gray-50/60 text-xs font-medium text-gray-700">
                  <td />
                  {ver("cod") && <td />}{ver("bottler") && <td />}{ver("zona") && <td />}{ver("desarrollador") && <td />}
                  <td className="px-3 py-3">Total ({vis.length})</td>
                  {ver("eus_a") && <td className={cell}>{fmt(sum((f) => Number(f.eus_a)))}</td>}
                  {ver("eus_b") && <td className={cell}>{fmt(sum((f) => Number(f.eus_b)))}</td>}
                  {ver("eus_c") && <td className={cell}>{fmt(sum((f) => Number(f.eus_c)))}</td>}
                  {ver("eus_d") && <td className={`${cell} text-gray-500`}>{fmt(sum((f) => Number(f.eus_d)))}</td>}
                  {ver("meta_eus") && <td className={cell}>{fmt(sum(metaDe))}</td>}
                  {ver("ped_comprometido") && <td className={`${cell} text-gray-500`}>{fmt(sum((f) => Number(f.ped_comprometido)))}</td>}
                  {ver("ped_ingresado") && <td className={`${cell} text-gray-500`}>{fmt(sum((f) => Number(f.ped_ingresado)))}</td>}
                  {ver("facturado") && <td className={cell}>{fmt(sum(facturadoDe))}</td>}
                  {ver("brecha") && <td className={`${cell} ${sum((f) => brechaDe(f, metaDe(f))) <= 0 ? "text-verde" : "text-ambar"}`}>{fmt(sum((f) => brechaDe(f, metaDe(f))))}</td>}
                  {ver("meta_uc") && <td className={`${cell} text-gray-500`}>{unidad === "UC" ? formatoUnidad(sum(metaDe), "EU") : eusAUc(sum(metaDe))}</td>}
                </tr>
              );
            })()}
          </tfoot>
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
          onPedidos={(clienteId, sumas) => setPedidosLocal((p) => ({ ...p, [clienteId]: sumas }))}
        />
      )}
    </div>
  );
}
