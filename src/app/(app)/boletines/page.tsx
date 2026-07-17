import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { eliminarBoletin, subirBoletin } from "@/app/(app)/actions";
import { listarBoletines } from "@/lib/queries";

export const dynamic = "force-dynamic";

function formatFechaCorta(iso: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${iso}T12:00:00`));
}

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
          En Fase 2 el copiloto extraerá automáticamente escalones, descuentos y
          vigencias de cada boletín.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
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
                  {grupo.items.map((b) => {
                    const vigente =
                      b.vigente_desde <= hoy && b.vigente_hasta >= hoy;
                    return (
                      <li
                        key={b.id}
                        className="flex items-center justify-between gap-4 border-b border-gray-50 px-5 py-4 last:border-0"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-medium text-gray-900">
                              {b.titulo}
                            </p>
                            <Chip variante={b.origen === "KOA" ? "azul" : "ambar"}>
                              {b.origen}
                            </Chip>
                            <Chip variante={vigente ? "verde" : "gris"}>
                              {vigente ? "Vigente" : "Fuera de vigencia"}
                            </Chip>
                          </div>
                          <p className="mt-0.5 text-xs text-gray-400">
                            Vigencia: {formatFechaCorta(b.vigente_desde)} —{" "}
                            {formatFechaCorta(b.vigente_hasta)}
                          </p>
                          {b.resumen_accionable ? (
                            <p className="mt-1 text-sm text-gray-600">
                              {b.resumen_accionable}
                            </p>
                          ) : (
                            <p className="mt-1 text-xs italic text-gray-300">
                              Resumen accionable pendiente (se genera con IA en
                              Fase 2)
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          {b.urlFirmada && (
                            <a
                              href={b.urlFirmada}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm font-medium text-verde hover:underline"
                            >
                              Ver archivo
                            </a>
                          )}
                          <form action={eliminarBoletin}>
                            <input type="hidden" name="id" value={b.id} />
                            <input
                              type="hidden"
                              name="archivo_url"
                              value={b.archivo_url ?? ""}
                            />
                            <button
                              type="submit"
                              className="text-sm text-gray-300 transition hover:text-rojo"
                              title="Eliminar boletín"
                            >
                              Eliminar
                            </button>
                          </form>
                        </div>
                      </li>
                    );
                  })}
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
