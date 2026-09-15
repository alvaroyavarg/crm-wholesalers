"use client";

import { useActionState } from "react";
import { importarVentasAction, type EstadoImport } from "./actions";

const estadoInicial: EstadoImport = { ok: true, mensaje: "" };

export function ImportForm() {
  const [estado, formAction, pendiente] = useActionState(
    importarVentasAction,
    estadoInicial,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">
          Archivo Excel de la base (hoja BBDD)
        </label>
        <input
          name="archivo"
          type="file"
          required
          accept=".xlsx,.xls,.csv"
          className="w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-verde-suave file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-verde"
        />
      </div>

      <label className="flex items-start gap-2 text-sm text-gray-600">
        <input type="checkbox" name="regenerar_plan" className="mt-0.5 accent-verde" />
        <span>
          Proponer meta = real del FY anterior (empatar LY) como línea “Sin desglose”,
          solo en los meses que aún no tienen SKU asignados. La meta sigue siendo la
          suma de SKU.
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm text-gray-600">
        <input type="checkbox" name="pisar_bottler" className="mt-0.5 accent-verde" />
        <span>
          Pisar meses ya cargados desde Andina/Embonor. Por defecto se bloquea: la base
          consolidada tiene menos detalle que el archivo del bottler.
        </span>
      </label>

      <button
        type="submit"
        disabled={pendiente}
        className="w-full rounded-lg bg-verde px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {pendiente ? "Importando… (puede tomar ~1 min)" : "Importar base"}
      </button>

      {estado.mensaje && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            estado.ok ? "bg-verde-suave text-verde" : "bg-rojo-suave text-rojo"
          }`}
        >
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
