import { Card } from "./Card";

export function KpiCard({
  icono,
  etiqueta,
  valor,
  detalle,
}: {
  icono: string;
  etiqueta: string;
  valor: string;
  detalle?: React.ReactNode;
}) {
  return (
    <Card className="flex items-center gap-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-verde-suave text-lg">
        {icono}
      </div>
      <div className="min-w-0">
        <p className="text-sm text-gray-500">{etiqueta}</p>
        <p className="font-display text-2xl font-semibold text-gray-900">
          {valor}
        </p>
        {detalle && <div className="mt-0.5 text-xs text-gray-500">{detalle}</div>}
      </div>
    </Card>
  );
}
