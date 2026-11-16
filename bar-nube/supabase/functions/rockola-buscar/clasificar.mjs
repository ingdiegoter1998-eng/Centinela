// Clasifica un artista por sus etiquetas de género («colombian pop», «vallenato»…). Spotify ya no las entrega
// (su API dejó de devolver `genres`), así que salen de MusicBrainz (gratis, sin llave).
// La traducción de etiquetas es pura (sin red ni base) para poder probarla. Cada etiqueta se traduce a uno de NUESTROS géneros con la
// primera regla que calce (las específicas van antes que las generales); luego se decide por votos.

export const normalizar = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();

// [regex sobre la etiqueta normalizada, género nuestro]. El orden importa.
export const REGLAS = [
  // Cantina
  [/corridos? tumbados?/, 'corridos tumbados'], [/corrido/, 'corridos'],
  [/ranchera|ranchero/, 'ranchera'], [/mariachi/, 'mariachi'],
  [/norteno|nortena|conjunto/, 'norteno'], [/duranguense/, 'duranguense'], [/grupera/, 'grupera'],
  [/banda sonora|soundtrack/, 'banda sonora'], [/\bbanda\b|tecnobanda|sinaloense/, 'banda sinaloense'],
  [/regional mexican|musica mexicana|mexican (pop|folk)/, 'regional mexicano'],
  [/vallenato romantico/, 'vallenato romantico'], [/vallenato/, 'vallenato'],
  [/carrilera/, 'carrilera'], [/guasca/, 'guasca'], [/parrandera|parranda/, 'parrandera'], [/despecho/, 'despecho'],
  [/plancha/, 'musica de plancha'], [/popular colombian|musica popular|colombian popular|^popular$/, 'popular colombiana'],
  // Tropical y baile latino
  [/salsa brava/, 'salsa brava'], [/salsa romantica/, 'salsa romantica'], [/salsa choke|choke/, 'salsa choke'], [/timba/, 'timba'], [/salsa/, 'salsa'],
  [/\bson cubano\b|^son$/, 'son cubano'], [/mambo/, 'mambo'], [/guaracha/, 'guaracha'], [/merengue/, 'merengue'],
  [/bachata urbana/, 'bachata urbana'], [/bachata/, 'bachata'], [/sonidera/, 'cumbia sonidera'], [/cumbia/, 'cumbia'],
  [/champeta/, 'champeta'], [/kizomba/, 'kizomba'], [/afrobeat/, 'afrobeats'], [/amapiano/, 'amapiano'],
  [/bolero/, 'bolero'], [/tango/, 'tango'], [/flamenco/, 'flamenco'],
  // Urbano latino
  [/reggaeton romantico/, 'reggaeton romantico'], [/reggaeton (clasico|old)|old school reggaeton/, 'reggaeton clasico'], [/perreo/, 'perreo'],
  [/dembow/, 'dembow'], [/moombahton/, 'moombahton'], [/reggaeton/, 'reggaeton'],
  [/latin trap|trap latino|trap argentino|trap colombiano|trap espanol|trap mexicano|trap chileno/, 'trap latino'],
  [/urbano colombiano|colombian (urban|hip hop)/, 'urbano colombiano'], [/urbano latino|latin urban|latin hip hop|latin rap/, 'latin pop urbano'],
  [/pop colombiano|colombian pop/, 'pop colombiano'], [/latin pop|pop latino|pop en espanol|spanish pop|pop venezolano|pop mexicano|latin arena pop/, 'pop latino'],
  [/rock en espanol|latin rock|rock latino|rock colombiano|latin alternative|rock mexicano|rock argentino/, 'rock en espanol'],
  // Hip hop
  [/pop rap/, 'pop rap'], [/drill/, 'drill'], [/boom bap/, 'boom bap'], [/gangsta|west coast|g funk/, 'gangsta rap'], [/cloud rap/, 'cloud rap'],
  [/conscious hip hop|conscious rap/, 'hip hop consciente'], [/old school hip hop|golden age hip hop|classic hip hop/, 'hip hop clasico'],
  [/\btrap\b/, 'trap'], [/hip hop|\brap\b|rap /, 'hip hop'],
  // R&B y soul
  [/neo soul/, 'neo soul'], [/quiet storm/, 'quiet storm'], [/new jack swing/, 'new jack swing'], [/motown/, 'motown'], [/gospel/, 'gospel'],
  [/\bsoul\b|northern soul|southern soul/, 'soul'], [/funk/, 'funk'], [/disco/, 'disco'], [/r&b|rnb|r b\b|urban contemporary/, 'r&b'],
  // Electrónica
  [/tech house/, 'tech house'], [/deep house/, 'deep house'], [/techno/, 'techno'], [/trance/, 'trance'], [/dubstep|brostep/, 'dubstep'],
  [/drum and bass|drum n bass|jungle/, 'drum and bass'], [/eurodance|eurobeat/, 'eurodance'], [/future bass/, 'future bass'],
  [/synthwave|retrowave|outrun/, 'synthwave'], [/lo fi|lofi/, 'lo-fi'], [/chillout|chill out|chillwave|ambient/, 'chillout'], [/downtempo|trip hop/, 'downtempo'],
  [/\bhouse\b/, 'house'], [/\bedm\b|electro\b|electro (house|dance)|big room|\bdance(?! pop)\b|club/, 'edm'],
  // Pop
  [/k pop|kpop/, 'k-pop'], [/hyperpop/, 'hyperpop'], [/dream pop/, 'dream pop'], [/bedroom pop/, 'bedroom pop'], [/art pop|chamber pop/, 'art pop'],
  [/synth ?pop/, 'synth pop'], [/electropop|electro pop/, 'electropop'], [/teen pop|boy band|girl group/, 'teen pop'], [/power pop/, 'power pop'],
  [/dance pop/, 'dance pop'], [/indie pop|indietronica|bubblegrunge/, 'indie pop'], [/pop rock/, 'pop rock'], [/pop punk/, 'pop punk'],
  [/singer songwriter|cantautor|trova/, 'singer-songwriter'], [/balada pop/, 'balada pop'], [/balada|ballad/, 'balada romantica'],
  // Country, folk, jazz y blues
  [/outlaw country/, 'outlaw country'], [/bluegrass/, 'bluegrass'], [/americana/, 'americana'], [/honky/, 'honky tonk'],
  [/country pop|contemporary country/, 'country pop'], [/classic country|traditional country|old school country/, 'country clasico'], [/country/, 'country'],
  [/indie folk|freak folk|folk pop/, 'indie folk'], [/folk rock/, 'folk rock'], [/\bfolk\b|folklor/, 'folk'],
  [/bossa nova/, 'bossa nova'], [/latin jazz|jazz latino/, 'jazz latino'], [/smooth jazz/, 'smooth jazz'], [/bebop|hard bop/, 'bebop'], [/swing/, 'swing'], [/jazz/, 'jazz'],
  [/delta blues/, 'delta blues'], [/electric blues/, 'blues electrico'], [/blues rock/, 'blues rock'], [/blues/, 'blues'],
  // Reggae y Caribe
  [/reggae en espanol/, 'reggae en espanol'], [/roots reggae/, 'roots reggae'], [/dancehall/, 'dancehall'], [/\bska\b/, 'ska'], [/\bdub\b/, 'dub'], [/\bsoca\b/, 'soca'], [/reggae/, 'reggae'],
  // Rock
  [/thrash/, 'thrash metal'], [/nu metal/, 'nu metal'], [/heavy metal/, 'heavy metal'], [/hardcore/, 'hardcore'], [/metal/, 'metal'],
  [/hard rock/, 'hard rock'], [/glam/, 'glam rock'], [/grunge/, 'grunge'], [/britpop/, 'britpop'], [/new wave/, 'new wave'], [/post punk/, 'post-punk'],
  [/\bemo\b/, 'emo'], [/garage rock/, 'garage rock'], [/southern rock/, 'southern rock'], [/psychedelic|psicodelic/, 'rock psicodelico'],
  [/progressive|prog rock/, 'rock progresivo'], [/soft rock|yacht rock|adult contemporary/, 'soft rock'], [/classic rock|album rock|heartland/, 'rock clasico'],
  [/\bpunk\b/, 'punk'], [/indie rock|alternative|modern rock|rock alternativo/, 'rock alternativo'], [/\brock\b/, 'rock alternativo'],
  // Resto
  [/power ballad/, 'power ballad'], [/musical|broadway|show tunes/, 'musical'], [/classical|clasica|orchestra|opera/, 'clasica'],
  [/christmas|navidad|villancico/, 'navidena'], [/instrumental/, 'instrumental'], [/\bpop\b/, 'pop'],
];

