# CRM Mayoristas + Copiloto KAM — memoria del proyecto

App personal de un KAM de Diageo Chile para la cartera del canal mayorista.
Stack: Next.js 15 (App Router) + TypeScript + Tailwind + Supabase + API de Anthropic.
`main` se despliega solo en Vercel. Las migraciones SQL las corre el usuario a mano
en el SQL Editor de Supabase (no hay credenciales en el entorno de desarrollo).

Documento de origen del producto: `prompt-maestro-crm-mayoristas.md`.

## Reglas de negocio (no cambiar sin preguntar)

- **Calendario fiscal** julio–junio: P1 = julio … P12 = junio. FY27 = jul 2026 – jun 2027.
  Helpers en `src/lib/fiscal.ts` (`aFiscal`, `inicioPeriodo`, `sumarPeriodos`, `etiquetaMesCalendario`).
- **Unidades**: todo se guarda en EU (caja equivalente Diageo). EU = UC × 5,678/9.
  Smirnoff Ice se cuenta a un décimo (÷10 extra). UC es solo para mostrar
  (`FACTOR_UC_EU` en `src/lib/importar/unidades.ts`). Ojo: en UC agregadas
  Smirnoff Ice se ve 10× más chico; pendiente de mejorar.
- **Cartera**: ~40 cuentas activas con código DIAGEO/KOA/KOE en `cliente_codigos`.
  Dos filas `clientes.es_otros` ("Otros Andina", "Otros Embonor") agrupan la venta
  no gestionada de cada bottler; los clientes inactivos suman ahí vía
  `eus_por_cliente_mes`. Los "Otros" se excluyen del copiloto y del roster.
- **Meta del cliente = suma de metas por SKU** (`plan_ventas_sku`, trigger
  `trg_sync_plan_desde_sku` recalcula `plan_ventas`). Nunca escribir el total a mano.
  La línea "Sin desglose" guarda lo aún no repartido: al asignar o subir un SKU se
  descuenta de ahí, y la meta total solo sube cuando llega a 0 (`guardarMetaSku`).
  La meta viene del Armado mensual (ej. sept-26 en `0017` / `0026`); el copiloto la
  reparte entre SKU, no la agranda.
- **Facturado del mes** (`facturadoMes` en `src/lib/metrics.ts`):
  - Si el bottler del cliente cargó el mes (`importaciones` origen KOA/KOE):
    facturado = venta real del archivo + pedidos facturados que **no** vienen en el
    archivo, es decir con fecha posterior al corte **y** anotados después de la carga
    (`pedidoFueraDeCarga`). Lo anotado antes de cargar se asume incluido.
  - Si no cargó: facturado = pedidos marcados facturados a mano.
  - Comprometido e ingresado van aparte (`pedidos.estado`).
- **Cargas**: el archivo de un bottler reemplaza `ventas` de ese (mes, bottler) y deja
  una fila en `importaciones` con `fecha_corte` = último día con venta del archivo.
  La base consolidada Diageo reemplaza meses completos y deja filas `DIAGEO`; por
  defecto no pisa meses cargados desde bottlers (`pisarBottler`).
- **Propuestas del copiloto** por SKU: una fila en `recomendaciones` por SKU con
  evidencia `meta_sku`; se resuelven solo desde el panel (`resolverPropuesta`), se
  filtran de los feeds (`esPropuestaSku`). Aceptar/modificar/rechazar y feedback
  alimentan el system prompt (`src/lib/agente/sistema.ts`).

## Mapa del código

- `src/app/(app)/page.tsx` dashboard del mes; `meta/` tabla principal + panel de
  cliente (`src/components/meta/`); `plan/` grilla anual solo lectura; `datos/`
  importadores y matriz de cargas; `copiloto/`, `boletines/`, `estrategia/`.
- `src/lib/queries.ts` (`metaProximoMes`, `dashboardMes`), `src/lib/metrics.ts`,
  `src/app/(app)/actions.ts`, `src/app/(app)/meta/panel-actions.ts`.
- Agente: `src/lib/agente/{loop,sistema,herramientas}.ts` (Sonnet con thinking,
  fallback Haiku para estructurar JSON).
- RPCs de rendimiento (migración `0022`): `eus_por_cliente_mes`, `resumen_meta_periodo`,
  `mtd_cartera`, `detalle_meta_cliente`; `ytd_por_cliente` (`0024`).
- Migraciones en `supabase/migrations/` numeradas; la última corrida por el usuario
  es la 0026 salvo que el historial diga otra cosa. La 0025 (backfill del log DIAGEO)
  estaba pendiente al 17-sep-2026.

## Cómo verificar

```bash
rm -rf .next/types && npx tsc --noEmit -p .
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder SUPABASE_SERVICE_ROLE_KEY=placeholder npx next build
```

No hay ESLint configurado ni tests. Playwright está en `/opt/node22/lib/node_modules/playwright`.

## Estilo de trabajo con el usuario

- Responder en español, directo, sin tecnicismos innecesarios. Cifras en UC cuando
  se habla de metas o venta (así las maneja el negocio), aclarando si son EU.
- Cuando hace falta tocar la base, entregar el SQL listo para pegar en Supabase y
  decir qué resultado esperar.
- No afirmar que la data es ficticia en comunicaciones externas.

## Roadmap acordado (sep-2026)

1. Estrategia: entradas base (foco de marcas, escalones/precios por bottler, criterios de volumen).
2. Boletines: normalizar SKU al catálogo, filtrar por bottler y vigencia del mes, "faltan N UC para el escalón" en el panel.
3. Ficha de cliente: bloque de mes actual; quitar inventario/crédito.
4. Diferencia Embonor (1.877 UC) entre reporte manual y archivo: posibles clientes
   clasificados como ruta que son mayoristas; pendiente de revisar con archivo nuevo.
