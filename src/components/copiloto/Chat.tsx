"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Mensaje {
  role: "user" | "assistant";
  content: string;
  herramientas?: string[];
}

// Render mínimo de markdown (viñetas y negrita) para las respuestas.
function Respuesta({ texto }: { texto: string }) {
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {texto.split("\n").map((l, i) => {
        const t = l.trim();
        if (!t) return <div key={i} className="h-1" />;
        const bold = (s: string) =>
          s.split(/(\*\*[^*]+\*\*)/g).map((f, j) =>
            f.startsWith("**") && f.endsWith("**") ? (
              <strong key={j}>{f.slice(2, -2)}</strong>
            ) : (
              <span key={j}>{f}</span>
            ),
          );
        if (/^[-*•]\s/.test(t))
          return (
            <div key={i} className="flex gap-2">
              <span className="text-verde">•</span>
              <span>{bold(t.replace(/^[-*•]\s/, ""))}</span>
            </div>
          );
        return <p key={i}>{bold(t)}</p>;
      })}
    </div>
  );
}

const SUGERENCIAS = [
  "¿Qué cuentas tienen el mayor gap vs LY este año?",
  "Prepárame la visita a Dimak: oportunidades y argumentos",
  "¿A quién le conviene un escalón de un boletín vigente?",
];

export function Chat({ preguntaInicial = "" }: { preguntaInicial?: string }) {
  const router = useRouter();
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [input, setInput] = useState(preguntaInicial);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const finRef = useRef<HTMLDivElement>(null);

  async function enviar(texto: string) {
    const pregunta = texto.trim();
    if (!pregunta || cargando) return;
    setError("");
    setInput("");

    const nuevos: Mensaje[] = [...mensajes, { role: "user", content: pregunta }];
    setMensajes(nuevos);
    setCargando(true);
    setTimeout(() => finRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    try {
      const res = await fetch("/api/copiloto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mensajes: nuevos.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      // La respuesta puede no ser JSON (timeout / error de la plataforma)
      const crudo = await res.text();
      let data: { texto?: string; herramientas?: { nombre: string }[]; error?: string };
      try {
        data = JSON.parse(crudo);
      } catch {
        throw new Error(
          res.ok
            ? "Respuesta inválida del servidor. Intenta de nuevo."
            : `El análisis tardó demasiado o falló (HTTP ${res.status}). Prueba con una pregunta más acotada o reintenta.`,
        );
      }
      if (!res.ok || !data.texto)
        throw new Error(data.error ?? "Error del copiloto");

      const herramientas = [
        ...new Set(
          ((data.herramientas ?? []) as { nombre: string }[]).map((h) => h.nombre),
        ),
      ];
      setMensajes([
        ...nuevos,
        { role: "assistant", content: data.texto, herramientas },
      ]);
      // Puede haber creado recomendaciones o notas → refrescar server components
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setMensajes(nuevos);
    } finally {
      setCargando(false);
      setTimeout(() => finRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col rounded-(--radius-card) bg-white shadow-card">
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {mensajes.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-verde-suave text-2xl">
              ✨
            </div>
            <p className="font-display text-lg font-semibold text-gray-900">
              Copiloto comercial
            </p>
            <p className="mt-1 max-w-md text-sm text-gray-500">
              Pregúntame sobre tus cuentas: cruzo ventas, perfil, notas y
              boletines vigentes para darte oportunidades con evidencia.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {SUGERENCIAS.map((s) => (
                <button
                  key={s}
                  onClick={() => enviar(s)}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:border-verde hover:text-verde"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensajes.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                m.role === "user"
                  ? "bg-verde text-white"
                  : "bg-gray-50 text-gray-800"
              }`}
            >
              {m.role === "assistant" ? (
                <Respuesta texto={m.content} />
              ) : (
                <p className="text-sm">{m.content}</p>
              )}
              {m.herramientas && m.herramientas.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1 border-t border-gray-200 pt-2">
                  {m.herramientas.map((h) => (
                    <span
                      key={h}
                      className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-gray-400"
                    >
                      {h}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {cargando && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-gray-50 px-4 py-2.5 text-sm text-gray-400">
              Analizando la data…
            </div>
          </div>
        )}
        {error && <p className="text-sm text-rojo">{error}</p>}
        <div ref={finRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviar(input);
        }}
        className="flex gap-2 border-t border-gray-100 p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pregúntale al copiloto… (ej: prepárame la visita del jueves a Pérez)"
          disabled={cargando}
          className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-verde focus:ring-2 focus:ring-verde-suave disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={cargando || !input.trim()}
          className="rounded-xl bg-verde px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
