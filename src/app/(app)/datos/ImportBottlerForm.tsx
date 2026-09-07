"use client";

import { useActionState, useState } from "react";
import { importarBottlerAction, type EstadoImportBottler } from "./actions";
import { formatEUs, formatFecha } from "@/lib/metrics";

const estadoInicial: EstadoImportBottler = { ok: true, mensaje: "" };

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function ImportBottlerForm() {
  const [origen, setOrigen] = useState<"KOA" | "KOE">("KOA");
  const [sinMes, setSinMes] = useState(false);
  const [estado, formAction, pendiente] = useActionState(
    importarBottlerAction,
    estadoInicial,
  );

  const hoy = new Date();
  const nombreOrigen = origen === "KOA" ? "Andina" : "Embonor";

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Distribuidor</label>
        <div className="flex gap-2">
          {(["KOA", "KOE"] as const).map((o) => (
            <label
              key={o}
              className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium transition ${
                origen === o
                  ? "border-verde bg-verde-suave text-verde"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              <input
                type="radio"
                name="origen"
                value={o}
                checked={origen === o}
                onChange={() => setOrigen(o)}
                className="sr-only"
              />
              {o === "KOA" ? "Andina" : "Embonor"}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">
          Archivo Excel de {nombreOrigen}
        </label>
        <input
          name="archivo"
          type="file"
          required
          accept=".xlsx,.xls,.csv"
          className="w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-verde-suave file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-verde"
        />
        <p className="mt-1 text-[11px] text-gray-400">
          Puede traer varios meses: cada uno se reemplaza por separado.
        </p>
      </div>

      {origen === "KOA" && (
        <div className="space-y-2">
          <label className="flex items-start gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={sinMes}
              onChange={(e) => setSinMes(e.target.checked)}
              className="mt-0.5 accent-verde"
            />
            <span>
              El archivo <strong>no</strong> trae la columna de mes (exports antiguos de Andina)
            </span>
          </label>
          {sinMes && (
            <div className="grid grid-cols-2 gap-3">
              <select
                name="mes"
                defaultValue={hoy.getMonth() + 1}
                className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm"
              >
                {MESES.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <input
                name="anio"
                type="number"
                defaultValue={hoy.getFullYear()}
                className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm"
              />
            </div>
          )}
        </div>
      )}

      <label className="flex items-start gap-2 text-xs text-gray-600">
        <input type="checkbox" name="permitir_historico" className="mt-0.5 accent-verde" />
        <span>
          Permitir sobrescribir histórico (meses de años fiscales anteriores). Déjalo apagado
          salvo que sea intencional: reemplaza la venta de {nombreOrigen} de esos meses.
        </span>
      </label>

      <button
        type="submit"
        disabled={pendiente}
        className="w-full rounded-lg bg-verde px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {pendiente ? "Importando…" : `Importar ${nombreOrigen}`}
      </button>

      {estado.mensaje && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            estado.ok ? "bg-verde-suave text-verde" : "bg-rojo-suave text-rojo"
          }`}
        >
          {estado.mensaje}
        </div>
      )}

      {estado.detalle?.meses.map((m) => (
        <div key={m.fecha} className="space-y-2 rounded-lg border border-gray-200 p-3 text-xs">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-gray-800">
              {m.fecha.slice(0, 7)}
              <span className="ml-2 font-normal text-gray-400">
                datos al {formatFecha(m.fechaCorte)}
              </span>
            </p>
            <p className="text-gray-600">
              <strong>{formatEUs(m.eusTotal)} EUs</strong> en {m.clientesReconocidos.length} cuentas ·{" "}
              {m.filasFueraCartera.toLocaleString("es-CL")} filas fuera de la cartera
              {m.eusOtros !== 0 && <> ({formatEUs(m.eusOtros)} EUs agrupados en &quot;Otros&quot;)</>}
            </p>
          </div>

          {m.clientesEsperadosAusentes.length > 0 && (
            <div className="rounded-lg bg-ambar-suave px-3 py-2 text-ambar">
              ⚠️ Sin venta este mes ({m.clientesEsperadosAusentes.length}), quedan{" "}
              <strong>sin dato</strong>, no en cero: {m.clientesEsperadosAusentes.join(" · ")}
            </div>
          )}

          {m.clientesReconocidos.length > 0 && (
            <details className="text-gray-600">
              <summary className="cursor-pointer font-medium text-gray-700">
                Cuentas cargadas ({m.clientesReconocidos.length})
              </summary>
              <ul className="mt-2 space-y-0.5">
                {m.clientesReconocidos.map((c) => (
                  <li key={c.nombreCorto} className="flex justify-between">
                    <span>{c.nombreCorto}</span>
                    <span className="font-medium">{formatEUs(c.eus)} EUs</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ))}

      {estado.detalle && estado.detalle.productosSinMapeo.length > 0 && (
        <details className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600">
          <summary className="cursor-pointer font-medium text-gray-700">
            Productos sin mapeo conocido ({estado.detalle.productosSinMapeo.length}) — se cargaron
            igual, revisar nombre
          </summary>
          <ul className="mt-2 space-y-0.5">
            {estado.detalle.productosSinMapeo.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </details>
      )}
    </form>
  );
}
