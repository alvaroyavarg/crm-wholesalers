"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Shell responsivo: en escritorio el sidebar es fijo; en móvil se colapsa a
// una barra superior con hamburguesa que abre un drawer.
export function Sidebar({ children }: { children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const pathname = usePathname();

  // Cerrar el drawer al navegar
  useEffect(() => {
    setAbierto(false);
  }, [pathname]);

  return (
    <>
      {/* Barra superior — solo móvil */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-gray-100 bg-white px-4 lg:hidden">
        <button
          onClick={() => setAbierto(true)}
          aria-label="Abrir menú"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-xl text-gray-600 transition hover:bg-gray-50"
        >
          ☰
        </button>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-verde font-display text-xs font-bold text-white">
          CM
        </div>
        <p className="font-display text-sm font-semibold text-gray-900">
          CRM Mayoristas
        </p>
      </header>

      {/* Overlay del drawer — solo móvil */}
      {abierto && (
        <div
          className="fixed inset-0 z-40 bg-gray-900/40 lg:hidden"
          onClick={() => setAbierto(false)}
        />
      )}

      {/* Sidebar: drawer en móvil, fijo en escritorio */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-gray-100 bg-white p-4 transition-transform duration-200 lg:w-60 lg:translate-x-0 ${
          abierto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {children}
      </aside>
    </>
  );
}
