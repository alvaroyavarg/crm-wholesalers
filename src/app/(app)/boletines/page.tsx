import { Card } from "@/components/ui/Card";
import { subirBoletin } from "@/app/(app)/actions";
import { BoletinItem } from "@/components/boletines/BoletinItem";
import { listarBoletines } from "@/lib/queries";

export const dynamic = "force-dynamic";

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
          <form action={subirBoletin} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Título
              </label>
              <input
                name="titulo"
                required
                placeholder="Boletín Mayoristas Centro — Jul 2026"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-verde"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Origen
              </label>
              <select
                name="origen"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-verde"
              >
                <option value="KOA">KOA — Coca-Cola Andina</option>
                <option value="KOE">KOE — Coca-Cola Embonor</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Vigente desde
                </label>
                <input
                  name="vigente_desde"
                  type="date"
                  required
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-verde"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Vigente hasta
                </label>
                <input
                  name="vigente_hasta"
                  type="date"
                  required
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-verde"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Archivo (PDF o imagen)
              </label>
              <input
                name="archivo"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                className="w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-verde-suave file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-verde"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-verde px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Guardar boletín
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
