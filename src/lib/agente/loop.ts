import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anthropic, MODELO_AGENTE } from "@/lib/anthropic";
import { construirSistema } from "./sistema";
import { ejecutarHerramienta, TOOLS } from "./herramientas";

// Loop de tool use del copiloto. Lo usan el endpoint del chat y las acciones
// que generan recomendaciones desde la ficha del cliente.

export interface MensajeChat {
  role: "user" | "assistant";
  content: string;
}

export interface ResultadoAgente {
  texto: string;
  herramientas: { nombre: string; input: unknown }[];
}

const MAX_ITERACIONES = 8;

export async function correrAgente(
  supabase: SupabaseClient,
  historial: MensajeChat[],
): Promise<ResultadoAgente> {
  const sistema = await construirSistema(supabase);

  const messages: Anthropic.MessageParam[] = historial.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const herramientasUsadas: { nombre: string; input: unknown }[] = [];
  let textoFinal = "";

  const client = anthropic();
  for (let i = 0; i < MAX_ITERACIONES; i++) {
    const respuesta = await client.messages.create({
      model: MODELO_AGENTE,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: [
        { type: "text", text: sistema, cache_control: { type: "ephemeral" } },
      ],
      tools: TOOLS,
      messages,
    });

    // Preservar el turno completo (incluye thinking + tool_use) para el loop
    messages.push({ role: "assistant", content: respuesta.content });

    if (respuesta.stop_reason !== "tool_use") {
      if (respuesta.stop_reason === "max_tokens") {
        console.warn("copiloto: respuesta cortada por max_tokens");
      }
      textoFinal = respuesta.content
        .filter((b) => b.type === "text")
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("\n")
        .trim();
      break;
    }

    const resultados: Anthropic.ToolResultBlockParam[] = [];
    for (const bloque of respuesta.content) {
      if (bloque.type !== "tool_use") continue;
      herramientasUsadas.push({ nombre: bloque.name, input: bloque.input });
      let resultado: unknown;
      try {
        resultado = await ejecutarHerramienta(
          supabase,
          bloque.name,
          bloque.input as Record<string, unknown>,
        );
      } catch (e) {
        resultado = { error: e instanceof Error ? e.message : "error" };
      }
      resultados.push({
        type: "tool_result",
        tool_use_id: bloque.id,
        content: JSON.stringify(resultado),
      });
    }
    messages.push({ role: "user", content: resultados });
  }

  if (!textoFinal) {
    textoFinal =
      "Llegué al límite de pasos sin cerrar la respuesta. Reformula la pregunta o pídeme algo más acotado.";
  }

  return { texto: textoFinal, herramientas: herramientasUsadas };
}
