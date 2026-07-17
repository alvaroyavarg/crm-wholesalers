# Prompt maestro — CRM Mayoristas + Copiloto KAM

## Contexto

Soy Key Account Manager en Diageo Chile y gestiono la cartera de clientes clave del canal mayorista. La estructura del canal es una pirámide: un Top 3 de clientes concentra ~24% del volumen (54k EUs), los siguientes 22 clientes suman ~56% (130k EUs) — juntos son las **~25 cuentas que concentran el 80% de la venta y que este CRM gestiona**. La cola larga (~360 clientes, 20% del volumen) la atienden los embotelladores KOA y KOE vía precio y su propia fuerza de venta: **queda explícitamente fuera del alcance de esta app** (no cargar esos clientes, no diseñar para ellos).

Quiero construir una web app personal (un solo usuario: yo) que funcione como CRM de mis cuentas y como copiloto de IA que analiza la venta histórica, mantiene memoria de cada cliente y me recomienda oportunidades concretas por cuenta.

Ya construí y desplegué antes una app similar en complejidad (Next.js en Vercel, backend Node que llama a la API de Anthropic), así que puedes asumir que sé desplegar y configurar variables de entorno.

## Stack (no cambiar sin preguntarme)

- **Next.js 14+ (App Router) + TypeScript**, deploy en Vercel
- **Supabase** (Postgres + Auth + Storage) como base de datos
- **API de Anthropic** desde el server (route handlers / server actions). Nunca exponer la API key al cliente.
- Modelo por defecto: `claude-sonnet-4-6` para el agente; usar un modelo Haiku para tareas simples (resumir boletines, estructurar notas). Usar **prompt caching** para el system prompt y la estrategia del canal.
- Tailwind CSS para estilos.
- Auth simple de Supabase (email + password, un solo usuario). Toda la data es privada.

## Concepto de producto

Tres piezas:

1. **CRM de cartera**: las ~25 cuentas clave segmentadas según la pirámide real del canal: `TOP3` (3 cuentas, ~24% del volumen del canal) y `CLAVE` (22 cuentas, ~56%). La cola larga NO se gestiona aquí.
2. **Memoria por cliente**: notas de visita + un "perfil del comprador" que el agente mantiene sintetizado.
3. **Copiloto IA**: agente con tool use que cruza ventas + memoria + estrategia + boletines vigentes y entrega recomendaciones accionables **con evidencia** (cada recomendación cita de dónde salió: boletín, memoria o ventas).

## Modelo de datos (Supabase)

```sql
clientes        (id, nombre, rut, comuna, cliente_desde, meta_ciclo_eus,
                 segmento enum('TOP3','CLAVE'), activo)
ventas          (id, cliente_id, periodo date, marca, categoria, eus, valor)
notas           (id, cliente_id, fecha, tipo enum('visita','llamada','acuerdo','rechazo','nota'),
                 contenido_raw text, contenido_estructurado jsonb, creado_por_agente bool)
perfiles        (cliente_id pk, decisor, estilo_negociacion, frecuencia_compra,
                 marcas_afines text[], rechazos jsonb, acuerdos jsonb,
                 resumen text, actualizado_at)
conocimiento    (id, tipo enum('estrategia','politica'), titulo, contenido md, actualizado_at)
boletines       (id, titulo, fecha_publicacion, vigente_desde, vigente_hasta,
                 resumen_accionable text, contenido_raw text, archivo_url)
recomendaciones (id, cliente_id, texto, evidencia jsonb[{tipo:'boletin'|'memoria'|'ventas', ref, detalle}],
                 estado enum('nueva','aceptada','descartada'), creada_at)
conversaciones  (id, cliente_id nullable, mensajes jsonb, creada_at)  -- historial del chat con el copiloto
```

Notas:
- `ventas` se carga vía **importador de Excel/CSV** (columnas: cliente, periodo, marca, categoría, EUs, valor). Hacer el mapeo de columnas flexible.
- Categorías del negocio: Whisky, Vodka, Gin, Tequila, Ron, Licores, RTD. Marcas ejemplo: Johnnie Walker Red/Black, Buchanan's, Smirnoff, Tanqueray, Don Julio, Baileys.

## Arquitectura del agente

Endpoint server-side que ejecuta el loop de tool use con la API de Anthropic:

**System prompt** (con prompt caching): rol de asistente comercial para un KAM de Diageo Chile con ~25 mayoristas que concentran el 80% de la venta del canal + el contenido completo de la tabla `conocimiento` (estrategia del canal, editable desde la app).

**Herramientas del agente:**
- `get_ventas_cliente(cliente_id, desde, hasta)` → serie por marca/categoría/mes
- `comparar_con_pares(cliente_id)` → mix del cliente vs promedio de su segmento (TOP3 o CLAVE) y vs la cartera completa, gaps en puntos porcentuales. Comparar por segmento evita que una cuenta CLAVE se mida contra los 3 gigantes. Ojo: TOP3 son solo 3 cuentas, así que para ellas el benchmark principal es la cartera completa.
- `get_perfil_cliente(cliente_id)` → perfil del comprador
- `get_notas_cliente(cliente_id, limit)` → últimas notas crudas
- `get_boletines_vigentes()` → solo boletines con vigencia activa a la fecha
- `guardar_nota(cliente_id, tipo, contenido)` → estructura y guarda una nota
- `actualizar_perfil(cliente_id, cambios)` → actualiza el perfil del comprador
- `crear_recomendacion(cliente_id, texto, evidencia[])` → cada recomendación DEBE incluir evidencia

