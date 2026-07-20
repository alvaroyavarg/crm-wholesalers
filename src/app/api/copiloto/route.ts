import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { correrAgente, type MensajeChat } from "@/lib/agente/loop";

export const maxDuration = 60;

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

  try {
    const resultado = await correrAgente(supabase, historial);
    return NextResponse.json({
      texto: resultado.texto,
      herramientas: resultado.herramientas,
    });
  } catch (e) {
    console.error("copiloto error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error del copiloto" },
      { status: 500 },
    );
  }
}
