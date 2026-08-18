// Render ligero de markdown para respuestas del copiloto, resúmenes de
// boletines y conocimiento: negritas, viñetas, listas numeradas, títulos.
// Un solo componente para que todo se vea igual de ordenado.

function Negritas({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(\*\*[^*]+\*\*)/g).map((f, j) =>
        f.startsWith("**") && f.endsWith("**") ? (
          <strong key={j} className="font-semibold text-gray-900">
            {f.slice(2, -2)}
          </strong>
        ) : (
          <span key={j}>{f}</span>
        ),
      )}
    </>
  );
}

export function MarkdownLigero({
  texto,
  className = "",
}: {
  texto: string;
  className?: string;
}) {
  // Los separadores "---" solo meten ruido en tarjetas chicas
  const limpio = texto.replace(/^\s*-{3,}\s*/gm, "");
  const lineas = limpio.split("\n");

  return (
    <div className={`space-y-2 text-sm leading-relaxed ${className}`}>
      {lineas.map((l, i) => {
        const t = l.trim();
        if (!t) return null;

        if (t.startsWith("### ") || t.startsWith("## ") || t.startsWith("# ")) {
          return (
            <p
              key={i}
              className="pt-1.5 font-display text-sm font-semibold text-gray-900"
            >
              {t.replace(/^#+\s/, "")}
            </p>
          );
        }

        const numerada = t.match(/^(\d+)[.)]\s+(.*)$/);
        if (numerada) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="shrink-0 font-semibold text-verde">
                {numerada[1]}.
              </span>
              <span className="min-w-0">
                <Negritas texto={numerada[2]} />
              </span>
            </div>
          );
        }

        if (/^[-*•]\s/.test(t)) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="shrink-0 text-verde">•</span>
              <span className="min-w-0">
                <Negritas texto={t.replace(/^[-*•]\s/, "")} />
              </span>
            </div>
          );
        }

        return (
          <p key={i}>
            <Negritas texto={t} />
          </p>
        );
      })}
    </div>
  );
}
