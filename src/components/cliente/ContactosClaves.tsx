import { agregarContacto, eliminarContacto } from "@/app/(app)/actions";
import type { Contacto } from "@/lib/types";

// Contactos claves del cliente: lista + alta rápida + eliminación.
export function ContactosClaves({
  clienteId,
  contactos,
}: {
  clienteId: string;
  contactos: Contacto[];
}) {
  return (
    <div>
      {contactos.length === 0 ? (
        <p className="mb-4 text-sm text-gray-400">
          Sin contactos registrados todavía.
        </p>
      ) : (
        <ul className="mb-4 space-y-3">
          {contactos.map((c) => (
            <li
              key={c.id}
              className="flex items-start justify-between gap-3 rounded-xl bg-gray-50/70 px-3 py-2.5"
            >
              <div className="min-w-0 text-sm">
                <p className="font-medium text-gray-900">
                  {c.nombre}
                  {c.cargo && (
                    <span className="ml-2 font-normal text-gray-500">
                      {c.cargo}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {c.correo && (
                    <a
                      href={`mailto:${c.correo}`}
                      className="hover:text-verde hover:underline"
                    >
                      {c.correo}
                    </a>
                  )}
                  {c.correo && c.telefono && " · "}
                  {c.telefono && (
                    <a
                      href={`tel:${c.telefono.replace(/\s/g, "")}`}
                      className="hover:text-verde hover:underline"
                    >
                      {c.telefono}
                    </a>
                  )}
                </p>
              </div>
              <form action={eliminarContacto}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="cliente_id" value={clienteId} />
                <button
                  type="submit"
                  className="text-xs text-gray-300 transition hover:text-rojo"
                  title="Eliminar contacto"
                >
                  ✕
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={agregarContacto} className="space-y-2">
        <input type="hidden" name="cliente_id" value={clienteId} />
        <div className="grid grid-cols-2 gap-2">
          <input
            name="nombre"
            required
            placeholder="Nombre *"
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-verde"
          />
          <input
            name="cargo"
            placeholder="Cargo"
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-verde"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            name="correo"
            type="email"
            placeholder="Correo"
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-verde"
          />
          <input
            name="telefono"
            placeholder="Teléfono"
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-verde"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-lg bg-verde-suave px-3 py-1.5 text-sm font-semibold text-verde transition hover:bg-verde hover:text-white"
        >
          + Agregar contacto
        </button>
      </form>
    </div>
  );
}
