export type Segmento = "TOP3" | "CLAVE";
export type TipoNota = "visita" | "llamada" | "acuerdo" | "rechazo" | "nota" | "compromiso" | "idea";

export interface Cliente {
  id: string;
  nombre: string;
  nombre_corto: string | null;
  rut: string | null;
  comuna: string | null;
  region: string | null;
  bottler: string | null;
  cliente_desde: string | null;
  segmento: Segmento;
  activo: boolean;
  dias_inventario: number | null;
  credito_disponible: number | null;
}

// Fila del RPC resumen_cartera
export interface ResumenCliente {
  cliente_id: string;
  nombre: string;
  nombre_corto: string | null;
  segmento: Segmento;
  comuna: string | null;
  dias_inventario: number | null;
  credito_disponible: number | null;
  ytd_eus: number;
  ytd_ly_eus: number;
  plan_ytd_eus: number;
  mes_eus: number;
  plan_mes_eus: number;
  fy_ly_eus: number;
  plan_fy_eus: number;
  ultima_visita: string | null;
  mes_ly_eus: number;
}

export interface Contacto {
  id: string;
  cliente_id: string;
  nombre: string;
  cargo: string | null;
  correo: string | null;
  telefono: string | null;
}

export type TipoConocimiento = "estrategia" | "politica";

export interface Conocimiento {
  id: string;
  tipo: TipoConocimiento;
  titulo: string;
  contenido: string;
  actualizado_at: string;
}

export type OrigenBoletin = "KOA" | "KOE";

export interface PromocionBoletin {
  sku: string;
  categoria: string;
  detalle: string;
  mejor_costo: string;
  descuento_max: string;
}

export interface Boletin {
  id: string;
  titulo: string;
  origen: OrigenBoletin;
  fecha_publicacion: string;
  vigente_desde: string;
  vigente_hasta: string;
  resumen_accionable: string | null;
  archivo_url: string | null; // path dentro del bucket "boletines"
  promociones: PromocionBoletin[];
  focos: string[];
  analizado_at: string | null;
}

// Señales de "Compra Inteligente"
export type TipoSenal = "gap_ly" | "inventario_bajo" | "credito_disponible";

export interface Senal {
  tipo: TipoSenal;
  etiqueta: string;
  detalle: string;
}

export interface MixCategoriaRow {
  categoria: string;
  eus_cliente: number;
  eus_segmento: number;
  eus_cartera: number;
}

export interface MixSkuRow {
  categoria: string;
  marca: string;
  formato: string;
  eus_cliente: number;
  eus_segmento: number;
  eus_canal: number;
}

export interface SeriePeriodoRow {
  periodo: number;
  eus_actual: number;
  eus_ly: number;
}

export interface CeldaPlanRow {
  cliente_id: string;
  nombre: string;
  nombre_corto: string | null;
  segmento: Segmento;
  periodo: number;
  ly_eus: number;
  plan_eus: number;
  real_eus: number;
}

// Item del detalle de compras (RPC detalle_cliente): un SKU con su serie
// mensual [eus, eus_ly] por período.
export interface ItemDetalle {
  categoria: string;
  marca: string;
  formato: string;
  meses: Record<string, [number, number]>;
  total: number;
  total_ly: number;
}

export type TipoEvidencia = "ventas" | "memoria" | "boletin";
export type EstadoRecomendacion = "nueva" | "aceptada" | "descartada";

export interface EvidenciaItem {
  tipo: TipoEvidencia;
  detalle: string;
}

export interface Recomendacion {
  id: string;
  cliente_id: string;
  texto: string;
  evidencia: EvidenciaItem[];
  estado: EstadoRecomendacion;
  creada_at: string;
  cliente_nombre?: string;
}

export interface EstructuraNota {
  resumen?: string;
  acuerdos?: string[];
  rechazos?: string[];
  proximos_pasos?: string[];
}

