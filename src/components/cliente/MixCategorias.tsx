import type { MixCategoriaRow, Segmento } from "@/lib/types";

// Mix por categoría (últimos 12 meses): barra = share del cliente,
// marca vertical = share del benchmark (segmento para CLAVE, cartera para TOP3
// porque TOP3 son solo 3 cuentas).
export function MixCategorias({
  mix,
  segmento,
}: {
  mix: MixCategoriaRow[];
  segmento: Segmento;
}) {
  const totalCliente = mix.reduce((a, r) => a + Number(r.eus_cliente), 0);
  const totalBench = mix.reduce(
    (a, r) =>
      a + Number(segmento === "TOP3" ? r.eus_cartera : r.eus_segmento),
    0,
  );

  if (totalCliente === 0) {
    return <p className="text-sm text-gray-400">Sin ventas en los últimos 12 meses.</p>;
  }

  const filas = mix
    .map((r) => {
      const bench = Number(
        segmento === "TOP3" ? r.eus_cartera : r.eus_segmento,
      );
      return {
        categoria: r.categoria,
        pctCliente: (Number(r.eus_cliente) / totalCliente) * 100,
        pctBench: totalBench > 0 ? (bench / totalBench) * 100 : 0,
      };
    })
    .sort((a, b) => b.pctCliente - a.pctCliente);

  const max = Math.max(...filas.map((f) => Math.max(f.pctCliente, f.pctBench)), 1);

  return (
    <div className="space-y-3">
      {filas.map((f) => {
        const gap = f.pctCliente - f.pctBench;
        return (
          <div key={f.categoria}>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="font-medium text-gray-700">{f.categoria}</span>
              <span className="text-gray-400">
                {f.pctCliente.toFixed(1)}%{" "}
                <span className={gap >= 0 ? "text-verde" : "text-rojo"}>
                  ({gap >= 0 ? "+" : ""}
                  {gap.toFixed(1)} pp vs pares)
                </span>
              </span>
            </div>
            <div className="relative h-3 rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-verde/80"
                style={{ width: `${(f.pctCliente / max) * 100}%` }}
              />
              <div
                className="absolute top-[-2px] h-[16px] w-[2px] rounded bg-azul"
                style={{ left: `${(f.pctBench / max) * 100}%` }}
                title={`Pares: ${f.pctBench.toFixed(1)}%`}
              />
            </div>
          </div>
        );
      })}
      <p className="pt-1 text-[11px] text-gray-400">
        Barra verde: mix del cliente · Marca azul: promedio{" "}
        {segmento === "TOP3" ? "del canal completo" : "del segmento CLAVE"}{" "}
        (últimos 12 meses)
      </p>
    </div>
  );
}
