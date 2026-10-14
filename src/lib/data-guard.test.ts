import { describe, expect, it } from 'vitest';
import { allowedHosts, DataContractError, linkProblem, validateData } from './data-guard';

const hosts = allowedHosts({ hosts: ['medio.example', 'www.otro.example'] });
const meta = {
  schema_version: 1,
  generated_at: '2026-10-12T18:00:00+00:00',
  hours: 24,
  sources: [{ name: 'Medio', url: 'https://medio.example/', state: 'Nuevo León', municipality: null, scope: 'estatal' }],
};
const art = (over: Record<string, unknown> = {}) => ({
  title: 'Un titular de prueba', url: 'https://medio.example/a', source: 'Medio', state: 'Nuevo León',
  municipality: null, scope: 'estatal', ts: '2026-10-12T17:00:00+00:00', ...over,
});

describe('linkProblem', () => {
  it('acepta https en host permitido', () => expect(linkProblem('https://medio.example/x?y=1', hosts)).toBeNull());
  it('rechaza http, credenciales, hosts ajenos y no-URLs', () => {
    expect(linkProblem('http://medio.example/x', hosts)).toMatch(/no es https/);
    expect(linkProblem('https://user:pw@medio.example/x', hosts)).toMatch(/credenciales/);
    expect(linkProblem('https://malo.example/x', hosts)).toMatch(/host no permitido/);
    expect(linkProblem('javascript:alert(1)', hosts)).toMatch(/no es https/);
    expect(linkProblem('/relativo', hosts)).toMatch(/absoluta/);
    expect(linkProblem(42, hosts)).toMatch(/no es texto/);
  });
});

describe('validateData', () => {
  it('acepta datos válidos y quita repetidos por URL', () => {
    const r = validateData(meta, { articles: [art(), art(), art({ url: 'https://www.otro.example/b' })] }, hosts);
    expect(r.articles).toHaveLength(2);
    expect(r.dropped).toEqual({});
  });

  it('descarta titulares malos sin tumbar el build', () => {
    const good = Array.from({ length: 8 }, (_, i) => art({ url: `https://medio.example/${i}` }));
    const r = validateData(meta, { articles: [...good, art({ url: 'https://malo.example/x' }), art({ title: 'x'.repeat(401) })] }, hosts);
    expect(r.articles).toHaveLength(8);
    expect(Object.values(r.dropped).reduce((a, b) => a + b, 0)).toBe(2);
  });

  it('falla si cambia la versión del esquema', () => {
    expect(() => validateData({ ...meta, schema_version: 2 }, { articles: [art()] }, hosts)).toThrow(DataContractError);
  });

  it('falla si se descartaría demasiado o todo', () => {
    const bad = Array.from({ length: 5 }, (_, i) => art({ url: `https://malo.example/${i}` }));
    expect(() => validateData(meta, { articles: [art(), ...bad] }, hosts)).toThrow(/más del 30%/);
    expect(() => validateData(meta, { articles: bad }, hosts)).toThrow(/ningún titular/);
  });

  it('acepta una lista vacía (aún sin titulares)', () => {
    expect(validateData(meta, { articles: [] }, hosts).articles).toEqual([]);
  });

  it('el medio con host no permitido aparece sin enlace', () => {
    const m = { ...meta, sources: [{ ...meta.sources[0], url: 'https://nuevo.example/' }] };
    expect(validateData(m, { articles: [art()] }, hosts).meta.sources[0].url).toBe('');
  });
});
