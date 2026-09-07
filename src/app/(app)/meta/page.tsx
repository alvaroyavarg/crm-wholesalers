import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { KpiCard } from "@/components/ui/KpiCard";
import { TablaMetaProximoMes } from "@/components/meta/TablaMetaProximoMes";
import { etiquetaMesCalendario, fiscalActual, sumarPeriodos } from "@/lib/fiscal";
import { formatEUs } from "@/lib/metrics";
import { catalogoSkus, metaProximoMes } from "@/lib/queries";

export const dynamic = "force-dynamic";

function hrefMes(fy: number, periodo: number): string {
  return `/meta?fy=${fy}&periodo=${periodo}`;
}

export default async function MetaPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string; periodo?: string }>;
}) {
  const sp = await searchParams;
  const fyParam = sp.fy ? Number(sp.fy) : undefined;
  const periodoParam = sp.periodo ? Number(sp.periodo) : undefined;

  const [{ fyMeta, periodoMeta, columnas, clientes }, catalogo] = await Promise.all([
    metaProximoMes(fyParam, periodoParam),
    catalogoSkus(),
  ]);

  const mesAnterior = sumarPeriodos(fyMeta, periodoMeta, -1);
  const mesSiguiente = sumarPeriodos(fyMeta, periodoMeta, 1);

  // Selector directo: no depende de ir clickeando ← → desde "hoy". La
  // ventana se ancla a HOY (no al mes que se está viendo) para que no se
  // corra cada vez que se navega.
  const { fy: fyHoy, periodo: periodoHoy } = fiscalActual();
  const ventanaMeses = Array.from({ length: 6 }, (_, i) =>
    sumarPeriodos(fyHoy, periodoHoy, i - 1),
  );

  const etiquetas = {
    a: etiquetaMesCalendario(columnas.a.fy, columnas.a.periodo),
    b: etiquetaMesCalendario(columnas.b.fy, columnas.b.periodo),
    c: etiquetaMesCalendario(columnas.c.fy, columnas.c.periodo),
  };
  const etiquetaMeta = etiquetaMesCalendario(fyMeta, periodoMeta);

  const totalA = clientes.reduce((a, c) => a + Number(c.eus_a), 0);
  const totalB = clientes.reduce((a, c) => a + Number(c.eus_b), 0);
  const totalC = clientes.reduce((a, c) => a + Number(c.eus_c), 0);
  const totalMeta = clientes.reduce((a, c) => a + Number(c.meta_eus), 0);
  const conMeta = clientes.filter((c) => Number(c.meta_eus) > 0).length;
  const sinMeta = clientes.length - conMeta;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-gray-900">
            Meta de {etiquetaMeta}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Tendencia de {etiquetas.a} y {etiquetas.b} + {etiquetas.c} (mismo mes LY) ·
            cartera activa ({clientes.filter((c) => !c.es_otros).length} cuentas + Otros por bottler)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={hrefMes(mesAnterior.fy, mesAnterior.periodo)}
            title="Mes anterior"
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-500 hover:bg-gray-50"
          >
            ←
          </Link>
          <div className="flex overflow-hidden rounded-lg border border-gray-200">
            {ventanaMeses.map((m) => {
              const activo = m.fy === fyMeta && m.periodo === periodoMeta;
              return (
                <Link
                  key={`${m.fy}-${m.periodo}`}
                  href={hrefMes(m.fy, m.periodo)}
                  className={`border-r border-gray-200 px-3 py-1.5 text-sm last:border-r-0 ${
                    activo
                      ? "bg-verde text-white"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {etiquetaMesCalendario(m.fy, m.periodo)}
                </Link>
              );
            })}
          </div>
          <Link
            href={hrefMes(mesSiguiente.fy, mesSiguiente.periodo)}
            title="Mes siguiente"
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-500 hover:bg-gray-50"
          >
            →
          </Link>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icono="📦" etiqueta={etiquetas.a} valor={`${formatEUs(totalA)} EUs`} />
        <KpiCard icono="📦" etiqueta={etiquetas.b} valor={`${formatEUs(totalB)} EUs`} />
        <KpiCard
          icono="📦"
          etiqueta={`${etiquetas.c} (LY)`}
          valor={`${formatEUs(totalC)} EUs`}
        />
        <KpiCard
          icono="🎯"
          etiqueta={`Meta ${etiquetaMeta}`}
          valor={totalMeta > 0 ? `${formatEUs(totalMeta)} EUs` : "—"}
          detalle={
            sinMeta > 0 ? (
              <span className="text-ambar">{sinMeta} cuentas sin meta</span>
            ) : (
              <span className="text-verde">todas con meta</span>
            )
          }
        />
      </div>

      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
          <p className="text-sm font-medium text-gray-700">
            Trabajar la meta por cuenta
            <span className="ml-2 text-xs font-normal text-gray-400">
              clic en el nombre o la flecha: compra por SKU y meta por SKU
            </span>
          </p>
          <div className="flex items-center gap-2">
            {sinMeta > 0 && (
              <Chip variante="ambar">
                {sinMeta} {sinMeta === 1 ? "cuenta sin meta" : "cuentas sin meta"}
              </Chip>
            )}
            <a
              href={`/api/meta/exportar?fy=${fyMeta}&periodo=${periodoMeta}`}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              ⬇️ Exportar a Excel
            </a>
          </div>
        </div>
        <div className="mt-3">
          <TablaMetaProximoMes
            filas={clientes}
            fyMeta={fyMeta}
            periodoMeta={periodoMeta}
            etiquetas={etiquetas}
            periodos={columnas}
            catalogo={catalogo}
          />
        </div>
        <p className="px-5 pb-4 pt-2 text-[11px] text-gray-400">
          Meta UC es referencial: se calcula con el factor estándar (EU = UC × 5,678 / 9) y
          no ajusta por el mix de Smirnoff Ice del cliente, que lleva un divisor propio.
        </p>
      </Card>
    </div>
  );
}
