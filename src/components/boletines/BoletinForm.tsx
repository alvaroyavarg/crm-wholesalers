"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { prepararSubidaBoletin, registrarBoletin } from "@/app/(app)/actions";
import { createClient } from "@/lib/supabase/client";

type Fase = "idle" | "subiendo" | "guardando";

// Carga de boletines con feedback en cada paso. El archivo sube DIRECTO del
// navegador a Supabase Storage (URL firmada), así no topa con el límite de
// 4,5 MB de las funciones de Vercel.
export function BoletinForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [fase, setFase] = useState<Fase>("idle");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMensaje("");

    const form = e.currentTarget;
    const datos = new FormData(form);
    const titulo = String(datos.get("titulo") ?? "").trim();
    const origen = String(datos.get("origen") ?? "KOA");
    const vigenteDesde = String(datos.get("vigente_desde") ?? "");
    const vigenteHasta = String(datos.get("vigente_hasta") ?? "");
    const archivo = datos.get("archivo");

    if (!titulo || !vigenteDesde || !vigenteHasta) {
      setError("Completa el título y las fechas de vigencia.");
      return;
    }

    try {
      let ruta: string | null = null;

      if (archivo instanceof File && archivo.size > 0) {
        setFase("subiendo");
        const prep = await prepararSubidaBoletin(archivo.name);
        const supabase = createClient();
        const { error: errSubida } = await supabase.storage
          .from("boletines")
          .uploadToSignedUrl(prep.ruta, prep.token, archivo, {
            contentType: archivo.type || "application/octet-stream",
          });
        if (errSubida) {
          throw new Error(`No pude subir el archivo: ${errSubida.message}`);
        }
        ruta = prep.ruta;
      }

      setFase("guardando");
      const r = await registrarBoletin({
        titulo,
        origen,
        vigenteDesde,
        vigenteHasta,
        rutaArchivo: ruta,
      });

      setMensaje(
        r.analizando
          ? "✓ Boletín guardado. El análisis con IA corre en segundo plano (~1 min) — recarga o vuelve en un momento para ver el resumen y las promociones."
          : "✓ Boletín guardado (sin archivo, no hay nada que analizar).",
      );
      formRef.current?.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar el boletín");
    } finally {
      setFase("idle");
    }
  }

  const textoBoton =
    fase === "subiendo"
      ? "Subiendo archivo…"
      : fase === "guardando"
        ? "Guardando…"
        : "Guardar boletín";

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">
          Título
        </label>
        <input
          name="titulo"
          required
          placeholder="Boletín Mayoristas Centro — Jul 2026"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-verde"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">
          Origen
        </label>
        <select
          name="origen"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-verde"
        >
          <option value="KOA">KOA — Coca-Cola Andina</option>
          <option value="KOE">KOE — Coca-Cola Embonor</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Vigente desde
          </label>
          <input
            name="vigente_desde"
            type="date"
            required
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-verde"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Vigente hasta
          </label>
          <input
            name="vigente_hasta"
            type="date"
            required
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-verde"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">
          Archivo (PDF o imagen)
        </label>
        <input
          name="archivo"
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          className="w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-verde-suave file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-verde"
        />
      </div>

      <button
        type="submit"
        disabled={fase !== "idle"}
        className="w-full rounded-lg bg-verde px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {textoBoton}
      </button>

      {mensaje && (
        <p className="rounded-lg bg-verde-suave px-3 py-2 text-sm text-verde">
          {mensaje}
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-rojo-suave px-3 py-2 text-sm text-rojo">
          {error}
        </p>
      )}
    </form>
  );
}
