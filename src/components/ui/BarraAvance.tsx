// Barra de avance vs plan. Verde >= 95%, ámbar 80-95%, rojo < 80%.
export function BarraAvance({ pct }: { pct: number | null }) {
  if (pct == null) {
    return <span className="text-xs text-gray-400">Sin plan</span>;
  }

  const ancho = Math.min(pct, 100);
  const color =
    pct >= 95 ? "bg-verde" : pct >= 80 ? "bg-ambar" : "bg-rojo";

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${ancho}%` }}
        />
      </div>
      <span className="text-xs font-medium text-gray-600">
        {Math.round(pct)}%
      </span>
    </div>
  );
}
