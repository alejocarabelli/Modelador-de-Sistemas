// La guía de formato que la app ya ofrece a las IAs (docs/artifact-json-guide.md),
// recortada al tipo de artefacto que se va a cambiar: entera son ~60 kB.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));

// En el paquete .mcpb va copiada al lado del servidor; en el repo se lee de docs/.
const UBICACIONES = [join(aqui, '..', 'guia-de-artefactos.md'), join(aqui, '..', '..', 'docs', 'artifact-json-guide.md')];

const SECCION_POR_TIPO = {
  'class-diagram': '2',
  'use-case-model': '3',
  'use-case-flow': '4',
  'sequence-diagram': '5',
  'class-sequence-diagram': '6',
};

async function leerGuia() {
  for (const ruta of UBICACIONES) {
    try {
      return await readFile(ruta, 'utf8');
    } catch {
      // Se prueba la siguiente ubicación.
    }
  }
  throw new Error('No encontré la guía de formato de artefactos.');
}

/** Divide por los títulos "## N." y devuelve el texto de cada sección por su número. */
function secciones(guia) {
  const resultado = new Map();
  const partes = guia.split(/^(?=## )/m);
  for (const parte of partes) {
    const numero = parte.match(/^## (\d+)\./)?.[1];
    if (numero) resultado.set(numero, parte.trim());
  }
  return resultado;
}

export async function guiaPara(tipo) {
  const numero = SECCION_POR_TIPO[tipo];
  if (!numero) throw new Error(`Tipo desconocido: ${tipo}. Tiene que ser uno de ${Object.keys(SECCION_POR_TIPO).join(', ')}.`);
  const porNumero = secciones(await leerGuia());
  // Las clases de secuencias remiten a la sección de clases (formato y disposición); la secuencia, a la 7.
  const numeros = { 'class-sequence-diagram': ['1', '2', '6'], 'sequence-diagram': ['1', '5', '7'] }[tipo] ?? ['1', numero];
  return numeros.map((n) => porNumero.get(n)).filter(Boolean).join('\n\n');
}
