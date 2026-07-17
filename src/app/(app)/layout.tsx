import { NavLinks } from "@/components/nav/NavLinks";
import { cerrarSesion } from "./actions";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 flex w-60 flex-col border-r border-gray-100 bg-white p-4">
        <div className="mb-6 flex items-center gap-3 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-verde font-display text-sm font-bold text-white">
            CM
          </div>
          <div>
            <p className="font-display text-sm font-semibold leading-tight text-gray-900">
              CRM Mayoristas
            </p>
            <p className="text-[11px] text-gray-400">Canal mayorista · KAM</p>
          </div>
        </div>

        <NavLinks />

        <form action={cerrarSesion} className="mt-auto">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-500 transition hover:bg-gray-50"
          >
            <span>↩︎</span> Cerrar sesión
          </button>
        </form>
      </aside>

      <main className="ml-60 flex-1 p-8">{children}</main>
    </div>
  );
}
