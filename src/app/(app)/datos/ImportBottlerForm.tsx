"use client";

import { useActionState, useState } from "react";
import { importarBottlerAction, type EstadoImportBottler } from "./actions";
import { formatEUs } from "@/lib/metrics";

const estadoInicial: EstadoImportBottler = { ok: true, mensaje: "" };

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function ImportBottlerForm() {
  const [origen, setOrigen] = useState<"KOA" | "KOE">("KOA");
  const [estado, formAction, pendiente] = useActionState(
    importarBottlerAction,
    estadoInicial,
  );

  const hoy = new Date();

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">
          Distribuidor
        </label>
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

      {origen === "KOA" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Mes (el archivo de Andina no lo trae)
            </label>
            <select
              name="mes"
              required
              defaultValue={hoy.getMonth() + 1}
              className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm"
            >
              {MESES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Año</label>
            <input
              name="anio"
              type="number"
              required
              defaultValue={hoy.getFullYear()}
              className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm"
            />
          </div>
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">
          Archivo Excel de {origen === "KOA" ? "Andina" : "Embonor"}
        </label>
        <input
          name="archivo"
          type="file"
          required
          accept=".xlsx,.xls,.csv"
          className="w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-verde-suave file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-verde"
        />
      </div>

      <button
        type="submit"
        disabled={pendiente}
        className="w-full rounded-lg bg-verde px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {pendiente ? "Importando…" : `Importar ${origen === "KOA" ? "Andina" : "Embonor"}`}
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

      {estado.detalle && estado.detalle.clientesEsperadosAusentes.length > 0 && (
        <div className="rounded-lg bg-ambar-suave px-3 py-2 text-xs text-ambar">
          <p className="font-medium">
            ⚠️ {estado.detalle.clientesEsperadosAusentes.length} cuenta(s) de tu cartera en{" "}
            {origen === "KOA" ? "Andina" : "Embonor"} no aparecieron en este archivo — quedan{" "}
            <strong>sin dato</strong> este mes, no en cero:
          </p>
          <p className="mt-1">{estado.detalle.clientesEsperadosAusentes.join(" · ")}</p>
        </div>
      )}

      {estado.detalle && estado.detalle.clientesReconocidos.length > 0 && (
        <details className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600">
          <summary className="cursor-pointer font-medium text-gray-700">
            Cuentas cargadas ({estado.detalle.clientesReconocidos.length})
          </summary>
          <ul className="mt-2 space-y-0.5">
            {estado.detalle.clientesReconocidos.map((c) => (
              <li key={c.nombreCorto} className="flex justify-between">
                <span>{c.nombreCorto}</span>
                <span className="font-medium">{formatEUs(c.eus)} EUs</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {estado.detalle && estado.detalle.productosSinMapeo.length > 0 && (
        <details className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600">
          <summary className="cursor-pointer font-medium text-gray-700">
            Productos sin mapeo conocido ({estado.detalle.productosSinMapeo.length}) — se
            cargaron igual, revisar nombre
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
