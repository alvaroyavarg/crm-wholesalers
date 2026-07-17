"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const enlaces = [
  { href: "/", etiqueta: "Dashboard", icono: "📊" },
  { href: "/plan", etiqueta: "Plan de venta", icono: "🎯" },
];

const proximamente = [
  { etiqueta: "Copiloto", icono: "✨", fase: "Fase 3" },
  { etiqueta: "Datos", icono: "🗂️", fase: "Fase 2" },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {enlaces.map((e) => {
        const activo =
          e.href === "/" ? pathname === "/" : pathname.startsWith(e.href);
        return (
          <Link
            key={e.href}
            href={e.href}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              activo
                ? "bg-verde-suave text-verde"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <span>{e.icono}</span>
            {e.etiqueta}
          </Link>
        );
      })}

      {proximamente.map((e) => (
        <span
          key={e.etiqueta}
          className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-300"
          title={`Disponible en ${e.fase}`}
        >
          <span className="opacity-50">{e.icono}</span>
          {e.etiqueta}
          <span className="ml-auto text-[10px] uppercase">{e.fase}</span>
        </span>
      ))}
    </nav>
  );
}
