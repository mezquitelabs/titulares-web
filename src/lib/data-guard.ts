// Los datos llegan de fuera de este repo (titulares-data), así que se validan al compilar, antes de que
// puedan llegar a una página: cada enlace debe ser https, sin credenciales y de un host permitido; los
// textos tienen un largo máximo. Un titular inválido se DESCARTA (no tumba el sitio por una nota mala);
// el build falla solo si el contrato no se cumple (versión de esquema) o si queda casi nada.

export const SCHEMA_VERSION = 1;
export const MAX_ARTICLES = 20000;
/** Si se descarta más de esta fracción de los titulares, los datos están mal y el build se detiene. */
export const MAX_DROP_RATIO = 0.3;
export const LIMITS: Record<string, number> = {
  title: 400, url: 2048, source: 200, state: 100, municipality: 200, scope: 20, ts: 40, name: 200,
};

export class DataContractError extends Error {
  constructor(message: string) {
    super(`Datos inválidos: ${message}`);
    this.name = 'DataContractError';
  }
}

export interface Article {
  title: string;
  url: string;
  source: string;
  state: string;
  municipality: string | null;
  scope: string;
  ts: string;
}
export interface SourceInfo {
  name: string;
  url: string;
  state: string;
  municipality: string | null;
  scope: string;
}
export interface Meta {
  schema_version: number;
  generated_at: string;
  hours: number;
  sources: SourceInfo[];
}
export interface Validated {
  meta: Meta;
  articles: Article[];
  /** motivo -> cuántos titulares se descartaron por él */
  dropped: Record<string, number>;
}

export function allowedHosts(list: { hosts: string[] }): Set<string> {
  return new Set(list.hosts.map((h) => h.toLowerCase()));
}

/** Qué está mal con un enlace, o null si es https en un host permitido. */
export function linkProblem(value: unknown, hosts: Set<string> | null): string | null {
  if (typeof value !== 'string') return 'enlace no es texto';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'enlace no es una URL absoluta';
  }
  if (url.protocol !== 'https:') return 'enlace no es https';
  if (url.username || url.password) return 'enlace con credenciales';
  if (hosts && !hosts.has(url.hostname.toLowerCase())) return `host no permitido: ${url.hostname}`;
  return null;
}

const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const isOptText = (v: unknown, max: number): boolean => v === null || (typeof v === 'string' && v.length <= max);
const isDate = (v: unknown): boolean => typeof v === 'string' && v.length <= LIMITS.ts && !Number.isNaN(Date.parse(v));

function articleProblem(a: unknown, hosts: Set<string> | null): string | null {
  if (typeof a !== 'object' || a === null) return 'titular no es un objeto';
  const r = a as Record<string, unknown>;
  if (!isText(r.title, LIMITS.title)) return 'título ausente o demasiado largo';
  if (!isText(r.source, LIMITS.source)) return 'medio ausente o demasiado largo';
  if (!isText(r.state, LIMITS.state)) return 'estado ausente o demasiado largo';
  if (!isOptText(r.municipality ?? null, LIMITS.municipality)) return 'municipio inválido';
  if (!isText(r.scope, LIMITS.scope)) return 'alcance inválido';
  if (!isDate(r.ts)) return 'fecha inválida';
  if (typeof r.url === 'string' && r.url.length > LIMITS.url) return 'enlace demasiado largo';
  return linkProblem(r.url, hosts);
}

/** `hosts` null = cualquier host (solo para la vista local con fuentes de uso local; nunca en CI). */
export function validateData(metaRaw: unknown, payload: unknown, hosts: Set<string> | null): Validated {
  if (typeof metaRaw !== 'object' || metaRaw === null) throw new DataContractError('meta.json no es un objeto');
  const m = metaRaw as Record<string, unknown>;
  if (m.schema_version !== SCHEMA_VERSION) {
    throw new DataContractError(
      `schema_version ${JSON.stringify(m.schema_version)}; este sitio soporta exactamente ${SCHEMA_VERSION}. Actualiza el sitio y el crawler juntos.`,
    );
  }
  if (!isDate(m.generated_at)) throw new DataContractError('meta.generated_at no es una fecha');
  if (typeof m.hours !== 'number' || !Number.isFinite(m.hours)) throw new DataContractError('meta.hours no es un número');
  if (!Array.isArray(m.sources)) throw new DataContractError('meta.sources no es una lista');

  const sources: SourceInfo[] = [];
  for (const s of m.sources as Record<string, unknown>[]) {
    if (isText(s?.name, LIMITS.name) && isText(s?.state, LIMITS.state) && isText(s?.scope, LIMITS.scope) &&
        isOptText(s?.municipality ?? null, LIMITS.municipality) && linkProblem(s?.url, hosts) === null) {
      sources.push({ name: s.name, url: s.url as string, state: s.state, municipality: (s.municipality as string | null) ?? null, scope: s.scope });
    }
  }
  // un medio cuyo host no esté permitido aparece en la lista sin enlace en vez de desaparecer
  for (const s of m.sources as Record<string, unknown>[]) {
    if (isText(s?.name, LIMITS.name) && !sources.some((x) => x.name === s.name) &&
        isText(s?.state, LIMITS.state) && isText(s?.scope, LIMITS.scope)) {
      sources.push({ name: s.name, url: '', state: s.state, municipality: (s.municipality as string | null) ?? null, scope: s.scope });
    }
  }

  const list = (payload as { articles?: unknown })?.articles;
  if (!Array.isArray(list)) throw new DataContractError('titulares.json no tiene la lista "articles"');
  if (list.length > MAX_ARTICLES) throw new DataContractError(`hay ${list.length} titulares (límite ${MAX_ARTICLES})`);

  const dropped: Record<string, number> = {};
  const seen = new Set<string>();
  const articles: Article[] = [];
  for (const item of list) {
    const problem = articleProblem(item, hosts);
    if (problem) {
      dropped[problem] = (dropped[problem] ?? 0) + 1;
      continue;
    }
    const a = item as Article;
    if (seen.has(a.url)) continue;
    seen.add(a.url);
    articles.push({ title: a.title, url: a.url, source: a.source, state: a.state, municipality: a.municipality ?? null, scope: a.scope, ts: a.ts });
  }

  const droppedCount = Object.values(dropped).reduce((x, y) => x + y, 0);
  if (list.length > 0 && articles.length === 0) throw new DataContractError('ningún titular pasó la validación');
  if (list.length > 0 && droppedCount / list.length > MAX_DROP_RATIO) {
    const detail = Object.entries(dropped).map(([k, v]) => `${v}× ${k}`).join('; ');
    throw new DataContractError(`se descartaría más del ${MAX_DROP_RATIO * 100}% de los titulares (${droppedCount} de ${list.length}): ${detail}`);
  }
  return {
    meta: { schema_version: SCHEMA_VERSION, generated_at: m.generated_at as string, hours: m.hours as number, sources },
    articles,
    dropped,
  };
}
