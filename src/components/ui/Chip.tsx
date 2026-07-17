type Variante = "verde" | "ambar" | "rojo" | "azul" | "gris";

const estilos: Record<Variante, string> = {
  verde: "bg-verde-suave text-verde",
  ambar: "bg-ambar-suave text-ambar",
  rojo: "bg-rojo-suave text-rojo",
  azul: "bg-azul-suave text-azul",
  gris: "bg-gray-100 text-gray-600",
};

export function Chip({
  children,
  variante = "gris",
  title,
}: {
  children: React.ReactNode;
  variante?: Variante;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${estilos[variante]}`}
    >
      {children}
    </span>
  );
}
