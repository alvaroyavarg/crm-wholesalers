import { Card } from "@/components/ui/Card";
import { BoletinForm } from "@/components/boletines/BoletinForm";
import { BoletinItem } from "@/components/boletines/BoletinItem";
import { listarBoletines } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // análisis IA en segundo plano (after)

export default async function BoletinesPage() {
  const boletines = await listarBoletines();
  const hoy = new Date().toISOString().slice(0, 10);

  const vigentes = boletines.filter(
    (b) => b.vigente_desde <= hoy && b.vigente_hasta >= hoy,
  );
  const otros = boletines.filter(
    (b) => !(b.vigente_desde <= hoy && b.vigente_hasta >= hoy),
  );

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-gray-900">
          Boletines comerciales
        </h1>
        <p className="text-sm text-gray-500">
          Boletines mensuales por embotellador — KOA (Andina) y KOE (Embonor).
          Al cargar un boletín, la IA extrae automáticamente escalones,
          descuentos y focos por SKU.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {[
            { titulo: `Vigentes (${vigentes.length})`, items: vigentes },
            { titulo: `Vencidos y futuros (${otros.length})`, items: otros },
          ].map((grupo) => (
            <Card key={grupo.titulo} className="p-0">
              <div className="border-b border-gray-100 px-5 py-4">
                <h2 className="font-display text-base font-semibold text-gray-900">
                  {grupo.titulo}
                </h2>
              </div>
              {grupo.items.length === 0 ? (
                <p className="px-5 py-6 text-sm text-gray-400">
                  Sin boletines en esta categoría.
                </p>
              ) : (
                <ul>
                  {grupo.items.map((b) => (
                    <BoletinItem
                      key={b.id}
                      boletin={b}
                      urlFirmada={b.urlFirmada}
                      vigente={b.vigente_desde <= hoy && b.vigente_hasta >= hoy}
                    />
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>

        <Card className="h-fit">
          <h2 className="mb-4 font-display text-base font-semibold text-gray-900">
            Cargar boletín
          </h2>
          <BoletinForm />
        </Card>
      </div>
    </div>
  );
}
