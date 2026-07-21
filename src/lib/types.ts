export type Segmento = "TOP3" | "CLAVE";
export type TipoNota = "visita" | "llamada" | "acuerdo" | "rechazo" | "nota";

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
