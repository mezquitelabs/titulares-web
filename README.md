# titulares-web

Sitio estático con los titulares del día de periódicos mexicanos, filtrable por estado, municipio, medio y
categoría, con búsqueda de texto. Astro + TypeScript + CSS plano, sin framework de UI, sin CDN, sin rastreadores. Un script de unas 40
líneas hace los filtros; con JavaScript desactivado se ve la lista completa.

**Solo lee JSON** (`src/data/meta.json` y `src/data/titulares.json`). No tiene acceso a nada más: el código, la base
de datos y las credenciales del crawler no viven en este repo.

## Aviso sobre los datos

Los titulares provienen de **medios de terceros**. Cada uno enlaza a su nota original y no se reclama ningún derecho
sobre ellos; los títulos pertenecen a sus medios. El pie de página dice lo mismo. Para pedir que se retire un contenido,
abre un issue con el enlace de la nota. La estructura de los archivos está en [`docs/data-contract.md`](docs/data-contract.md).

## Ejecutarlo en local

Necesita Node 18.17.1 o superior (Astro 4 está fijado por eso).

```bash
npm install
npm test             # pruebas de la validación de datos
npm run build        # sitio estático en dist/
npm run preview      # sirve dist/
```

`src/data/*.json` **no está en git**, así que un clon nuevo no tiene datos y `npm run build` falla con un mensaje claro
hasta que los generes desde el crawler (`~/titulares-mx`):

```bash
cd ~/titulares-mx
.venv/bin/python run.py --no-fetch --build   # exporta a ~/titulares-web/src/data y compila (vista local con TODAS las fuentes)
```

La vista local incluye las fuentes de uso local; el sitio público no.

## De dónde vienen los datos

Código y datos viven en **dos repos públicos**:

| Repo | Contiene | Lo escribe |
|---|---|---|
| `mezquitelabs/titulares-web` (este) | código del sitio, pruebas y workflow, en `main` | push normal |
| `mezquitelabs/titulares-data`, rama `data` | `src/data/meta.json`, `src/data/titulares.json` y un README | el crawler, cada 2 horas (`python run.py --publish`) |

`data` se **reemplaza por un único commit huérfano en cada publicación** (push forzado con lease, autor
`titulares-bot`), así el historial público no acumula copias de texto de terceros. Nunca hagas commits a mano ahí.
La llave de despliegue del crawler solo escribe en `titulares-data`: un fallo del crawler no puede tocar el código de
este repo.

```
crawler: descarga -> publish -> push forzado a titulares-data/data (deploy key)
                                      |   (no dispara nada entre repos)
GitHub Actions en titulares-web: cron cada 2 h / push a main / manual
   -> main + titulares-data@data -> copia a src/data -> pruebas -> build -> Pages
```

## Despliegue en GitHub Pages

`.github/workflows/deploy.yml` se ejecuta:

| Disparador | Cuándo |
|---|---|
| push a `main` | cambio de código |
| `schedule` (`23 */2 * * *`) | **cada 2 horas**, que es como se recogen los datos nuevos. Una corrida programada compara el commit de `data` con `/data-version.txt` del sitio en vivo y **termina en segundos si coinciden** |
| `workflow_dispatch` | a pedido: Actions > Deploy to GitHub Pages > Run workflow |

Tras una publicación del crawler, el sitio se actualiza en la **siguiente corrida programada** (puede retrasarse unos
minutos) o al instante con "Run workflow". **GitHub desactiva los workflows programados tras 60 días sin actividad en el
repo** (commits, no corridas): si dejan de ejecutarse, revisa Actions y vuelve a habilitarlo (o haz cualquier commit a
`main`); mientras tanto el sitio sigue sirviendo su último deploy.

No necesita secretos. Pasos manuales (una sola vez):

1. **Settings > Pages > Build and deployment > Source: GitHub Actions.**
2. El repo debe ser **público** (Pages gratis lo exige).
3. Haz push a `main`; la primera corrida te pide aprobar el entorno `github-pages` si está protegido.
4. URL por defecto: `https://mezquitelabs.github.io/titulares-web/`. Para un dominio propio, define las variables del
   repo `SITE_URL` y `BASE_PATH=/`.

## Validación de los datos entrantes

Los datos vienen de fuera, así que el build los valida (`src/lib/data-guard.ts`): enlaces **https**, sin credenciales y de
hosts permitidos; largos máximos; fechas válidas. Un titular inválido se **descarta** con un aviso en el log del build,
y el build **falla** solo si cambia `schema_version`, no pasa ningún titular o se descartaría más del 30 %.

**Hosts permitidos.** `src/lib/allowed-hosts.json` lista los hostnames exactos (sin comodines). Cuando un medio enlaza a
un host nuevo (un CDN, un subdominio), sus titulares se descartan con un aviso `host no permitido: <host>`; si es
legítimo, agrégalo a ese archivo y haz push a `main`.

## Si se borra la rama de datos

El workflow falla con "Falta la rama data" y el sitio conserva su último deploy. Para recuperarla, desde el crawler:

```bash
cd ~/titulares-mx
.venv/bin/python run.py --publish
```

Si el repo `titulares-data` desapareció, créalo vacío y público y agrega la llave de despliegue del crawler (Settings >
Deploy keys > Allow write access). La base de datos del crawler es la fuente de verdad: no se pierde nada.

## Estructura

```
src/data/            meta.json + titulares.json (fuera de git; vienen del repo de datos o del crawler)
src/lib/allowed-hosts.json   hosts a los que pueden apuntar los enlaces
src/lib/data-guard.ts        validación del build (+ data-guard.test.ts)
src/lib/data.ts              lee y valida los JSON
src/pages/index.astro        la página
docs/data-contract.md        el contrato con el crawler
```
