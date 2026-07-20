import { ConocimientoEditor } from "@/components/estrategia/ConocimientoEditor";
import { listarConocimiento } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function EstrategiaPage() {
  const items = await listarConocimiento();

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-gray-900">
          Estrategia del canal
        </h1>
        <p className="text-sm text-gray-500">
          Estrategia comercial y políticas del canal, en markdown. El copiloto
          las carga como contexto en su system prompt (con prompt caching) para
          que sus recomendaciones estén alineadas a la estrategia.
        </p>
      </header>

      <ConocimientoEditor items={items} />
    </div>
  );
}
