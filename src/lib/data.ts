import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import hostsList from './allowed-hosts.json';
import { allowedHosts, DataContractError, validateData, type Validated } from './data-guard';

// El build corre desde la raíz del repo; import.meta.url apuntaría a dist/chunks una vez empaquetado.
const dataDir = join(process.cwd(), 'src', 'data');

function readJson(name: string): unknown {
  const file = join(dataDir, name);
  if (!existsSync(file)) {
    throw new DataContractError(
      `falta src/data/${name}. En CI viene de la rama "data" de titulares-data; en local genéralo con ` +
        '`python run.py --build` desde el crawler (o copia los JSON a src/data).',
    );
  }
  return JSON.parse(readFileSync(file, 'utf-8'));
}

let cached: Validated | null = null;

/** Lee y valida src/data/{meta,titulares}.json (una sola vez por build). */
export function loadData(): Validated {
  if (cached) return cached;
  cached = validateData(
    readJson('meta.json'),
    readJson('titulares.json'),
    process.env.ALLOW_ANY_HOST === '1' ? null : allowedHosts(hostsList),
  );
  const dropped = Object.entries(cached.dropped);
  if (dropped.length) {
    console.warn(`[data-guard] titulares descartados: ${dropped.map(([k, v]) => `${v}× ${k}`).join('; ')}`);
  }
  return cached;
}
