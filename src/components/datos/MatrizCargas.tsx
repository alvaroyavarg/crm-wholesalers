import Link from "next/link";
import { Chip } from "@/components/ui/Chip";
import { etiquetaFY, etiquetaMesCalendario, inicioPeriodo } from "@/lib/fiscal";
import { formatEUs } from "@/lib/metrics";
import type { Importacion, OrigenImportacion } from "@/lib/types";

const COLUMNAS: { origen: OrigenImportacion; titulo: string; nota: string }[] = [
  { origen: "KOA", titulo: "Andina", nota: "archivo del bottler" },
  { origen: "KOE", titulo: "Embonor", nota: "archivo del bottler" },
  { origen: "DIAGEO", titulo: "Base Diageo", nota: "consolidada, mes cerrado" },
];

function ultimoDiaDelMes(fy: number, periodo: number): string {
  const inicio = inicioPeriodo(fy, periodo);
  const fin = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 0);
  return `${fin.getFullYear()}-${String(fin.getMonth() + 1).padStart(2, "0")}-${String(fin.getDate()).padStart(2, "0")}`;
}

function diaMes(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function Celda({ carga, fy, periodo, esBase }: { carga?: Importacion; fy: number; periodo: number; esBase: boolean }) {
  if (!carga) return <span className="text-gray-300">—</span>;
  const completo = carga.fecha_corte >= ultimoDiaDelMes(fy, periodo);
  return (
    <div className="flex flex-col gap-0.5" title={carga.archivo ?? undefined}>
      <div className="flex items-center gap-2">
        <Chip variante={completo ? "verde" : "ambar"}>
          {completo ? "Mes completo" : `Corte ${diaMes(carga.fecha_corte)}`}
        </Chip>
      </div>
      <span className="text-xs text-gray-500">
        {formatEUs(Number(carga.eus))} EU · {carga.filas.toLocaleString("es-CL")} filas
        {!esBase && !completo && " · manda sobre pedidos hasta el corte"}
      </span>
    </div>
  );
}

export function MatrizCargas({
  fy,
  periodoActual,
  cargas,
  fys,
}: {
  fy: number;
  periodoActual: number | null;
  cargas: Importacion[];
  fys: number[];
}) {
  const porClave = new Map<string, Importacion>();
  for (const c of cargas) porClave.set(`${c.origen}|${c.periodo}`, c);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {fys.map((f) => (
          <Link
            key={f}
            href={`/datos?fy=${f}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              f === fy ? "bg-verde text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {etiquetaFY(f)}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="py-2 pr-3">Mes</th>
              {COLUMNAS.map((c) => (
                <th key={c.origen} className="py-2 pr-3">
                  {c.titulo}
                  <span className="block text-[10px] font-normal normal-case tracking-normal text-gray-400">
                    {c.nota}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((p) => {
              const actual = p === periodoActual;
              const conBottler = porClave.has(`KOA|${p}`) || porClave.has(`KOE|${p}`);
              const conBase = porClave.has(`DIAGEO|${p}`);
              return (
                <tr
                  key={p}
                  className={`border-b border-gray-100 align-top ${actual ? "bg-verde-suave/40" : ""}`}
                >
                  <td className="py-2 pr-3">
                    <div className="font-medium text-gray-900">
                      {etiquetaMesCalendario(fy, p)}
                      <span className="ml-1 text-xs font-normal text-gray-400">P{p}</span>
                    </div>
                    {actual && <span className="text-[10px] text-verde">mes actual</span>}
                    {!actual && !conBottler && !conBase && (
                      <span className="text-[10px] text-gray-400">sin venta cargada</span>
                    )}
                    {conBottler && conBase && (
                      <span className="text-[10px] text-ambar">bottler y base: manda la última carga</span>
                    )}
                  </td>
                  {COLUMNAS.map((c) => (
                    <td key={c.origen} className="py-2 pr-3">
                      <Celda
                        carga={porClave.get(`${c.origen}|${p}`)}
                        fy={fy}
                        periodo={p}
                        esBase={c.origen === "DIAGEO"}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
