"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { crearNota } from "@/app/(app)/actions";
import type { TipoNota } from "@/lib/types";

// Botón flotante siempre visible → modal de registro rápido post-visita.
// El texto es libre; en la Fase 3 el agente lo estructura y decide si
// actualiza el perfil del comprador.

const TIPOS: { valor: TipoNota; etiqueta: string; icono: string }[] = [
  { valor: "visita", etiqueta: "Visita", icono: "🚗" },
  { valor: "llamada", etiqueta: "Llamada", icono: "📞" },
  { valor: "acuerdo", etiqueta: "Acuerdo", icono: "🤝" },
  { valor: "rechazo", etiqueta: "Rechazo", icono: "🚫" },
  { valor: "nota", etiqueta: "Nota", icono: "📝" },
  { valor: "compromiso", etiqueta: "Compromiso", icono: "📌" },
  { valor: "idea", etiqueta: "Idea", icono: "💡" },
];

export interface ClienteOpcion {
  id: string;
  nombre: string;
}

export function NotaRapida({ clientes }: { clientes: ClienteOpcion[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<TipoNota>("visita");
  const [clienteId, setClienteId] = useState("");
  const [contenido, setContenido] = useState("");
  const [error, setError] = useState("");
  const [pendiente, startTransition] = useTransition();

  function abrir() {
    // Si estamos dentro de una ficha, pre-seleccionar ese cliente
    const m = pathname.match(/^\/clientes\/([0-9a-f-]{36})/);
    if (m && clientes.some((c) => c.id === m[1])) setClienteId(m[1]);
    else if (!clienteId && clientes.length > 0) setClienteId("");
    setAbierto(true);
  }

  function guardar() {
    setError("");
    if (!clienteId) {
      setError("Selecciona el cliente.");
      return;
    }
    if (!contenido.trim()) {
      setError("Escribe la nota.");
      return;
    }
    startTransition(async () => {
      try {
        await crearNota({ clienteId, tipo, contenido });
        setAbierto(false);
        setContenido("");
        setTipo("visita");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al guardar");
      }
    });
  }

  return (
    <>
      <button
        onClick={abrir}
        title="Registrar visita / nota"
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-verde text-2xl text-white shadow-lg transition hover:scale-105"
      >
        ✚
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pendiente) setAbierto(false);
          }}
        >
          <div className="w-full max-w-lg rounded-(--radius-card) bg-white p-6 shadow-xl">
            <h2 className="mb-4 font-display text-lg font-semibold text-gray-900">
              Registrar {TIPOS.find((t) => t.valor === tipo)?.etiqueta.toLowerCase()}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Cliente
                </label>
                <select
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-verde"
                >
                  <option value="">Selecciona un cliente…</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                {TIPOS.map((t) => (
                  <button
                    key={t.valor}
                    onClick={() => setTipo(t.valor)}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                      tipo === t.valor
                        ? "bg-verde-suave text-verde ring-1 ring-verde"
                        : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {t.icono} {t.etiqueta}
                  </button>
                ))}
              </div>

              <textarea
                value={contenido}
                onChange={(e) => setContenido(e.target.value)}
                rows={5}
                autoFocus
                placeholder="Texto libre: qué pasó en la visita, acuerdos, precios pedidos, quiebres, próximos pasos… (en Fase 3 el copiloto lo estructura y actualiza el perfil solo)"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-verde focus:ring-2 focus:ring-verde-suave"
              />

              {error && (
                <p className="rounded-lg bg-rojo-suave px-3 py-2 text-sm text-rojo">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setAbierto(false)}
                  disabled={pendiente}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={guardar}
                  disabled={pendiente}
                  className="rounded-lg bg-verde px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {pendiente ? "Guardando…" : "Guardar nota"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
