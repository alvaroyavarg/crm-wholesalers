"use client";

import { useActionState } from "react";
import { iniciarSesion, type EstadoLogin } from "./actions";

const estadoInicial: EstadoLogin = { error: "" };

export default function LoginPage() {
  const [estado, formAction, pendiente] = useActionState(
    iniciarSesion,
    estadoInicial,
  );

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-(--radius-card) bg-white p-8 shadow-card">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-verde-suave font-display text-lg font-bold text-verde">
            CM
          </div>
          <h1 className="font-display text-xl font-semibold text-gray-900">
            CRM Mayoristas
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Cuentas clave · Copiloto KAM
          </p>
        </div>

        <form action={formAction} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Correo
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-verde focus:ring-2 focus:ring-verde-suave"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-verde focus:ring-2 focus:ring-verde-suave"
            />
          </div>

          {estado.error && (
            <p className="rounded-lg bg-rojo-suave px-3 py-2 text-sm text-rojo">
              {estado.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pendiente}
            className="w-full rounded-lg bg-verde px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {pendiente ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
      </div>
    </main>
  );
}
