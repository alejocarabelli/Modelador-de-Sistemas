// Propuestas de cambio: Claude no toca los datos de la app. Deja un JSON en
// ~/Documents/Modelador de Sistemas/Claude/Propuestas y la app le muestra al
// estudiante un aviso para aplicarlo o descartarlo. Al resolverlo, la app lo borra.

import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const FORMATO = 'modelador-propuesta';

export const TIPOS_VALIDOS = ['class-diagram', 'class-sequence-diagram', 'use-case-model', 'use-case-flow', 'sequence-diagram'];

export const carpetaDePropuestas = () =>
  process.env.MODELADOR_PROPUESTAS || join(homedir(), 'Documents', 'Modelador de Sistemas', 'Claude', 'Propuestas');

const esObjeto = (valor) => typeof valor === 'object' && valor !== null && !Array.isArray(valor);
const sonObjetos = (valor) => Array.isArray(valor) && valor.every(esObjeto);

/**
 * La misma forma mínima que exige la app al importar (src/utils/artifactFile.ts),
 * para que Claude se entere del error en el momento y no recién en la app.
 */
export function problemasDelContenido(tipo, contenido) {
  if (!TIPOS_VALIDOS.includes(tipo)) return [`Tipo desconocido: ${tipo}. Tiene que ser uno de ${TIPOS_VALIDOS.join(', ')}.`];
  if (!esObjeto(contenido)) return ['El contenido tiene que ser un objeto JSON (el "content" del artefacto).'];
  const problemas = [];
  const exigirLista = (campo) => {
    if (!sonObjetos(contenido[campo])) problemas.push(`Falta la lista "${campo}" (puede estar vacía).`);
  };

  if (tipo === 'class-diagram' || tipo === 'class-sequence-diagram' || tipo === 'use-case-model') {
    exigirLista('nodes');
    exigirLista('edges');
    if (problemas.length > 0) return problemas;
    const ids = new Set(contenido.nodes.map((nodo) => nodo.id));
    if (ids.size !== contenido.nodes.length || contenido.nodes.some((nodo) => typeof nodo.id !== 'string' || !nodo.id)) {
      problemas.push('Cada nodo necesita un "id" de texto único.');
    }
    contenido.nodes.forEach((nodo) => {
      if (!esObjeto(nodo.data) || !esObjeto(nodo.position) || !Number.isFinite(nodo.position.x) || !Number.isFinite(nodo.position.y)) {
        problemas.push(`El nodo "${nodo.id}" necesita "data" y "position" con x e y numéricos.`);
      }
      if (tipo !== 'use-case-model' && esObjeto(nodo.data)) {
        if (typeof nodo.data.name !== 'string') problemas.push(`La clase "${nodo.id}" necesita "data.name".`);
        if (!sonObjetos(nodo.data.attributes) || !sonObjetos(nodo.data.methods)) {
          problemas.push(`La clase "${nodo.id}" necesita "data.attributes" y "data.methods" (listas, pueden estar vacías).`);
        }
      }
    });
    contenido.edges.forEach((arista) => {
      if (!ids.has(arista.source) || !ids.has(arista.target)) problemas.push(`La relación "${arista.id}" une nodos que no existen.`);
    });
  } else if (tipo === 'sequence-diagram') {
    exigirLista('participants');
    exigirLista('items');
  } else if (tipo === 'use-case-flow') {
    if (!esObjeto(contenido.description)) problemas.push('Falta el objeto "description".');
    exigirLista('basicFlow');
    exigirLista('alternativeFlows');
    if (sonObjetos(contenido.alternativeFlows) && !contenido.alternativeFlows.every((camino) => sonObjetos(camino.steps))) {
      problemas.push('Cada camino alternativo necesita su lista "steps".');
    }
  }
  return problemas.slice(0, 10);
}

const marcaDeTiempo = (fecha) => fecha.toISOString().replace(/[:.]/g, '-').replace('T', '-').replace('Z', '');

const paraNombre = (texto) => String(texto ?? 'artefacto')
  .normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).toLowerCase() || 'artefacto';

/** El nombre de archivo y el texto de una propuesta, tal como los lee la app. */
export function armarPropuesta(propuesta, ahora = new Date()) {
  return {
    nombre: `${marcaDeTiempo(ahora)}-${paraNombre(propuesta.name)}.json`,
    texto: JSON.stringify({ format: FORMATO, version: 1, createdAt: ahora.toISOString(), ...propuesta }),
  };
}

/** Escribe la propuesta de forma atómica (un temporal oculto que después se renombra) y devuelve el nombre del archivo. */
export async function escribirPropuesta(propuesta, carpeta = carpetaDePropuestas(), ahora = new Date()) {
  await mkdir(carpeta, { recursive: true });
  const { nombre, texto } = armarPropuesta(propuesta, ahora);
  const temporal = join(carpeta, `.${nombre}.tmp`);
  await writeFile(temporal, texto, 'utf8');
  await rename(temporal, join(carpeta, nombre));
  return nombre;
}

/** Las propuestas que el estudiante todavía no aplicó ni descartó. */
export async function propuestasPendientes(carpeta = carpetaDePropuestas()) {
  let nombres;
  try {
    nombres = await readdir(carpeta);
  } catch {
    return [];
  }
  const pendientes = [];
  for (const nombre of nombres.filter((n) => n.endsWith('.json') && !n.startsWith('.')).sort()) {
    try {
      const datos = JSON.parse(await readFile(join(carpeta, nombre), 'utf8'));
      pendientes.push({ archivo: nombre, nombre: datos.name, descripcion: datos.description, nuevo: !datos.artifactId });
    } catch {
      pendientes.push({ archivo: nombre, nombre: '(ilegible)', descripcion: '', nuevo: false });
    }
  }
  return pendientes;
}
