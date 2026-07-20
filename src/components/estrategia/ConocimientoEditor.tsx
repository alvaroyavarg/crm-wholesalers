"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import {
  eliminarConocimiento,
  guardarConocimiento,
} from "@/app/(app)/estrategia/actions";
import type { Conocimiento, TipoConocimiento } from "@/lib/types";

// Render mínimo de markdown (encabezados, viñetas, negrita) para la vista.
function Markdown({ texto }: { texto: string }) {
  const lineas = texto.split("\n");
  return (
    <div className="space-y-1 text-sm leading-relaxed text-gray-600">
      {lineas.map((l, i) => {
        const t = l.trim();
        if (!t) return <div key={i} className="h-1" />;
        const bold = (s: string) =>
          s.split(/(\*\*[^*]+\*\*)/g).map((frag, j) =>
            frag.startsWith("**") && frag.endsWith("**") ? (
              <strong key={j} className="text-gray-800">
                {frag.slice(2, -2)}
              </strong>
            ) : (
              <span key={j}>{frag}</span>
            ),
          );
        if (t.startsWith("## "))
          return (
            <p key={i} className="pt-1 font-display text-sm font-semibold text-gray-900">
              {t.slice(3)}
            </p>
          );
        if (t.startsWith("# "))
          return (
            <p key={i} className="pt-1 font-display text-base font-semibold text-gray-900">
              {t.slice(2)}
            </p>
          );
        if (/^[-*•]\s/.test(t))
          return (
            <div key={i} className="flex gap-2">
              <span className="text-verde">•</span>
              <span>{bold(t.replace(/^[-*•]\s/, ""))}</span>
            </div>
          );
        return <p key={i}>{bold(t)}</p>;
      })}
    </div>
  );
}

function Formulario({
  inicial,
  onListo,
}: {
  inicial?: Conocimiento;
  onListo: () => void;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoConocimiento>(
    inicial?.tipo ?? "estrategia",
  );
  const [titulo, setTitulo] = useState(inicial?.titulo ?? "");
  const [contenido, setContenido] = useState(inicial?.contenido ?? "");
  const [error, setError] = useState("");
  const [guardando, start] = useTransition();

  function guardar() {
    setError("");
    const fd = new FormData();
    if (inicial) fd.set("id", inicial.id);
    fd.set("tipo", tipo);
    fd.set("titulo", titulo);
    fd.set("contenido", contenido);
    start(async () => {
      try {
        await guardarConocimiento(fd);
        router.refresh();
        onListo();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al guardar");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoConocimiento)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-verde"
        >
          <option value="estrategia">Estrategia</option>
          <option value="politica">Política</option>
        </select>
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Título — ej: Foco del canal FY27"
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-verde"
        />
      </div>
      <textarea
        value={contenido}
        onChange={(e) => setContenido(e.target.value)}
        rows={8}
        placeholder="Markdown: usa # títulos, - viñetas y **negrita**. Este contenido alimenta el system prompt del copiloto."
        className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs outline-none focus:border-verde focus:ring-2 focus:ring-verde-suave"
      />
      {error && <p className="text-sm text-rojo">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={guardar}
          disabled={guardando}
          className="rounded-lg bg-verde px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        <button
          onClick={onListo}
          disabled={guardando}
          className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Item({ item }: { item: Conocimiento }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [borrando, start] = useTransition();

  return (
    <Card>
      {editando ? (
        <Formulario inicial={item} onListo={() => setEditando(false)} />
      ) : (
        <>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Chip variante={item.tipo === "estrategia" ? "verde" : "azul"}>
                {item.tipo === "estrategia" ? "Estrategia" : "Política"}
              </Chip>
              <h3 className="font-display text-base font-semibold text-gray-900">
                {item.titulo}
              </h3>
            </div>
            <div className="flex shrink-0 gap-3">
              <button
                onClick={() => setEditando(true)}
                className="text-sm font-medium text-verde hover:underline"
              >
                Editar
              </button>
              <button
                onClick={() => {
                  const fd = new FormData();
                  fd.set("id", item.id);
                  start(async () => {
                    await eliminarConocimiento(fd);
                    router.refresh();
                  });
                }}
                disabled={borrando}
                className="text-sm text-gray-300 transition hover:text-rojo"
              >
                Eliminar
              </button>
            </div>
          </div>
          <Markdown texto={item.contenido} />
        </>
      )}
    </Card>
  );
}

export function ConocimientoEditor({ items }: { items: Conocimiento[] }) {
  const [creando, setCreando] = useState(false);

  return (
    <div className="space-y-4">
      {creando ? (
        <Card>
          <h3 className="mb-3 font-display text-base font-semibold text-gray-900">
            Nueva entrada
          </h3>
          <Formulario onListo={() => setCreando(false)} />
        </Card>
      ) : (
        <button
          onClick={() => setCreando(true)}
          className="rounded-lg bg-verde px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          + Nueva entrada
        </button>
      )}

      {items.length === 0 && !creando && (
        <p className="text-sm text-gray-400">
          Sin entradas todavía. Agrega la estrategia del canal y las políticas
          comerciales; el copiloto las usará como contexto en la Fase 3.
        </p>
      )}

      {items.map((item) => (
        <Item key={item.id} item={item} />
      ))}
    </div>
  );
}
