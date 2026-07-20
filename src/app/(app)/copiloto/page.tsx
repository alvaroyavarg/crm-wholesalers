import { Card } from "@/components/ui/Card";
import { Chat } from "@/components/copiloto/Chat";
import { FeedRecomendaciones } from "@/components/copiloto/FeedRecomendaciones";
import { recomendacionesFeed } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function CopilotoPage({
  searchParams,
}: {
  searchParams: Promise<{ pregunta?: string }>;
}) {
  const { pregunta } = await searchParams;
  const recomendaciones = await recomendacionesFeed();

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-4">
        <h1 className="font-display text-2xl font-semibold text-gray-900">
          Copiloto
        </h1>
        <p className="text-sm text-gray-500">
          Asistente con acceso a ventas, perfil, notas y boletines vigentes.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Chat preguntaInicial={pregunta ?? ""} />
        </div>
        <div>
          <Card>
            <h2 className="mb-3 font-display text-base font-semibold text-gray-900">
              Recomendaciones nuevas
            </h2>
            <FeedRecomendaciones
              recomendaciones={recomendaciones}
              mostrarCliente
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