export interface Nota {
  id: string;
  cliente_id: string;
  fecha: string;
  tipo: TipoNota;
  contenido_raw: string;
  contenido_estructurado: EstructuraNota | null;
  creado_por_agente: boolean;
  vence?: string | null; // compromisos: fecha límite
  cerrada_at?: string | null; // compromisos: cumplido
}

// ---- Pedidos registrados a mano (panel de cliente en Meta) ----
export type EstadoPedido = "comprometido" | "ingresado" | "facturado";

export interface Pedido {
  id: string;
  cliente_id: string;
  fecha: string;
  anio_fiscal: number;
  periodo: number;
  bottler: string | null;
  marca: string;
  formato: string;
  uc: number | null;
  eus: number;
  estado: EstadoPedido;
  precio_botella: number | null; // CLP por botella, acordado
  comentario: string | null;
  creado_at: string;
}

// Propuesta de SKU del copiloto para la meta del mes (una fila de
// recomendaciones por SKU; el KAM la acepta, modifica o rechaza)
export interface PropuestaSku {
  id?: string; // id en recomendaciones (falta solo si aún no se guardó)
  marca: string;
  formato: string;
  eus: number;
  motivo: string;
  evidencia: "ventas" | "boletin" | "memoria";
  estado?: EstadoRecomendacion;
  eus_final?: number | null;
  feedback?: string | null;
}

export interface Perfil {
  cliente_id: string;
  decisor: string | null;
  estilo_negociacion: string | null;
  frecuencia_compra: string | null;
  marcas_afines: string[];
  rechazos: unknown[];
  acuerdos: unknown[];
  resumen: string | null;
  actualizado_at: string;
}

// ---- MTD (mes en curso) ----

export type OrigenImportacion = "DIAGEO" | "KOA" | "KOE";

export interface Importacion {
  id: string;
  origen: OrigenImportacion;
  anio_fiscal: number;
  periodo: number;
  fecha_corte: string;
  filas: number;
  eus: number;
  archivo: string | null;
  creado_at: string;
}

// Fila del RPC mtd_cartera
export interface MtdClienteRow {
  cliente_id: string;
  nombre: string;
  nombre_corto: string | null;
  segmento: Segmento;
  bottler: string | null;
  mtd_eus: number;
  mtd_ly_eus: number;
  plan_mes_eus: number;
  mtd_koa: number;
  mtd_koe: number;
  pedidos_eus?: number; // pedidos en curso (comprometido/ingresado) no reflejados aún en la venta
}

export interface MtdCategoriaRow {
  categoria: string;
  eus: number;
  eus_ly: number;
}

export interface MtdBottlerRow {
  bottler: string;
  eus: number;
  eus_ly: number;
  clientes: number;
}

// ---- Meta del próximo mes ----

// Fila del RPC resumen_meta_periodo
export interface MetaClienteRow {
  cliente_id: string;
  nombre: string;
  nombre_corto: string | null;
  segmento: Segmento;
  cod_diageo: string | null;
  bottler: string | null;
  es_frontera: boolean;
  zona: string | null;
  desarrollador: string | null;
  es_otros: boolean;
  eus_a: number;
  eus_b: number;
  eus_c: number;
  eus_d: number; // mismo mes del año anterior
  meta_eus: number;
  meta_sku_eus: number; // suma de plan_ventas_sku (0 si no hay desglose)
}

// Item del RPC detalle_meta_cliente (drill-down por SKU, un cliente)
export interface DetalleMetaItem {
  categoria: string;
  marca: string;
  formato: string;
  eus_a: number;
  eus_b: number;
  eus_c: number;
  eus_d: number;
  meta_eus: number; // meta por SKU para el período meta (0 si no hay)
}

export interface SkuCatalogo {
  marca: string;
  formato: string;
  categoria: string;
}

// Fila del RPC detalle_meta_todos (para exportar a Excel: toda la cartera)
export interface DetalleMetaTodosRow extends DetalleMetaItem {
  cliente_id: string;
  nombre_corto: string | null;
  nombre: string;
}
