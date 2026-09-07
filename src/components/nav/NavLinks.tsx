"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const enlaces = [
  { href: "/", etiqueta: "Dashboard", icono: "📊" },
  { href: "/mtd", etiqueta: "Mes en curso", icono: "📅" },
  { href: "/meta", etiqueta: "Meta próx. mes", icono: "🧮" },
  { href: "/plan", etiqueta: "Plan de venta", icono: "🎯" },
  { href: "/copiloto", etiqueta: "Copiloto", icono: "✨" },
  { href: "/boletines", etiqueta: "Boletines", icono: "📰" },
  { href: "/estrategia", etiqueta: "Estrategia", icono: "🧭" },
  { href: "/datos", etiqueta: "Datos", icono: "🗂️" },
];

const proximamente: { etiqueta: string; icono: string; fase: string }[] = [];

// `colapsado` = riel de íconos en escritorio (la etiqueta pasa al tooltip).
export function NavLinks({ colapsado = false }: { colapsado?: boolean }) {
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
            title={e.etiqueta}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              activo
                ? "bg-verde-suave text-verde"
                : "text-gray-600 hover:bg-gray-50"
            } ${colapsado ? "lg:justify-center lg:px-0" : ""}`}
          >
            <span>{e.icono}</span>
            <span className={colapsado ? "lg:hidden" : ""}>{e.etiqueta}</span>
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
          <span className={colapsado ? "lg:hidden" : ""}>{e.etiqueta}</span>
          {!colapsado && (
            <span className="ml-auto text-[10px] uppercase">{e.fase}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
