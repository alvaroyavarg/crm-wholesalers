import { etiquetaFY, etiquetaPeriodo, mesDePeriodo } from "@/lib/fiscal";
import { formatEUs, formatPct, pctVsLY } from "@/lib/metrics";

// "Globo" de performance del mes: avance vs plan, proyección de cierre
// (run-rate según días transcurridos) y comparación vs mismo mes LY.
export function GloboMes({
  fy,
  periodo,
  mesEus,
  planMesEus,
  mesLyEus,
}: {
  fy: number;
  periodo: number;
  mesEus: number;
  planMesEus: number;
  mesLyEus: number;
}) {
  const hoy = new Date();
  const diaHoy = hoy.getDate();
  const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const pctMesTranscurrido = (diaHoy / diasMes) * 100;

  const avance = planMesEus > 0 ? (mesEus / planMesEus) * 100 : null;
  const proyeccion = diaHoy > 0 ? (mesEus / diaHoy) * diasMes : 0;
  const proyeccionPct = planMesEus > 0 ? (proyeccion / planMesEus) * 100 : null;
  const vsLyMes = pctVsLY(mesEus, mesLyEus);

  const alRitmo = avance != null && avance >= pctMesTranscurrido;

  return (
    <div className="mb-6 rounded-(--radius-card) bg-white p-6 shadow-card">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between md:gap-8">
        <div className="min-w-0">
          <p className="text-sm text-gray-500">
            Avance del mes · <span className="font-medium text-gray-700">Canal completo</span> ·{" "}
            {etiquetaPeriodo(periodo)} ({mesDePeriodo(periodo)}) {etiquetaFY(fy)} ·
            día {diaHoy} de {diasMes}
          </p>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="font-display text-4xl font-semibold text-gray-900">
              {avance != null ? `${Math.round(avance)}%` : "—"}
            </span>
            <span className="text-sm text-gray-500">
              del plan · {formatEUs(mesEus)} de {formatEUs(planMesEus)} EUs
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                alRitmo ? "bg-verde-suave text-verde" : "bg-ambar-suave text-ambar"
              }`}
            >
              {alRitmo ? "Al ritmo o mejor" : "Bajo el ritmo"}
            </span>
          </div>

          {/* Barra: avance del plan con marca del % del mes transcurrido */}
          <div className="relative mt-4 h-3 w-full max-w-xl rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full ${alRitmo ? "bg-verde" : "bg-ambar"}`}
              style={{ width: `${Math.min(avance ?? 0, 100)}%` }}
            />
            <div
              className="absolute top-[-3px] h-[18px] w-[2px] rounded bg-gray-400"
              style={{ left: `${Math.min(pctMesTranscurrido, 100)}%` }}
              title={`${Math.round(pctMesTranscurrido)}% del mes transcurrido`}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-gray-400">
            La marca gris indica el % del mes ya transcurrido (
            {Math.round(pctMesTranscurrido)}%)
          </p>
        </div>

        <div className="flex shrink-0 gap-8 md:text-right">
          <div>
            <p className="text-xs text-gray-400">Proyección de cierre</p>
            <p className="font-display text-xl font-semibold text-gray-900">
              {formatEUs(proyeccion)} EUs
            </p>
            <p
              className={`text-xs font-medium ${
                proyeccionPct != null && proyeccionPct >= 100
                  ? "text-verde"
                  : "text-rojo"
              }`}
            >
              {proyeccionPct != null ? `${Math.round(proyeccionPct)}% del plan` : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">
              vs {etiquetaPeriodo(periodo)} {etiquetaFY(fy - 1)}
            </p>
            <p
              className={`font-display text-xl font-semibold ${
                (vsLyMes ?? 0) >= 0 ? "text-verde" : "text-rojo"
              }`}
            >
              {formatPct(vsLyMes)}
            </p>
            <p className="text-xs text-gray-400">
              LY: {formatEUs(mesLyEus)} EUs
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
