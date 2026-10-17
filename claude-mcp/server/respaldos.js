// Lee el respaldo más reciente que la app deja en
// ~/Documents/Modelador de Sistemas/Respaldos. Solo lectura: nunca escribe ahí.

import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const carpetaDeRespaldos = () =>
  process.env.MODELADOR_RESPALDOS || join(homedir(), 'Documents', 'Modelador de Sistemas', 'Respaldos');

export async function leerUltimoRespaldo(carpeta = carpetaDeRespaldos()) {
  let nombres;
  try {
    nombres = await readdir(carpeta);
  } catch {
    throw new Error(
      `No encontré la carpeta de respaldos (${carpeta}). Abrí el Modelador de Sistemas en este Mac, trabajá un rato y volvé a preguntar.`,
    );
  }

  const candidatos = [];
  for (const nombre of nombres) {
    if (!nombre.startsWith('respaldo-') || !nombre.endsWith('.json')) continue;
    const ruta = join(carpeta, nombre);
    try {
      candidatos.push({ ruta, modificado: (await stat(ruta)).mtimeMs });
    } catch {
      // Un respaldo que se borra justo mientras listamos: se ignora.
    }
  }
  if (candidatos.length === 0) {
    throw new Error(`La carpeta ${carpeta} todavía no tiene respaldos. La app escribe el primero a los pocos segundos de abrirla.`);
  }

  candidatos.sort((a, b) => b.modificado - a.modificado);
  const { ruta, modificado } = candidatos[0];
  const datos = JSON.parse(await readFile(ruta, 'utf8'));
  return { ruta, modificado: new Date(modificado), proyectos: proyectosDe(datos) };
}

// Acepta el formato del respaldo ({ version, projects }) y el de un proyecto
// exportado suelto, por si alguien apunta la carpeta a sus exportaciones.
export function proyectosDe(datos) {
  if (Array.isArray(datos?.projects)) return datos.projects;
  if (Array.isArray(datos?.artifacts)) return [datos];
  if (Array.isArray(datos)) return datos;
  throw new Error('El respaldo no tiene el formato esperado.');
}

const fecha = (proyecto) => Date.parse(proyecto?.updatedAt ?? '') || 0;

/** El proyecto que se tocó último y, dentro de él, el artefacto abierto. */
export function loQueEstaAbierto(proyectos) {
  const proyecto = [...proyectos].sort((a, b) => fecha(b) - fecha(a))[0];
  if (!proyecto) return null;
  const artefactos = Array.isArray(proyecto.artifacts) ? proyecto.artifacts : [];
  const artefacto = artefactos.find((a) => a.id === proyecto.activeArtifactId)
    ?? [...artefactos].sort((a, b) => fecha(b) - fecha(a))[0]
    ?? null;
  return { proyecto, artefacto };
}

const normalizar = (valor) => String(valor ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();

/** Busca por ID exacto o por nombre, sin importar mayúsculas ni tildes; si no, por coincidencia parcial. */
export function buscar(elementos, consulta) {
  const buscado = normalizar(consulta);
  if (!buscado) return null;
  return elementos.find((e) => e.id === consulta)
    ?? elementos.find((e) => normalizar(e.name) === buscado)
    ?? elementos.find((e) => normalizar(e.name).includes(buscado))
    ?? null;
}

export function antiguedad(desde, ahora = new Date()) {
  const minutos = Math.round((ahora.getTime() - desde.getTime()) / 60000);
  if (minutos < 1) return 'hace menos de un minuto';
  if (minutos === 1) return 'hace 1 minuto';
  if (minutos < 60) return `hace ${minutos} minutos`;
  const horas = Math.round(minutos / 60);
  return horas === 1 ? 'hace 1 hora' : `hace ${horas} horas`;
}
