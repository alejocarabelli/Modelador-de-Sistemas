// Lee los proyectos tal como la app los está guardando en este momento.
//
// La app guarda cada cambio, al segundo, en el localStorage de su WKWebView.
// En el Mac eso es una base SQLite dentro de ~/Library/WebKit/<id de la app>/.
// La ruta exacta y el formato son internos de WebKit y cambian entre versiones
// de macOS, así que se busca cualquier base de localStorage dentro de la
// carpeta de la app y se usa la más reciente que tenga los proyectos.
// Solo lectura: se abre en modo lectura y nunca se escribe.

import { execFile } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const CLAVE = 'design-projects:v2';
const ID_DE_LA_APP = 'com.alejocarabelli.disenosistemas.v2';

export const carpetaDeWebKit = () =>
  process.env.MODELADOR_WEBKIT || join(homedir(), 'Library', 'WebKit', ID_DE_LA_APP);

const esBaseDeLocalStorage = (nombre) => nombre === 'localstorage.sqlite3' || nombre.endsWith('.localstorage');

async function buscarBases(carpeta, profundidad = 0) {
  if (profundidad > 8) return [];
  let entradas;
  try {
    entradas = await readdir(carpeta, { withFileTypes: true });
  } catch {
    return [];
  }
  const bases = [];
  for (const entrada of entradas) {
    const ruta = join(carpeta, entrada.name);
    if (entrada.isDirectory()) bases.push(...await buscarBases(ruta, profundidad + 1));
    else if (entrada.isFile() && esBaseDeLocalStorage(entrada.name)) bases.push(ruta);
  }
  return bases;
}

/** WebKit guarda los valores como texto UTF-16LE; versiones viejas, como UTF-8. */
export function decodificar(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'string') return valor;
  const bytes = Buffer.from(valor);
  const pareceUtf16 = bytes.length >= 2 && bytes.length % 2 === 0 && bytes[1] === 0;
  return bytes.toString(pareceUtf16 ? 'utf16le' : 'utf8').replace(/^﻿/, '');
}

async function leerConNode(ruta) {
  const { DatabaseSync } = await import('node:sqlite');
  const base = new DatabaseSync(ruta, { readOnly: true });
  try {
    return base.prepare('SELECT value FROM ItemTable WHERE key = ?').get(CLAVE)?.value ?? null;
  } finally {
    base.close();
  }
}

// El Node que trae Claude Desktop puede no tener node:sqlite; el sqlite3 de
// macOS siempre está.
async function leerConSqlite3(ruta) {
  const programa = process.platform === 'darwin' ? '/usr/bin/sqlite3' : 'sqlite3';
  const { stdout } = await promisify(execFile)(
    programa,
    ['-readonly', ruta, `SELECT hex(value) FROM ItemTable WHERE key = '${CLAVE}';`],
    { maxBuffer: 256 * 1024 * 1024 },
  );
  const hex = stdout.trim();
  return hex ? Buffer.from(hex, 'hex') : null;
}

async function leerClave(ruta) {
  try {
    return decodificar(await leerConNode(ruta));
  } catch {
    return decodificar(await leerConSqlite3(ruta));
  }
}

async function ultimaEscritura(ruta) {
  // Con WAL los cambios recientes viven en el archivo -wal hasta que se vuelcan.
  const fechas = await Promise.all([ruta, `${ruta}-wal`].map((r) => stat(r).then((s) => s.mtimeMs, () => 0)));
  return Math.max(...fechas);
}

/** Devuelve { ruta, modificado, datos } o null si no hay datos en vivo. */
export async function leerDatosEnVivo(carpeta = carpetaDeWebKit()) {
  const bases = await buscarBases(carpeta);
  const conFecha = await Promise.all(bases.map(async (ruta) => ({ ruta, modificado: await ultimaEscritura(ruta) })));
  conFecha.sort((a, b) => b.modificado - a.modificado);

  for (const { ruta, modificado } of conFecha) {
    let texto;
    try {
      texto = await leerClave(ruta);
    } catch {
      continue; // Una base de otro origen, bloqueada o con otro formato.
    }
    if (!texto) continue;
    return { ruta, modificado: new Date(modificado), datos: JSON.parse(texto) };
  }
  return null;
}
