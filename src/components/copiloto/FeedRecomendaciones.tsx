"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Chip } from "@/components/ui/Chip";
import { cambiarEstadoRecomendacion } from "@/app/(app)/actions";
import type { Recomendacion, TipoEvidencia } from "@/lib/types";

const VARIANTE: Record<TipoEvidencia, "verde" | "azul" | "ambar"> = {
  ventas: "verde",
  memoria: "azul",
  boletin: "ambar",
};
const ETIQUETA: Record<TipoEvidencia, string> = {
  ventas: "Ventas",
  memoria: "Memoria",
  boletin: "Boletín",
};

function Tarjeta({
  r,
  mostrarCliente,
}: {
  r: Recomendacion;
  mostrarCliente: boolean;
}) {
  const router = useRouter();
  const [descartando, setDescartando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pendiente, startTransition] = useTransition();

  function enviar(estado: "aceptada" | "descartada") {
    const fd = new FormData();
    fd.set("id", r.id);
    fd.set("cliente_id", r.cliente_id);
    fd.set("estado", estado);
    if (estado === "descartada") fd.set("motivo", motivo);
    startTransition(async () => {
      await cambiarEstadoRecomendacion(fd);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-gray-100 p-4 transition hover:border-gray-200">
      {mostrarCliente && r.cliente_nombre && (
        <Link
          href={`/clientes/${r.cliente_id}`}
          className="text-xs font-semibold text-verde hover:underline"
        >
          {r.cliente_nombre}
        </Link>
      )}
      <p className="mt-1 text-sm text-gray-800">{r.texto}</p>

      <ul className="mt-3 space-y-1.5">
        {r.evidencia.map((e, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="shrink-0">
              <Chip variante={VARIANTE[e.tipo] ?? "gris"}>
                {ETIQUETA[e.tipo] ?? e.tipo}
              </Chip>
            </span>
            <span className="min-w-0 text-xs leading-snug text-gray-500">
              {e.detalle}
            </span>
          </li>
        ))}
      </ul>

      {descartando ? (
        <div className="mt-3 space-y-2 rounded-lg bg-gray-50 p-3">
          <p className="text-xs font-medium text-gray-600">
            ¿Por qué la descartas? El copiloto lee tus motivos y deja de
            cometer el mismo error.
          </p>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Ej: está stockeado — compró 4.400 EUs el mes pasado / ese cliente es KOA, no KOE…"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-verde"
          />
          <div className="flex gap-2">
            <button
              onClick={() => enviar("descartada")}
              disabled={pendiente}
              className="rounded-lg bg-rojo-suave px-3 py-1.5 text-xs font-semibold text-rojo transition hover:bg-rojo hover:text-white disabled:opacity-50"
            >
              {pendiente ? "Descartando…" : "Descartar"}
            </button>
            <button
              onClick={() => setDescartando(false)}
              disabled={pendiente}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-gray-100"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => enviar("aceptada")}
            disabled={pendiente}
            className="rounded-lg bg-verde-suave px-3 py-1.5 text-xs font-semibold text-verde transition hover:bg-verde hover:text-white disabled:opacity-50"
          >
            {pendiente ? "Guardando…" : "✓ Aceptar"}
          </button>
          <button
            onClick={() => setDescartando(true)}
            disabled={pendiente}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-400 transition hover:bg-gray-50 hover:text-rojo"
          >
            Descartar
          </button>
        </div>
      )}
    </div>
  );
}

export function FeedRecomendaciones({
  recomendaciones,
  mostrarCliente = false,
}: {
  recomendaciones: Recomendacion[];
  mostrarCliente?: boolean;
}) {
  if (recomendaciones.length === 0) {
    return (
      <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">
        Sin recomendaciones nuevas. Pídele al copiloto que analice una cuenta y
        cree oportunidades.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {recomendaciones.map((r) => (
        <Tarjeta key={r.id} r={r} mostrarCliente={mostrarCliente} />
      ))}
    </div>
  );
}
