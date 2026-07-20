import Link from "next/link";
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
        <div
          key={r.id}
          className="rounded-xl border border-gray-100 p-4 transition hover:border-gray-200"
        >
          {mostrarCliente && r.cliente_nombre && (
            <Link
              href={`/clientes/${r.cliente_id}`}
              className="text-xs font-semibold text-verde hover:underline"
            >
              {r.cliente_nombre}
            </Link>
          )}
          <p className="mt-1 text-sm text-gray-800">{r.texto}</p>

          <div className="mt-2 flex flex-wrap gap-1">
            {r.evidencia.map((e, i) => (
              <Chip key={i} variante={VARIANTE[e.tipo] ?? "gris"} title={e.detalle}>
                {ETIQUETA[e.tipo] ?? e.tipo}: {e.detalle}
              </Chip>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <form action={cambiarEstadoRecomendacion}>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="cliente_id" value={r.cliente_id} />
              <input type="hidden" name="estado" value="aceptada" />
              <button
                type="submit"
                className="rounded-lg bg-verde-suave px-3 py-1.5 text-xs font-semibold text-verde transition hover:bg-verde hover:text-white"
              >
                ✓ Aceptar
              </button>
            </form>
            <form action={cambiarEstadoRecomendacion}>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="cliente_id" value={r.cliente_id} />
              <input type="hidden" name="estado" value="descartada" />
              <button
                type="submit"
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-400 transition hover:bg-gray-50 hover:text-rojo"
              >
                Descartar
              </button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}
