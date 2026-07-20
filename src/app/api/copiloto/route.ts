import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODELO_AGENTE } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { construirSistema } from "@/lib/agente/sistema";
import { ejecutarHerramienta, TOOLS } from "@/lib/agente/herramientas";

export const maxDuration = 60;

interface MensajeChat {
  role: "user" | "assistant";
  content: string;
}

const MAX_ITERACIONES = 8;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let body: { mensajes?: MensajeChat[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const historial = (body.mensajes ?? []).filter(
    (m) => m.role && typeof m.content === "string",
  );
  if (historial.length === 0) {
    return NextResponse.json({ error: "Sin mensajes" }, { status: 400 });
  }

  const sistema = await construirSistema(supabase);

  const messages: Anthropic.MessageParam[] = historial.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const herramientasUsadas: { nombre: string; input: unknown }[] = [];
  let textoFinal = "";

  try {
    const client = anthropic();
    for (let i = 0; i < MAX_ITERACIONES; i++) {
      const respuesta = await client.messages.create({
        model: MODELO_AGENTE,
        max_tokens: 8000,
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
        textoFinal = respuesta.content
          .filter((b) => b.type === "text")
          .map((b) => (b.type === "text" ? b.text : ""))
          .join("\n")
          .trim();
        break;
      }

      // Ejecutar cada tool_use y devolver los resultados en un solo mensaje user
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

    return NextResponse.json({
      texto: textoFinal,
      herramientas: herramientasUsadas,
    });
  } catch (e) {
    console.error("copiloto error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error del copiloto" },
      { status: 500 },
    );
  }
}
