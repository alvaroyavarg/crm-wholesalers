"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { crearNota, guardarMetaSku } from "@/app/(app)/actions";
import {
  cambiarEstadoPedido,
  cargarPanelCliente,
  cerrarCompromiso,
  crearPedido,
  eliminarPedido,
  recomendarSkusMeta,
} from "@/app/(app)/meta/panel-actions";
import { Chip } from "@/components/ui/Chip";
import { FACTOR_UC_EU } from "@/lib/importar/unidades";
import { formatEUs } from "@/lib/metrics";
import type {
  DetalleMetaItem,
  EstadoPedido,
  MetaClienteRow,
  Nota,
  Pedido,
  PropuestaSku,
  SkuCatalogo,
  TipoNota,
} from "@/lib/types";

// Panel lateral derecho de la vista Meta: todo lo del cliente en un lugar
// para planificar el mes — historia por SKU, copiloto (propuesta de SKU +
// chat en contexto), bitácora y pedidos ingresados a mano.

interface Periodo {
  fy: number;
  periodo: number;
}

interface Props {
  fila: MetaClienteRow;
  fyMeta: number;
  periodoMeta: number;
  etiquetas: { a: string; b: string; c: string; d: string };
  periodos: { a: Periodo; b: Periodo; c: Periodo; d: Periodo };
  catalogo: SkuCatalogo[];
  metaActual: number; // meta total viva (puede estar editándose en la tabla)
  onClose: () => void;
  onMetaSku: (clienteId: string, marca: string, formato: string, eus: number, total: number) => void;
}

type Tab = "historia" | "copiloto" | "bitacora" | "pedidos";

const TIPOS: { valor: TipoNota; etiqueta: string; icono: string }[] = [
  { valor: "visita", etiqueta: "Visita", icono: "🚗" },
  { valor: "llamada", etiqueta: "Llamada", icono: "📞" },
  { valor: "acuerdo", etiqueta: "Acuerdo", icono: "🤝" },
  { valor: "rechazo", etiqueta: "Rechazo", icono: "🚫" },
  { valor: "nota", etiqueta: "Nota", icono: "📝" },
  { valor: "compromiso", etiqueta: "Compromiso", icono: "📌" },
  { valor: "idea", etiqueta: "Idea", icono: "💡" },
];
const iconoTipo = (t: string) => TIPOS.find((x) => x.valor === t)?.icono ?? "📝";

const ESTADOS: { valor: EstadoPedido; etiqueta: string; variante: "gris" | "azul" | "verde" }[] = [
  { valor: "comprometido", etiqueta: "Comprometido", variante: "gris" },
  { valor: "ingresado", etiqueta: "Ingresado", variante: "azul" },
  { valor: "facturado", etiqueta: "Facturado", variante: "verde" },
];

interface MensajeChat {
  role: "user" | "assistant";
  content: string;
}

function etiquetaBottler(b: string | null) {
  return b === "KOA" ? "Andina" : b === "KOE" ? "Embonor" : "—";
}
function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fechaCorta(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
}

// Render mínimo de markdown (viñetas y negrita) para el chat
function Texto({ texto }: { texto: string }) {
  const bold = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((f, j) =>
      f.startsWith("**") && f.endsWith("**") ? <strong key={j}>{f.slice(2, -2)}</strong> : <span key={j}>{f}</span>,
    );
  return (
    <div className="space-y-1 text-xs leading-relaxed">
      {texto.split("\n").map((l, i) => {
        const t = l.trim();
        if (!t) return <div key={i} className="h-1" />;
        if (/^[-*•]\s/.test(t))
          return (
            <div key={i} className="flex gap-1.5">
              <span className="text-verde">•</span>
              <span>{bold(t.replace(/^[-*•]\s/, ""))}</span>
            </div>
          );
        return <p key={i}>{bold(t)}</p>;
      })}
    </div>
  );
}

