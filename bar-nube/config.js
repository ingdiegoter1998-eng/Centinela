// Datos de conexión a Supabase. Son PÚBLICOS por diseño (la llave `anon` va en el navegador);
// lo que protege los datos son las políticas de la base, y aquí están abiertas a propósito.
// Nunca pongas aquí la llave `service_role`.
window.BAR_CONFIG = {
  SUPABASE_URL: "https://xesmbhfgiosrhctjamru.supabase.co",
  SUPABASE_ANON_KEY: "PEGA_AQUI_LA_LLAVE_ANON",
};
