import { defineConfig } from 'astro/config';

// Por defecto se publica como sitio de proyecto de GitHub Pages:
//   SITE_URL=https://mezquitelabs.github.io   BASE_PATH=/titulares-web
// Con dominio propio: SITE_URL=https://ejemplo.mx  BASE_PATH=/  (en CI, desde variables del repo).
const site = process.env.SITE_URL || 'https://mezquitelabs.github.io';
const base = process.env.BASE_PATH || '/titulares-web';

export default defineConfig({ site, base, output: 'static' });
