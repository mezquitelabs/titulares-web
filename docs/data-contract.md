# Contrato de datos (`schema_version` 1)

El sitio lee dos archivos JSON en `src/data/`. Los genera el crawler (`titulares-mx`, privado) y se publican en el repo
`titulares-data` (rama `data`); nada más cruza entre los dos repos. Esta página es la interfaz: el crawler promete estos
archivos y el sitio se apoya en ellos.

```
src/data/
  meta.json        versión, fecha de generación y los medios incluidos
  titulares.json   los titulares de las últimas `hours` horas
```

## Versiones

`meta.json` trae un entero `schema_version`. Este sitio soporta **exactamente una** versión (hoy `1`) y el build
**falla con un mensaje claro** si falta o es distinta.

- Agregar un campo **opcional** mantiene la versión. Los consumidores ignoran campos que no conocen.
- Renombrar, quitar o cambiar el tipo de un campo, o cambiar lo que significa un valor, sube la versión; entonces el
  sitio y el crawler se actualizan juntos.

## `meta.json`

| Campo | Tipo | ¿Nulo? | Significado |
|---|---|---|---|
| `schema_version` | entero | no | `1` |
| `generated_at` | texto | no | ISO 8601 en **UTC** con offset (`2026-10-12T18:00:00+00:00`). |
| `hours` | número | no | Ventana de titulares incluidos (horas hacia atrás desde `generated_at`). |
| `sources` | lista | no | Medios incluidos. Cada uno: `name`, `url` (origen del sitio del medio, https), `state`, `municipality` (o `null`), `scope`. |

## `titulares.json`

```json
{ "articles": [ ... ] }
```

| Campo | Tipo | ¿Nulo? | Significado |
|---|---|---|---|
| `title` | texto | no | Título del medio, texto de terceros sin modificar (puede traer `<`, `&` o comillas: siempre se trata como **texto**). Máx. 400. |
| `url` | texto | no | URL absoluta **https** de la nota original, en un host permitido. Máx. 2048. |
| `source` | texto | no | Nombre del medio (coincide con un `sources[].name`). |
| `state` | texto | no | Estado de la República, o `Nacional`. |
| `municipality` | texto | sí | Municipio, solo cuando el medio es de un municipio concreto. |
| `scope` | texto | no | `nacional`, `estatal` o `local`. |
| `ts` | texto | no | Fecha ISO 8601 en UTC: la de publicación si el medio la da; si no, la de captura. |

Orden: del más reciente al más antiguo. Los enlaces no traen parámetros de rastreo.

## Qué se publica y qué no

El crawler **solo** publica medios leídos directamente de su RSS o de su portada con el robots.txt respetado. Las
fuentes de uso local (agregadores, y medios que bloquean a scripts o cuyo robots.txt lo prohíbe) **nunca** salen de la
laptop del crawler, y su enlace tampoco aparece aquí.

## Validación en el build (`src/lib/data-guard.ts`)

Los datos vienen de fuera de este repo, así que se validan antes de llegar a una página:

- Cada enlace debe ser **https**, sin credenciales y de un host de `src/lib/allowed-hosts.json` (lista exacta, sin
  comodines ni subdominios).
- Textos con largo máximo; fechas válidas; sin repetidos por URL; máximo 20 000 titulares.
- Un titular inválido se **descarta** (con un aviso en el log del build) en vez de tumbar el sitio. El build **falla** si
  cambia la versión del esquema, si no pasa ninguno o si se descartaría más del 30 %.
