import Anthropic from "@anthropic-ai/sdk";

// Cliente de Anthropic — SOLO servidor. La API key nunca se expone al cliente.
export function anthropic() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY en el entorno.");
  return new Anthropic({ apiKey });
}

// Modelos (centralizados). Haiku para tareas simples (resumir boletines,
// estructurar notas); Sonnet para el agente copiloto de la Fase 3.
export const MODELO_RAPIDO = "claude-haiku-4-5";
export const MODELO_AGENTE = "claude-sonnet-4-6";
