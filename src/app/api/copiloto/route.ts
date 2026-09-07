import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { correrAgente, type MensajeChat } from "@/lib/agente/loop";

// El loop del agente puede tomar varios minutos (hasta 8 llamadas al modelo)
export const maxDuration = 300;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let body: { mensajes?: MensajeChat[]; cliente_id?: string; conversacion_id?: string };
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

    // Chat en contexto de un cliente (panel de Meta): se persiste en
    // conversaciones para retomarlo la próxima vez que se abra el panel.
    let conversacionId = body.conversacion_id ?? null;
    if (body.cliente_id) {
      const mensajes = [...historial, { role: "assistant", content: resultado.texto }];
      const ahora = new Date().toISOString();
      if (conversacionId) {
        await supabase
          .from("conversaciones")
          .update({ mensajes, actualizada_at: ahora })
          .eq("id", conversacionId);
      } else {
        const { data } = await supabase
          .from("conversaciones")
          .insert({ cliente_id: body.cliente_id, mensajes, actualizada_at: ahora })
          .select("id")
          .single();
        conversacionId = (data?.id as string | undefined) ?? null;
      }
    }

    return NextResponse.json({
      texto: resultado.texto,
      herramientas: resultado.herramientas,
      conversacion_id: conversacionId,
    });
  } catch (e) {
    console.error("copiloto error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error del copiloto" },
      { status: 500 },
    );
  }
}
