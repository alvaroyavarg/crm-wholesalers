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
    <Card className="flex items-center gap-3 !p-4 sm:gap-4 sm:!p-5">
      <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-verde-suave text-lg sm:flex">
        {icono}
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-gray-500 sm:text-sm">{etiqueta}</p>
        <p className="font-display text-lg font-semibold text-gray-900 sm:text-2xl">
          {valor}
        </p>
        {detalle && <div className="mt-0.5 text-xs text-gray-500">{detalle}</div>}
      </div>
    </Card>
  );
}
