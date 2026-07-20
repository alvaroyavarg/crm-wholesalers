"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { generarRecomendacionesCliente } from "@/app/(app)/actions";
import { FeedRecomendaciones } from "@/components/copiloto/FeedRecomendaciones";
import type { Recomendacion } from "@/lib/types";

// Sección de recomendaciones en la ficha: acceso directo al copiloto para
// ESTA cuenta — genera recomendaciones al tiro o abre el chat pre-armado.
export function RecomendacionesCliente({
  clienteId,
  nombre,
  recomendaciones,
}: {
  clienteId: string;
  nombre: string;
  recomendaciones: Recomendacion[];
}) {
  const router = useRouter();
  const [resumen, setResumen] = useState("");
  const [error, setError] = useState("");
  const [pendiente, startTransition] = useTransition();

  function generar() {
    setError("");
    setResumen("");
    startTransition(async () => {
      try {
        const r = await generarRecomendacionesCliente(clienteId);
        setResumen(r.resumen);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error del copiloto");
      }
    });
  }

  const preguntaChat = encodeURIComponent(
    `Sobre ${nombre}: mirando su detalle de compras, ¿qué oportunidades ves y cómo las cruzo con las promos de los boletines vigentes?`,
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={generar}
          disabled={pendiente}
          className="rounded-lg bg-verde px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {pendiente
            ? "✨ Analizando ventas, pares y boletines…"
            : "✨ Generar recomendaciones"}
        </button>
        <Link
          href={`/copiloto?pregunta=${preguntaChat}`}
          className="rounded-lg bg-verde-suave px-4 py-2 text-sm font-semibold text-verde transition hover:bg-verde hover:text-white"
        >
          Preguntar en el chat →
        </Link>
        {pendiente && (
          <span className="text-xs text-gray-400">
            (~30-60 s: consulta la data y crea recomendaciones con evidencia)
          </span>
        )}
      </div>

      {resumen && (
        <p className="mb-4 rounded-xl bg-verde-suave/60 px-4 py-3 text-sm leading-relaxed text-gray-700">
          {resumen}
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-xl bg-rojo-suave px-4 py-3 text-sm text-rojo">
          {error}
        </p>
      )}

      <FeedRecomendaciones recomendaciones={recomendaciones} />
    </div>
  );
}
