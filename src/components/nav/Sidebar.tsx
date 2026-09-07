"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { NavLinks } from "@/components/nav/NavLinks";
import { cerrarSesion } from "@/app/(app)/actions";

const CLAVE_COLAPSADO = "crm.sidebar.colapsado";

// Shell de la app. Móvil: barra superior con hamburguesa que abre un drawer.
// Escritorio: sidebar fijo que se puede plegar a un riel de íconos para
// ganar ancho en la página (tablas densas, MTD, meta). El estado se recuerda
// en localStorage.
export function Sidebar({ children }: { children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false); // drawer móvil
  const [colapsado, setColapsado] = useState(false); // riel escritorio
  const pathname = usePathname();

  // Cerrar el drawer al navegar
  useEffect(() => {
    setAbierto(false);
  }, [pathname]);

  // Recordar el estado plegado (después de montar, para no romper la hidratación)
  useEffect(() => {
    try {
      setColapsado(localStorage.getItem(CLAVE_COLAPSADO) === "1");
    } catch {
      /* sin storage */
    }
  }, []);

  function alternar() {
    setColapsado((v) => {
      try {
        localStorage.setItem(CLAVE_COLAPSADO, v ? "0" : "1");
      } catch {
        /* sin storage */
      }
      return !v;
    });
  }

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
        <p className="font-display text-sm font-semibold text-gray-900">CRM Mayoristas</p>
      </header>

      {/* Overlay del drawer — solo móvil */}
      {abierto && (
        <div
          className="fixed inset-0 z-40 bg-gray-900/40 lg:hidden"
          onClick={() => setAbierto(false)}
        />
      )}

      {/* Sidebar: drawer en móvil (siempre ancho), fijo en escritorio (ancho o riel) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-gray-100 bg-white p-4 transition-all duration-200 lg:translate-x-0 ${
          abierto ? "translate-x-0" : "-translate-x-full"
        } ${colapsado ? "lg:w-16 lg:p-2" : "lg:w-60"}`}
      >
        {/* Logo */}
        <div
          className={`mb-6 flex items-center gap-3 px-2 ${colapsado ? "lg:justify-center lg:px-0" : ""}`}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-verde font-display text-sm font-bold text-white">
            CM
          </div>
          <div className={colapsado ? "lg:hidden" : ""}>
            <p className="font-display text-sm font-semibold leading-tight text-gray-900">
              CRM Mayoristas
            </p>
            <p className="text-[11px] text-gray-400">Canal mayorista · KAM</p>
          </div>
        </div>

        <NavLinks colapsado={colapsado} />

        <div className="mt-auto flex flex-col gap-1">
          {/* Plegar / desplegar — solo escritorio */}
          <button
            type="button"
            onClick={alternar}
            title={colapsado ? "Mostrar menú" : "Ocultar menú"}
            aria-label={colapsado ? "Mostrar menú" : "Ocultar menú"}
            className={`hidden items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-500 transition hover:bg-gray-50 lg:flex ${
              colapsado ? "lg:justify-center lg:px-0" : ""
            }`}
          >
            <span>{colapsado ? "»" : "«"}</span>
            {!colapsado && <span>Ocultar menú</span>}
          </button>

          <form action={cerrarSesion}>
            <button
              type="submit"
              title="Cerrar sesión"
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-500 transition hover:bg-gray-50 ${
                colapsado ? "lg:justify-center lg:px-0" : ""
              }`}
            >
              <span>↩︎</span>
              <span className={colapsado ? "lg:hidden" : ""}>Cerrar sesión</span>
            </button>
          </form>
        </div>
      </aside>

      <main
        className={`px-4 pb-24 pt-20 transition-[margin] duration-200 lg:px-8 lg:pb-8 lg:pt-8 ${
          colapsado ? "lg:ml-16" : "lg:ml-60"
        }`}
      >
        {children}
      </main>
    </>
  );
}