**Reglas del agente:**
1. Toda recomendación lleva evidencia con tipo (`boletin`/`memoria`/`ventas`) y detalle. Sin evidencia no se crea.
2. Los cálculos numéricos (tendencias, mix, gaps) se hacen en SQL/TypeScript, no por el modelo — las tools devuelven insights ya calculados, nunca data cruda masiva.
3. Cuando guardo una nota de visita, el agente decide si algo modifica el perfil (nuevo decisor, cambio de estilo, rechazo, acuerdo) y llama `actualizar_perfil`.
4. Consolidación: si un cliente acumula más de ~30 notas, el agente resume las antiguas dentro del campo `resumen` del perfil.

**Flujos de ingesta:**
- Subir PDF de boletín comercial → extraer texto → llamada a Haiku que produce `resumen_accionable` (promos con %, vigencias, focos de marca, cambios de precio) → guardar con vigencia.
- Editar la estrategia del canal como markdown desde la app (tabla `conocimiento`).

## UI — pantallas y estilo

Referencia visual: estilo SimplyDepo (claro, limpio, profesional SaaS). Tengo un mockup HTML aprobado (`crm-mayoristas-bosquejo-v2.html`) — replicar sus tokens:

- Fondo `#F5F6F8`, cards blancas radius 16px con sombra sutil `0 1px 3px rgba(31,41,55,.06)`
- Acento verde `#2E9E5B` con fondo suave `#E7F4EC`; alerta ámbar `#C77D1E`/`#FBF1E2`; negativo rojo `#D14D3B`/`#FBEAE7`; azul memoria `#4A5FA5`/`#EBEEF8`
- Tipografía: Poppins (títulos, 600-700) + Inter (cuerpo)
- Chips redondeados para estados y tags; KPI cards con ícono en círculo verde suave
- **Desktop-first**: la app se diseña y optimiza para escritorio (layout de 3 columnas, tablas densas, pantallas de análisis). Usar layouts responsive razonables pero NO invertir tiempo en optimización móvil todavía — la versión para terreno/celular será una fase posterior con su propia UX (captura rápida de notas, ficha resumida pre-visita)

**Pantallas MVP:**
1. **Dashboard**: 3 KPIs (volumen ciclo, avance vs meta, cuentas en riesgo) + lista de cartera (nombre, barra vertical de avance vs meta, volumen, última visita, chip % vs LY) con filtros Todas / En riesgo / Creciendo.
2. **Ficha de cliente**: header con datos base, tags de perfil (verde = dato duro, azul = aprendido por el agente, ámbar = alerta), gráfico de mix por categoría vs pares (barra + marca del promedio), timeline de notas, y recomendaciones del copiloto para ese cliente.
3. **Copiloto**: panel/página de chat con el agente + feed de recomendaciones como cards con chips de evidencia y acciones (Aceptar / Descartar). Prompt libre tipo "prepárame la visita del jueves a Pérez".
4. **Nota de visita**: botón flotante siempre visible → modal de texto libre (registro rápido post-visita); el agente la estructura.
5. **Datos**: importador de Excel/CSV de ventas, gestión de boletines (subir PDF, ver vigentes/vencidos), editor de estrategia del canal.

## Plan de trabajo (en este orden)

1. **Fase 1**: Setup Next.js + Supabase + auth, schema SQL con migraciones, seed con data ficticia realista (25 clientes: 3 TOP3 que concentren ~30% del volumen de la cartera y 22 CLAVE con el resto, 18 meses de ventas), Dashboard + Ficha de cliente con cálculos (vs LY, mix vs pares, avance meta).
2. **Fase 2**: Importador de ventas + captura de notas + CRUD de conocimiento y boletines (con resumen automático vía Haiku).
3. **Fase 3**: Agente completo con tool use, perfil del comprador auto-mantenido, feed de recomendaciones con evidencia, chat.
4. **Fase 4**: Prompt caching, consolidación de memoria, pulido general de escritorio.
5. **Fase 5 (futura, no partir aún)**: Versión móvil / de terreno — UX propia enfocada en captura rápida de notas post-visita (voz/texto), ficha resumida del cliente antes de entrar a la reunión, y recomendaciones del día. No es solo hacer responsive el escritorio; se diseñará aparte cuando la versión desktop esté estable.

Empieza por la Fase 1. Antes de escribir código, muéstrame el plan de archivos y el schema final para validarlo. Ve commiteando por fase.

## Variables de entorno esperadas

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
```

## Restricciones

- Un solo usuario; no construir gestión de equipos ni permisos.
- Español chileno en toda la UI ("ciclo", "vs LY", "mayorista"). El volumen se mide y muestra en EUs (unidades equivalentes, estándar Diageo), no en cajas físicas.
- Data sensible comercial: nada de analytics de terceros ni llamadas a servicios externos fuera de Supabase y Anthropic.
- Costos: mantener el diseño eficiente en tokens (insights calculados, caching, Haiku para tareas simples).
