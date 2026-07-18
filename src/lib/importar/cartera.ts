// Cartera de cuentas clave confirmada por el usuario (top 25 FY26 = 80% del canal).
// Se aplica solo al CREAR un cliente en la primera importación; después la
// cartera se gestiona en la app (activo / segmento / nombre corto).

export interface CuentaClave {
  nombreOficial: string;
  nombreCorto: string;
  segmento: "TOP3" | "CLAVE";
}

// Razones sociales distintas que son la misma empresa → nombre canónico
export const FUSIONES: Record<string, string> = {
  "IMP.Y DIST.SEISLUCES SA": "IMPORTADORA Y DISTRIBUIDORA SEISLUC",
};

export const CARTERA: CuentaClave[] = [
  { nombreOficial: "COMERCIALIZADORA YDS SPA", nombreCorto: "YDS", segmento: "TOP3" },
  { nombreOficial: "DIST.Y COM.DIMAK LIMITADA", nombreCorto: "Dimak", segmento: "TOP3" },
  { nombreOficial: "COMERCIAL ESCOCIA LTDA.", nombreCorto: "Escocia", segmento: "TOP3" },
  { nombreOficial: "IMPORTADORA Y DISTRIBUIDORA SEISLUC", nombreCorto: "Seisluc", segmento: "CLAVE" },
  { nombreOficial: "IMP.Y EXPORTADORA EUROMAXX LTD", nombreCorto: "Euromaxx", segmento: "CLAVE" },
  { nombreOficial: "HENRIQUEZ HERMANOS LIMITADA", nombreCorto: "Henríquez Hnos.", segmento: "CLAVE" },
  { nombreOficial: "DISTRIB. Y COM. TILICURA S.A.", nombreCorto: "Tilicura", segmento: "CLAVE" },
  { nombreOficial: "D Y L LIQUORS STORE SPA", nombreCorto: "D&L Liquors", segmento: "CLAVE" },
  { nombreOficial: "GABRIEL ARTURO CRISOSTOMO GONZ", nombreCorto: "Crisóstomo", segmento: "CLAVE" },
  { nombreOficial: "JORGE ARIEL RIQUELME MORENO", nombreCorto: "Riquelme", segmento: "CLAVE" },
  { nombreOficial: "CLAUDIO ANTONIO RETAMAL MOYA", nombreCorto: "Retamal", segmento: "CLAVE" },
  { nombreOficial: "JOSE ZAPATA E HIJOS S.A.", nombreCorto: "Zapata e Hijos", segmento: "CLAVE" },
  { nombreOficial: "DISTRIB. SAN BENJAMIN LTDA.", nombreCorto: "San Benjamín", segmento: "CLAVE" },
  { nombreOficial: "DISTRIBUCIÓN Y LOGÍSTICA V&L SPA", nombreCorto: "V&L", segmento: "CLAVE" },
  { nombreOficial: "BOTILLERIA PRAT LTDA.", nombreCorto: "Botillería Prat", segmento: "CLAVE" },
  { nombreOficial: "VIBE SPA", nombreCorto: "Vibe", segmento: "CLAVE" },
  { nombreOficial: "JORGE RODRIGO VILCHES DONOSO", nombreCorto: "Vilches", segmento: "CLAVE" },
  { nombreOficial: "DIST.Y COM. GIGANTE DEL PACIFICO", nombreCorto: "Gigante del Pacífico", segmento: "CLAVE" },
  { nombreOficial: "MATTE ARAVENA Y COMPANIA LTDA.", nombreCorto: "Matte Aravena", segmento: "CLAVE" },
  { nombreOficial: "DISTRIBUIDORA GEOEXPRESS LIMITADA", nombreCorto: "Geoexpress", segmento: "CLAVE" },
  { nombreOficial: "CAVALIERI Y COMPANIA LIMITADA", nombreCorto: "Cavalieri", segmento: "CLAVE" },
  { nombreOficial: "COM. SAN FERMIN LTDA.", nombreCorto: "San Fermín", segmento: "CLAVE" },
  { nombreOficial: "SOC.DISTRIB.EL MOLINO LTDA", nombreCorto: "El Molino", segmento: "CLAVE" },
  { nombreOficial: "JUAN PABLO MARTINEZ MUNOZ", nombreCorto: "J.P. Martínez", segmento: "CLAVE" },
];