export function generoDeEtiqueta(etiqueta) {
  const t = normalizar(etiqueta);
  for (const [re, genero] of REGLAS) if (re.test(t)) return genero;
  return null;
}

// etiquetas: ['colombian pop', 'vallenato', …]; multiplicadores: { genero: multiplicador } (la tabla rockola_generos).
// Cada etiqueta con género vota por su multiplicador; gana el multiplicador con más votos y, si empatan, el más caro.
// Así un artista de pop con una sola etiqueta de ranchera sigue cobrando como pop, pero uno de puras etiquetas
// de cantina cobra cantina. El género elegido es el primero (en el orden de Spotify) con ese multiplicador.
export function elegirGenero(etiquetas, multiplicadores) {
  const aciertos = [];
  for (const e of etiquetas ?? []) {
    const g = generoDeEtiqueta(e);
    if (g && g in multiplicadores) aciertos.push(g);
  }
  if (!aciertos.length) return null;
  const votos = new Map();
  for (const g of aciertos) votos.set(multiplicadores[g], (votos.get(multiplicadores[g]) ?? 0) + 1);
  let mejor = null;
  for (const [m, v] of votos) if (!mejor || v > mejor.v || (v === mejor.v && m > mejor.m)) mejor = { m, v };
  return aciertos.find((g) => multiplicadores[g] === mejor.m) ?? null;
}

// ── MusicBrainz ─────────────────────────────────────────────────────────────────────────────
// Busca al artista por nombre y devuelve sus etiquetas más votadas. `pedir` es fetch (se inyecta para probarlo).
// Devuelve { ok: true, etiquetas } (vacías si no hay coincidencia clara) o { ok: false } si el servicio falló (no marcar, reintentar).
export async function etiquetasMusicBrainz(nombre, pedir = fetch) {
  const limpio = String(nombre ?? '').replace(/["\\]/g, ' ').trim();
  if (!limpio) return { ok: true, etiquetas: [] };
  let r;
  try {
    r = await pedir('https://musicbrainz.org/ws/2/artist/?fmt=json&limit=3&query=' + encodeURIComponent(`artist:"${limpio}"`),
      { headers: { 'User-Agent': 'RockolaBar/1.0', Accept: 'application/json' } });
  } catch { return { ok: false }; }
  if (!r.ok) return { ok: false };
  const d = await r.json().catch(() => null);
  if (!d) return { ok: false };
  const quiere = normalizar(limpio);
  const a = (d.artists ?? []).find((x) => (x.score ?? 0) >= 90 && normalizar(x.name) === quiere);
  const etiquetas = (a?.tags ?? []).filter((t) => (t.count ?? 0) > 0).sort((x, y) => y.count - x.count).slice(0, 12).map((t) => t.name);
  return { ok: true, etiquetas };
}