export function PanelCliente({ fila, fyMeta, periodoMeta, etiquetas, periodos, catalogo, metaActual, onClose, onMetaSku }: Props) {
  const [tab, setTab] = useState<Tab>("historia");
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [detalle, setDetalle] = useState<DetalleMetaItem[]>([]);
  const [notas, setNotas] = useState<Nota[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [perfil, setPerfil] = useState<{ decisor: string | null; estilo_negociacion: string | null; frecuencia_compra: string | null; resumen: string | null } | null>(null);
  const [, startTransition] = useTransition();

  // ---- copiloto ----
  const [propuestas, setPropuestas] = useState<PropuestaSku[]>([]);
  const [resumenPropuesta, setResumenPropuesta] = useState("");
  const [recomendando, setRecomendando] = useState(false);
  const [errorReco, setErrorReco] = useState("");
  const [usando, setUsando] = useState<Record<string, boolean>>({});
  const [metaSkuEdits, setMetaSkuEdits] = useState<Record<string, string>>({});
  const [guardandoSku, setGuardandoSku] = useState<Record<string, boolean>>({});
  const [usados, setUsados] = useState<Record<string, boolean>>({});
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [conversacionId, setConversacionId] = useState<string | null>(null);
  const [inputChat, setInputChat] = useState("");
  const [chateando, setChateando] = useState(false);
  const [errorChat, setErrorChat] = useState("");
  const finChatRef = useRef<HTMLDivElement>(null);

  // ---- bitácora ----
  const [tipoNota, setTipoNota] = useState<TipoNota>("nota");
  const [textoNota, setTextoNota] = useState("");
  const [venceNota, setVenceNota] = useState("");
  const [guardandoNota, setGuardandoNota] = useState(false);
  const [errorNota, setErrorNota] = useState("");

  // ---- pedidos ----
  const [pFecha, setPFecha] = useState(hoyISO());
  const [pSku, setPSku] = useState("");
  const [pMarcaLibre, setPMarcaLibre] = useState("");
  const [pCantidad, setPCantidad] = useState("");
  const [pUnidad, setPUnidad] = useState<"UC" | "EU">("UC");
  const [pEstado, setPEstado] = useState<EstadoPedido>("ingresado");
  const [pComentario, setPComentario] = useState("");
  const [guardandoPedido, setGuardandoPedido] = useState(false);
  const [errorPedido, setErrorPedido] = useState("");

  const clienteId = fila.cliente_id;
  const nombre = fila.nombre_corto ?? fila.nombre;
  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setErrorCarga("");
    setTab("historia");
    setPropuestas([]);
    setResumenPropuesta("");
    setUsados({});
    setMensajes([]);
    setConversacionId(null);
    cargarPanelCliente({ clienteId, fyMeta, periodoMeta, periodos })
      .then((r) => {
        if (!vivo) return;
        setDetalle(r.detalle);
        setNotas(r.notas);
        setPedidos(r.pedidos);
        setPerfil(r.perfil);
        setPropuestas(r.propuestas);
        setResumenPropuesta(r.resumenPropuesta);
        if (r.conversacion) {
          setConversacionId(r.conversacion.id);
          setMensajes(r.conversacion.mensajes);
        }
      })
      .catch((e) => vivo && setErrorCarga(e instanceof Error ? e.message : "Error al cargar"))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, fyMeta, periodoMeta]);

  // cerrar con Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // ---- historia: señales ----
  const historia = useMemo(() => {
    return [...detalle]
      .map((it) => {
        const ea = Number(it.eus_a), eb = Number(it.eus_b), ec = Number(it.eus_c), ed = Number(it.eus_d);
        const reciente = (ea + eb + ec) / 3;
        let senal: { texto: string; variante: "rojo" | "ambar" | "verde" | "gris" } | null = null;
        if (ed > 0 && ea + eb + ec === 0) senal = { texto: "compraba LY", variante: "rojo" };
        else if (ed > 0 && reciente < ed * 0.67) senal = { texto: "cae vs LY", variante: "ambar" };
        else if (ed === 0 && ec > 0) senal = { texto: "nuevo", variante: "verde" };
        else if (ec === 0 && (ea > 0 || eb > 0)) senal = { texto: "sin compra últ. mes", variante: "gris" };
        return { ...it, senal, total: ea + eb + ec + ed + Number(it.meta_eus) };
      })
      .sort((x, y) => y.total - x.total);
  }, [detalle]);
  const totales = useMemo(
    () => ({
      a: Number(fila.eus_a),
      b: Number(fila.eus_b),
      c: Number(fila.eus_c),
      d: Number(fila.eus_d),
    }),
    [fila],
  );
  const sumaSku = detalle.reduce((s, it) => s + Number(it.meta_eus), 0);
  const pedidosEnCurso = pedidos.filter((p) => p.estado !== "facturado").reduce((s, p) => s + Number(p.eus), 0);
  const pedidosTotal = pedidos.reduce((s, p) => s + Number(p.eus), 0);
  const compromisosPendientes = notas.filter((n) => n.tipo === "compromiso" && !n.cerrada_at);

  // ---- copiloto: propuesta ----
  async function recomendar() {
    setRecomendando(true);
    setErrorReco("");
    try {
      const r = await recomendarSkusMeta({ clienteId, fyMeta, periodoMeta });
      if (!r.ok) {
        setErrorReco(r.error);
        return;
      }
      setPropuestas(r.propuestas);
      setResumenPropuesta(r.resumen);
      setUsados({});
    } catch (e) {
      setErrorReco(e instanceof Error ? e.message : "Error del copiloto");
    } finally {
      setRecomendando(false);
    }
  }
  async function usarPropuesta(p: PropuestaSku) {
    const k = `${p.marca}|${p.formato}`;
    setUsando((x) => ({ ...x, [k]: true }));
    try {
      const total = await guardarMetaSku({ clienteId, anioFiscal: fyMeta, periodo: periodoMeta, marca: p.marca, formato: p.formato, eus: p.eus });
      setDetalle((d) => {
        const existe = d.some((it) => it.marca === p.marca && it.formato === p.formato);
        return existe
          ? d.map((it) => (it.marca === p.marca && it.formato === p.formato ? { ...it, meta_eus: p.eus } : it))
          : [...d, { categoria: "", marca: p.marca, formato: p.formato, eus_a: 0, eus_b: 0, eus_c: 0, eus_d: 0, meta_eus: p.eus }];
      });
      setUsados((x) => ({ ...x, [k]: true }));
      onMetaSku(clienteId, p.marca, p.formato, p.eus, total);
    } catch (e) {
      setErrorReco(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setUsando((x) => ({ ...x, [k]: false }));
    }
  }

  // ---- historia: meta por SKU editable desde el panel ----
  async function guardarMetaSkuPanel(it: DetalleMetaItem) {
    const k = `${it.marca}|${it.formato}`;
    const txt = metaSkuEdits[k];
    if (txt === undefined) return;
    const eus = txt.trim() === "" ? 0 : Number(txt.replace(",", "."));
    if (!Number.isFinite(eus) || eus < 0 || eus === Number(it.meta_eus)) return;
    setGuardandoSku((x) => ({ ...x, [k]: true }));
    try {
      const total = await guardarMetaSku({ clienteId, anioFiscal: fyMeta, periodo: periodoMeta, marca: it.marca, formato: it.formato, eus });
      setDetalle((d) => d.map((x) => (x.marca === it.marca && x.formato === it.formato ? { ...x, meta_eus: eus } : x)));
      onMetaSku(clienteId, it.marca, it.formato, eus, total);
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : "No se pudo guardar la meta del SKU");
    } finally {
      setGuardandoSku((x) => ({ ...x, [k]: false }));
    }
  }

  // ---- copiloto: chat en contexto ----
  async function enviarChat(texto: string) {
    const pregunta = texto.trim();
    if (!pregunta || chateando) return;
    setErrorChat("");
    setInputChat("");
    const contexto =
      mensajes.length === 0
        ? `[Contexto: estoy en la vista Meta planificando el mes fy=${fyMeta} periodo=${periodoMeta} para ${nombre} (id: ${clienteId}). Usa get_historia_sku_meta con ese fy/periodo cuando corresponda.]\n`
        : "";
    const nuevos: MensajeChat[] = [...mensajes, { role: "user", content: contexto + pregunta }];
    setMensajes(nuevos);
    setChateando(true);
    setTimeout(() => finChatRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    try {
      const res = await fetch("/api/copiloto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensajes: nuevos, cliente_id: clienteId, conversacion_id: conversacionId }),
      });
      const crudo = await res.text();
      let data: { texto?: string; error?: string; conversacion_id?: string | null };
      try {
        data = JSON.parse(crudo);
      } catch {
        throw new Error(res.ok ? "Respuesta inválida del servidor." : `El copiloto tardó demasiado o falló (HTTP ${res.status}).`);
      }
      if (!res.ok || !data.texto) throw new Error(data.error ?? "Error del copiloto");
      setMensajes([...nuevos, { role: "assistant", content: data.texto }]);
      if (data.conversacion_id) setConversacionId(data.conversacion_id);
    } catch (e) {
      setErrorChat(e instanceof Error ? e.message : "Error");
    } finally {
      setChateando(false);
      setTimeout(() => finChatRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  // ---- bitácora ----
  async function guardarNota() {
    setErrorNota("");
    if (!textoNota.trim()) {
      setErrorNota("Escribe la nota.");
      return;
    }
    setGuardandoNota(true);
    try {
      await crearNota({ clienteId, tipo: tipoNota, contenido: textoNota, vence: tipoNota === "compromiso" ? venceNota || null : null });
      setNotas((n) => [
        {
          id: `tmp-${Date.now()}`,
          cliente_id: clienteId,
          fecha: new Date().toISOString(),
          tipo: tipoNota,
          contenido_raw: textoNota.trim(),
          contenido_estructurado: null,
          creado_por_agente: false,
          vence: tipoNota === "compromiso" ? venceNota || null : null,
          cerrada_at: null,
        },
        ...n,
      ]);
      setTextoNota("");
      setVenceNota("");
      // recargar ids reales en segundo plano
      startTransition(async () => {
        const r = await cargarPanelCliente({ clienteId, fyMeta, periodoMeta, periodos });
        setNotas(r.notas);
      });
    } catch (e) {
      setErrorNota(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setGuardandoNota(false);
    }
  }
  async function toggleCompromiso(n: Nota) {
    const cumplido = !n.cerrada_at;
    setNotas((ns) => ns.map((x) => (x.id === n.id ? { ...x, cerrada_at: cumplido ? new Date().toISOString() : null } : x)));
    if (!n.id.startsWith("tmp-")) await cerrarCompromiso(n.id, cumplido);
  }

  // ---- pedidos ----
  const cantidadNum = Number(pCantidad.replace(",", "."));
  const eusPreview = Number.isFinite(cantidadNum) && cantidadNum > 0 ? (pUnidad === "UC" ? cantidadNum * FACTOR_UC_EU : cantidadNum) : 0;
  async function guardarPedido() {
    setErrorPedido("");
    const [marcaSel, formatoSel] = pSku === "__otro__" ? [pMarcaLibre, ""] : pSku.split("|");
    if (!marcaSel?.trim()) {
      setErrorPedido("Elige el SKU.");
      return;
    }
    if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) {
      setErrorPedido("Ingresa la cantidad.");
      return;
    }
    setGuardandoPedido(true);
    try {
      const nuevo = await crearPedido({
        clienteId,
        fecha: pFecha,
        bottler: fila.bottler,
        marca: marcaSel,
        formato: formatoSel ?? "",
        cantidad: cantidadNum,
        unidad: pUnidad,
        estado: pEstado,
        comentario: pComentario,
      });
      if (nuevo.anio_fiscal === fyMeta && nuevo.periodo === periodoMeta) setPedidos((p) => [nuevo, ...p]);
      setPCantidad("");
      setPComentario("");
    } catch (e) {
      setErrorPedido(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setGuardandoPedido(false);
    }
  }
  async function cambiarEstado(p: Pedido, estado: EstadoPedido) {
    setPedidos((ps) => ps.map((x) => (x.id === p.id ? { ...x, estado } : x)));
    await cambiarEstadoPedido(p.id, estado);
  }
  async function borrarPedido(p: Pedido) {
    setPedidos((ps) => ps.filter((x) => x.id !== p.id));
    await eliminarPedido(p.id);
  }

  const tabs: { id: Tab; etiqueta: string; badge?: number }[] = [
    { id: "historia", etiqueta: "Historia" },
    { id: "copiloto", etiqueta: "Copiloto", badge: propuestas.length || undefined },
    { id: "bitacora", etiqueta: "Bitácora", badge: compromisosPendientes.length || undefined },
    { id: "pedidos", etiqueta: "Pedidos", badge: pedidos.length || undefined },
  ];
  const inputCls = "w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-verde";
  const avancePct = metaActual > 0 ? Math.min(100, (pedidosTotal / metaActual) * 100) : null;

  return (
    <aside className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-[560px] flex-col border-l border-gray-200 bg-white shadow-2xl">
      {/* ---- Cabecera ---- */}
      <div className="border-b border-gray-100 px-5 pb-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate font-display text-lg font-semibold text-gray-900">{nombre}</h2>
              {fila.es_otros ? <Chip variante="gris">Otros</Chip> : fila.segmento === "TOP3" ? <Chip variante="azul">TOP3</Chip> : null}
              {fila.es_frontera && <Chip variante="ambar">frontera</Chip>}
            </div>
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {fila.cod_diageo ? <span className="font-mono">{fila.cod_diageo} · </span> : null}
              {etiquetaBottler(fila.bottler)}
              {fila.zona ? ` · ${fila.zona}` : ""}
              {fila.desarrollador ? ` · ${fila.desarrollador}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!fila.es_otros && (
              <Link href={`/clientes/${clienteId}`} className="text-xs text-gray-500 hover:text-verde">
                Ficha completa ↗
              </Link>
            )}
            <button onClick={onClose} title="Cerrar (Esc)" className="rounded-lg px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
              ✕
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-5 gap-2 text-center">
          {[
            [etiquetas.a, totales.a],
            [etiquetas.b, totales.b],
            [etiquetas.c, totales.c],
            [`${etiquetas.d} LY`, totales.d],
          ].map(([et, v]) => (
            <div key={String(et)} className="rounded-lg bg-gray-50 px-2 py-1.5">
              <p className="text-[10px] text-gray-400">{et}</p>
              <p className="text-sm font-medium text-gray-800">{formatEUs(Number(v))}</p>
            </div>
          ))}
          <div className="rounded-lg bg-verde-suave px-2 py-1.5">
            <p className="text-[10px] text-verde">Meta</p>
            <p className="text-sm font-semibold text-verde">{metaActual > 0 ? formatEUs(metaActual) : "—"}</p>
          </div>
        </div>
        {avancePct != null && pedidosTotal > 0 && (
          <div className="mt-2">
            <div className="h-1.5 w-full rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-verde" style={{ width: `${avancePct}%` }} />
            </div>
            <p className="mt-1 text-[10px] text-gray-400">
              Pedidos registrados {formatEUs(pedidosTotal)} EUs · {Math.round(avancePct)}% de la meta
              {pedidosEnCurso > 0 ? ` · ${formatEUs(pedidosEnCurso)} aún no facturados` : ""}
            </p>
          </div>
        )}

        <div className="mt-3 flex gap-1 rounded-lg bg-gray-50 p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${tab === t.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
            >
              {t.etiqueta}
              {t.badge ? <span className="ml-1 rounded-full bg-verde-suave px-1.5 text-[10px] text-verde">{t.badge}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Cuerpo ---- */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {cargando ? (
          <p className="text-xs text-gray-400">Cargando…</p>
        ) : errorCarga ? (
          <p className="rounded-lg bg-rojo-suave px-3 py-2 text-xs text-rojo">{errorCarga}</p>
        ) : tab === "historia" ? (
          <div>
            {perfil?.resumen && (
              <p className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                <span className="font-medium text-gray-700">Perfil:</span> {perfil.resumen}
                {perfil.decisor ? ` · Decisor: ${perfil.decisor}` : ""}
              </p>
            )}
            {historia.length === 0 ? (
              <p className="text-xs text-gray-400">Sin compra en estos períodos.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-[10px] text-gray-400">
                    <th className="py-1.5 text-left font-medium">SKU</th>
                    <th className="hidden py-1.5 text-right font-medium sm:table-cell">{etiquetas.a}</th>
                    <th className="hidden py-1.5 text-right font-medium sm:table-cell">{etiquetas.b}</th>
                    <th className="py-1.5 text-right font-medium">{etiquetas.c}</th>
                    <th className="py-1.5 text-right font-medium">{etiquetas.d} LY</th>
                    <th className="py-1.5 text-right font-medium text-verde">Meta</th>
                  </tr>
                </thead>
                <tbody>
                  {historia.map((it) => (
                    <tr key={`${it.marca}|${it.formato}`} className="border-b border-gray-50 last:border-0">
                      <td className="py-1.5 pr-2">
                        <div className="text-gray-800">
                          {it.marca}
                          {it.formato && <span className="text-gray-400"> · {it.formato}</span>}
                        </div>
                        {it.senal && (
                          <span className="inline-block">
                            <Chip variante={it.senal.variante}>{it.senal.texto}</Chip>
                          </span>
                        )}
                      </td>
                      <td className="hidden py-1.5 text-right text-gray-600 sm:table-cell">{formatEUs(Number(it.eus_a))}</td>
                      <td className="hidden py-1.5 text-right text-gray-600 sm:table-cell">{formatEUs(Number(it.eus_b))}</td>
                      <td className="py-1.5 text-right text-gray-600">{formatEUs(Number(it.eus_c))}</td>
                      <td className="py-1.5 text-right text-gray-400">{formatEUs(Number(it.eus_d))}</td>
                      <td className="py-1.5 pl-2 text-right">
                        {fila.es_otros ? (
                          <span className="font-medium text-verde">{Number(it.meta_eus) > 0 ? formatEUs(Number(it.meta_eus)) : "—"}</span>
                        ) : (
                          <input
                            value={metaSkuEdits[`${it.marca}|${it.formato}`] ?? (Number(it.meta_eus) > 0 ? String(Math.round(Number(it.meta_eus))) : "")}
                            onChange={(e) => setMetaSkuEdits((m) => ({ ...m, [`${it.marca}|${it.formato}`]: e.target.value }))}
                            onBlur={() => guardarMetaSkuPanel(it)}
                            placeholder="—"
                            inputMode="decimal"
                            title="Meta de este SKU (EUs). Al guardar, la meta total pasa a ser la suma de los SKU."
                            className={`w-16 rounded-md border border-gray-200 px-1.5 py-0.5 text-right text-xs font-medium text-verde outline-none focus:border-verde ${guardandoSku[`${it.marca}|${it.formato}`] ? "opacity-50" : ""}`}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="text-[11px] font-medium text-gray-700">
                    <td className="pt-2">Total</td>
                    <td className="hidden pt-2 text-right sm:table-cell">{formatEUs(totales.a)}</td>
                    <td className="hidden pt-2 text-right sm:table-cell">{formatEUs(totales.b)}</td>
                    <td className="pt-2 text-right">{formatEUs(totales.c)}</td>
                    <td className="pt-2 text-right text-gray-400">{formatEUs(totales.d)}</td>
                    <td className="pt-2 text-right text-verde">{sumaSku > 0 ? formatEUs(sumaSku) : "—"}</td>
                  </tr>
                </tfoot>
              </table>
            )}
            <p className="mt-3 text-[10px] text-gray-400">
              La columna Meta se edita aquí mismo (EUs por SKU). En pantalla chica se ocultan {etiquetas.a} y {etiquetas.b}; gira el teléfono para verlos.
              {" "}Señales: <b>compraba LY</b> = tenía compra el mismo mes del año pasado y nada en los últimos 3 meses ·{" "}
              <b>cae vs LY</b> = promedio de los últimos 3 meses bajo dos tercios del LY · <b>nuevo</b> = compra este año sin LY.
            </p>
          </div>
        ) : tab === "copiloto" ? (
          <div className="flex h-full flex-col">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs text-gray-500">Propuesta de SKU para la meta, con evidencia de su historia, boletines y bitácora.</p>
              <button
                onClick={recomendar}
                disabled={recomendando}
                className="shrink-0 rounded-lg bg-verde px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {recomendando ? "Analizando…" : propuestas.length ? "↻ Nueva propuesta" : "✨ ¿Qué SKU le ofrezco?"}
              </button>
            </div>
            {errorReco && <p className="mb-2 rounded-lg bg-rojo-suave px-3 py-2 text-xs text-rojo">{errorReco}</p>}
            {recomendando && <p className="mb-2 text-xs text-gray-400">Revisando historia por SKU, boletines vigentes, notas y perfil… puede tardar un minuto.</p>}

            {propuestas.length > 0 && (
              <div className="mb-4">
                {resumenPropuesta && <p className="mb-2 rounded-lg bg-verde-suave px-3 py-2 text-xs text-gray-700">{resumenPropuesta}</p>}
                <ul className="space-y-2">
                  {propuestas.map((p) => {
                    const k = `${p.marca}|${p.formato}`;
                    return (
                      <li key={k} className="rounded-lg border border-gray-100 px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-900">
                              {p.marca}
                              {p.formato && <span className="text-gray-400"> · {p.formato}</span>}
                              <span className="ml-2 text-verde">{formatEUs(p.eus)} EUs</span>
                              <span className="ml-1 text-[10px] text-gray-400">({(p.eus / FACTOR_UC_EU).toFixed(1)} UC)</span>
                            </p>
                            <p className="mt-0.5 text-[11px] text-gray-600">{p.motivo}</p>
                            <span className="mt-1 inline-block">
                              <Chip variante={p.evidencia === "boletin" ? "azul" : p.evidencia === "memoria" ? "ambar" : "gris"}>{p.evidencia}</Chip>
                            </span>
                          </div>
                          <button
                            onClick={() => usarPropuesta(p)}
                            disabled={usando[k] || usados[k]}
                            className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium ${usados[k] ? "bg-verde-suave text-verde" : "border border-gray-200 text-gray-700 hover:border-verde hover:text-verde"} disabled:opacity-60`}
                          >
                            {usados[k] ? "✓ En la meta" : usando[k] ? "…" : "Usar como meta SKU"}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-1.5 text-[10px] text-gray-400">Al usar una propuesta, la meta total del cliente pasa a ser la suma de sus SKU.</p>
              </div>
            )}

            {/* chat en contexto */}
            <div className="mt-auto rounded-lg border border-gray-100">
              <div className="max-h-72 space-y-2 overflow-y-auto p-3">
                {mensajes.length === 0 && (
                  <p className="text-[11px] text-gray-400">Pregúntale algo sobre {nombre}: “¿y si le ofrezco solo Tanqueray?”, “¿qué escalón le queda cerca?”, “¿qué le prometí la última vez?”</p>
                )}
                {mensajes.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[88%] rounded-xl px-3 py-2 ${m.role === "user" ? "bg-verde text-white" : "bg-gray-50 text-gray-800"}`}>
                      {m.role === "assistant" ? <Texto texto={m.content} /> : <p className="text-xs">{m.content.replace(/^\[Contexto:[^\]]*\]\n?/, "")}</p>}
                    </div>
                  </div>
                ))}
                {chateando && <p className="text-[11px] text-gray-400">Analizando…</p>}
                {errorChat && <p className="text-[11px] text-rojo">{errorChat}</p>}
                <div ref={finChatRef} />
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  enviarChat(inputChat);
                }}
                className="flex gap-2 border-t border-gray-100 p-2"
              >
                <input
                  value={inputChat}
                  onChange={(e) => setInputChat(e.target.value)}
                  placeholder={`Pregunta sobre ${nombre}…`}
                  disabled={chateando}
                  className={inputCls}
                />
                <button type="submit" disabled={chateando || !inputChat.trim()} className="rounded-lg bg-verde px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                  Enviar
                </button>
              </form>
            </div>
          </div>
        ) : tab === "bitacora" ? (
          <div>
            <div className="mb-4 rounded-lg border border-gray-100 p-3">
              <div className="mb-2 flex flex-wrap gap-1">
                {TIPOS.map((t) => (
                  <button
                    key={t.valor}
                    onClick={() => setTipoNota(t.valor)}
                    className={`rounded-md px-2 py-1 text-[11px] font-medium ${tipoNota === t.valor ? "bg-verde-suave text-verde ring-1 ring-verde" : "bg-gray-50 text-gray-500 hover:bg-gray-100"}`}
                  >
                    {t.icono} {t.etiqueta}
                  </button>
                ))}
              </div>
              <textarea
                value={textoNota}
                onChange={(e) => setTextoNota(e.target.value)}
                rows={3}
                placeholder={
                  tipoNota === "compromiso"
                    ? "Qué se comprometió (tú o el cliente), con cifras si las hay…"
                    : tipoNota === "idea"
                      ? "Idea para trabajar con este cliente…"
                      : "Qué pasó, acuerdos, precios pedidos, quiebres, próximos pasos…"
                }
                className={inputCls}
              />
              <div className="mt-2 flex items-center gap-2">
                {tipoNota === "compromiso" && (
                  <label className="flex items-center gap-1 text-[11px] text-gray-500">
                    Vence
                    <input type="date" value={venceNota} onChange={(e) => setVenceNota(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1 text-xs" />
                  </label>
                )}
                <button onClick={guardarNota} disabled={guardandoNota} className="ml-auto rounded-lg bg-verde px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                  {guardandoNota ? "Guardando…" : "Guardar"}
                </button>
              </div>
              {errorNota && <p className="mt-2 text-[11px] text-rojo">{errorNota}</p>}
            </div>

            {compromisosPendientes.length > 0 && (
              <div className="mb-4">
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">Compromisos pendientes</p>
                <ul className="space-y-1.5">
                  {compromisosPendientes.map((n) => (
                    <li key={n.id} className="flex items-start gap-2 rounded-lg bg-ambar-suave px-3 py-2">
                      <input type="checkbox" checked={false} onChange={() => toggleCompromiso(n)} title="Marcar cumplido" className="mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-gray-800">{n.contenido_raw}</p>
                        <p className="text-[10px] text-gray-500">
                          {fechaCorta(n.fecha)}
                          {n.vence ? ` · vence ${fechaCorta(n.vence)}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {notas.length === 0 ? (
              <p className="text-xs text-gray-400">Sin notas todavía.</p>
            ) : (
              <ul className="space-y-2">
                {notas
                  .filter((n) => !(n.tipo === "compromiso" && !n.cerrada_at))
                  .map((n) => (
                    <li key={n.id} className="flex gap-2 border-b border-gray-50 pb-2 last:border-0">
                      <span className="text-sm">{iconoTipo(n.tipo)}</span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-xs text-gray-800 ${n.cerrada_at ? "line-through text-gray-400" : ""}`}>{n.contenido_raw}</p>
                        <p className="text-[10px] text-gray-400">
                          {fechaCorta(n.fecha)} · {n.tipo}
                          {n.creado_por_agente ? " · copiloto" : ""}
                          {n.cerrada_at ? " · cumplido" : ""}
                          {n.tipo === "compromiso" && n.cerrada_at && (
                            <button onClick={() => toggleCompromiso(n)} className="ml-2 text-gray-400 hover:text-gray-700">
                              reabrir
                            </button>
                          )}
                        </p>
                        {n.contenido_estructurado?.proximos_pasos && n.contenido_estructurado.proximos_pasos.length > 0 && (
                          <p className="mt-0.5 text-[10px] text-gray-500">→ {n.contenido_estructurado.proximos_pasos.join(" · ")}</p>
                        )}
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        ) : (
          <div>
            <div className="mb-4 rounded-lg border border-gray-100 p-3">
              <p className="mb-2 text-[11px] text-gray-500">
                Registra una compra que ya ingresaste o que el cliente comprometió. No modifica la venta del bottler: es avance en curso hasta que llegue el archivo.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-gray-500">
                  Fecha
                  <input type="date" value={pFecha} onChange={(e) => setPFecha(e.target.value)} className={inputCls} />
                </label>
                <label className="text-[11px] text-gray-500">
                  Estado
                  <select value={pEstado} onChange={(e) => setPEstado(e.target.value as EstadoPedido)} className={inputCls}>
                    {ESTADOS.map((s) => (
                      <option key={s.valor} value={s.valor}>{s.etiqueta}</option>
                    ))}
                  </select>
                </label>
                <label className="col-span-2 text-[11px] text-gray-500">
                  SKU
                  <select value={pSku} onChange={(e) => setPSku(e.target.value)} className={inputCls}>
                    <option value="">Elige un SKU…</option>
                    {catalogo.map((c) => (
                      <option key={`${c.marca}|${c.formato}`} value={`${c.marca}|${c.formato}`}>
                        {c.marca}{c.formato ? ` · ${c.formato}` : ""}
                      </option>
                    ))}
                    <option value="__otro__">Otro (escribir)…</option>
                  </select>
                  {pSku === "__otro__" && (
                    <input value={pMarcaLibre} onChange={(e) => setPMarcaLibre(e.target.value)} placeholder="Marca y formato" className={`${inputCls} mt-1`} />
                  )}
                </label>
                <label className="text-[11px] text-gray-500">
                  Cantidad
                  <div className="flex gap-1">
                    <input value={pCantidad} onChange={(e) => setPCantidad(e.target.value)} inputMode="decimal" placeholder="0" className={inputCls} />
                    <select value={pUnidad} onChange={(e) => setPUnidad(e.target.value as "UC" | "EU")} className="rounded-lg border border-gray-200 px-2 text-xs">
                      <option value="UC">UC</option>
                      <option value="EU">EU</option>
                    </select>
                  </div>
                  {eusPreview > 0 && (
                    <span className="text-[10px] text-gray-400">
                      = {pUnidad === "UC" ? `${formatEUs(eusPreview)} EUs` : `${(eusPreview / FACTOR_UC_EU).toFixed(1)} UC`}
                    </span>
                  )}
                </label>
                <label className="text-[11px] text-gray-500">
                  Comentario
                  <input value={pComentario} onChange={(e) => setPComentario(e.target.value)} placeholder="opcional" className={inputCls} />
                </label>
              </div>
              <div className="mt-2 flex items-center justify-end gap-2">
                {errorPedido && <p className="mr-auto text-[11px] text-rojo">{errorPedido}</p>}
                <button onClick={guardarPedido} disabled={guardandoPedido} className="rounded-lg bg-verde px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                  {guardandoPedido ? "Guardando…" : "Registrar pedido"}
                </button>
              </div>
            </div>

            {pedidos.length === 0 ? (
              <p className="text-xs text-gray-400">Sin pedidos registrados para este mes.</p>
            ) : (
              <ul className="space-y-1.5">
                {pedidos.map((p) => {
                  const est = ESTADOS.find((s) => s.valor === p.estado) ?? ESTADOS[1];
                  return (
                    <li key={p.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-gray-800">
                          {p.marca}
                          {p.formato && <span className="text-gray-400"> · {p.formato}</span>}
                          <span className="ml-2 font-medium text-gray-900">{formatEUs(Number(p.eus))} EUs</span>
                          {p.uc != null && <span className="ml-1 text-[10px] text-gray-400">({Number(p.uc).toFixed(1)} UC)</span>}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {fechaCorta(p.fecha)}
                          {p.comentario ? ` · ${p.comentario}` : ""}
                        </p>
                      </div>
                      <select
                        value={p.estado}
                        onChange={(e) => cambiarEstado(p, e.target.value as EstadoPedido)}
                        className={`rounded-md border-0 px-1.5 py-0.5 text-[10px] font-medium ${est.variante === "verde" ? "bg-verde-suave text-verde" : est.variante === "azul" ? "bg-azul-suave text-azul" : "bg-gray-100 text-gray-600"}`}
                      >
                        {ESTADOS.map((s) => (
                          <option key={s.valor} value={s.valor}>{s.etiqueta}</option>
                        ))}
                      </select>
                      <button onClick={() => borrarPedido(p)} title="Eliminar" className="text-gray-300 hover:text-rojo">✕</button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
