#!/usr/bin/env node
// Servidor MCP (stdio) para que Claude Desktop lea lo que estás haciendo en el
// Modelador de Sistemas y proponga cambios. Nunca escribe en los datos de la
// app: las propuestas van a una carpeta aparte y la app pregunta antes de
// aplicarlas. Sin dependencias: habla JSON-RPC por stdin/stdout, un mensaje
// por línea, como pide el transporte stdio de MCP.

import { createInterface } from 'node:readline';
import { leerDatosEnVivo } from './enVivo.js';
import { guiaPara } from './guia.js';
import { aplicarOperaciones } from './edicion.js';
import { escribirPropuesta, problemasDelContenido, propuestasPendientes, TIPOS_VALIDOS } from './propuestas.js';
import { antiguedad, buscar, leerUltimoRespaldo, loQueEstaAbierto, proyectosDe } from './respaldos.js';
import { nombreDeTipo, resumirApuntes, resumirArtefacto } from './resumen.js';

const VERSION = '0.3.0';

const ARGUMENTOS_DE_ARTEFACTO = {
  type: 'object',
  properties: {
    artefacto: { type: 'string', description: 'Nombre (o parte del nombre) o ID del artefacto.' },
    proyecto: { type: 'string', description: 'Nombre o ID del proyecto. Si falta, el último proyecto en el que trabajó.' },
  },
  required: ['artefacto'],
};

const CON_IDS = {
  type: 'boolean',
  description: 'Agrega el id de cada elemento entre ‹ ›. Pedilo antes de usar editar_artefacto.',
};

const HERRAMIENTAS = [
  {
    name: 'ver_lo_que_estoy_haciendo',
    description:
      'Muestra el artefacto que el estudiante tiene abierto ahora en el Modelador de Sistemas (diagrama de clases, casos de uso, flujo de sucesos, secuencia o clases de secuencias), resumido en texto, con sus apuntes y dudas. Usala primero cuando pregunte por "esto", "mi diagrama" o lo que está haciendo.',
    inputSchema: { type: 'object', properties: { con_ids: CON_IDS } },
  },
  {
    name: 'listar_proyectos',
    description: 'Lista los proyectos del Modelador de Sistemas con sus artefactos (tipo, nombre y última modificación).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'leer_artefacto',
    description:
      'Lee otro artefacto del proyecto, resumido en texto. Sirve para comparar, por ejemplo, una secuencia con su flujo de sucesos o con el diagrama de clases.',
    inputSchema: { ...ARGUMENTOS_DE_ARTEFACTO, properties: { ...ARGUMENTOS_DE_ARTEFACTO.properties, con_ids: CON_IDS } },
  },
  {
    name: 'leer_mis_dudas',
    description: 'Junta las dudas y apuntes que el estudiante escribió en todos los artefactos de un proyecto.',
    inputSchema: {
      type: 'object',
      properties: { proyecto: ARGUMENTOS_DE_ARTEFACTO.properties.proyecto },
    },
  },
  {
    name: 'leer_artefacto_json',
    description:
      'Devuelve el JSON completo de un artefacto, con posiciones y datos de dibujo. Es mucho más largo: usala solo si el resumen (con con_ids) no alcanza, por ejemplo para ver los campos exactos de un elemento antes de agregar uno parecido.',
    inputSchema: ARGUMENTOS_DE_ARTEFACTO,
  },
  {
    name: 'ver_guia_de_formato',
    description:
      'Devuelve la guía del formato JSON de un tipo de artefacto (campos, reglas y un ejemplo completo). Leela antes de usar proponer_cambio con un tipo que no conocés.',
    inputSchema: {
      type: 'object',
      properties: { tipo: { type: 'string', enum: TIPOS_VALIDOS } },
      required: ['tipo'],
    },
  },
  {
    name: 'ver_propuestas_pendientes',
    description: 'Lista las propuestas de cambio que el estudiante todavía no aplicó ni descartó en la app.',
    inputSchema: { type: 'object', properties: {} },
  },
].map((herramienta) => ({ ...herramienta, annotations: { readOnlyHint: true, openWorldHint: false } }));

HERRAMIENTAS.push({
  name: 'editar_artefacto',
  description: [
    'Propone cambios puntuales en un artefacto existente sin reescribirlo: mandás solo operaciones sobre elementos identificados por su id',
    '(sacá los id con ver_lo_que_estoy_haciendo o leer_artefacto con con_ids: true). La extensión las aplica sobre la versión actual,',
    'verifica que no quede ninguna referencia rota (por ejemplo un retorno sin su llamada) y deja UNA propuesta: el estudiante la ve en la app',
    'y elige Aplicar o Descartar; si aplica, se deshace en un paso. Usala solo cuando te pida que cambies algo.',
    'Operaciones: {"op":"modificar","id":X,"campos":{...}} mezcla los campos (los objetos por dentro, p. ej. {"data":{"name":"Y"}} en una clase;',
    'las listas se reemplazan; null borra el campo). {"op":"agregar","en":X,"lista":"nombre de la lista","elemento":{...},"despues_de":id|"inicio"}',
    '(sin despues_de va al final; sin id en el elemento se genera uno). {"op":"quitar","id":X}. {"op":"mover","id":X,"en":Y,"lista":...,"despues_de":...}',
    'para cambiar algo de lugar (por ejemplo sacar un mensaje de un fragmento: en = id del operando o "contenido", lista = "items").',
    'El id "contenido" es la raíz: el encabezado de un flujo se cambia con {"op":"modificar","id":"contenido","campos":{"description":{"postcondition":"..."}}}.',
    'Listas habituales: en "contenido", nodes y edges (clases y casos de uso), participants e items (secuencia), basicFlow y alternativeFlows (flujo);',
    'en una clase, "data.attributes" y "data.methods"; en un fragmento, "operands"; en un operando, "items"; en un camino alternativo, "steps".',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      artefacto: ARGUMENTOS_DE_ARTEFACTO.properties.artefacto,
      proyecto: ARGUMENTOS_DE_ARTEFACTO.properties.proyecto,
      operaciones: { type: 'array', items: { type: 'object' }, description: 'Las operaciones, en orden.' },
      descripcion: { type: 'string', description: 'Qué cambia y por qué, en una o dos oraciones, para el aviso de la app.' },
    },
    required: ['artefacto', 'operaciones', 'descripcion'],
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
});

HERRAMIENTAS.push({
  name: 'proponer_cambio',
  description: [
    'Propone un artefacto NUEVO (con nuevo_tipo y nuevo_nombre) o la reescritura completa de uno chico.',
    'Para cambiar partes de un artefacto existente usá editar_artefacto: es más seguro y mucho más corto.',
    'No modifica nada por sí sola: en la app le aparece al estudiante un aviso con tu descripción y los botones Aplicar y Descartar, y si aplica puede deshacerlo.',
    'Usala solo cuando el estudiante te pida que armes o cambies algo. Si no conocés el formato del tipo, leé antes ver_guia_de_formato.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      artefacto: { type: 'string', description: 'Nombre o ID del artefacto a cambiar. Omitilo si proponés uno nuevo.' },
      proyecto: ARGUMENTOS_DE_ARTEFACTO.properties.proyecto,
      contenido: { type: 'object', description: 'El "content" completo del artefacto tal como debe quedar.' },
      descripcion: { type: 'string', description: 'Qué cambia y por qué, en una o dos oraciones, para el aviso de la app.' },
      nuevo_tipo: { type: 'string', enum: TIPOS_VALIDOS, description: 'Solo para un artefacto nuevo.' },
      nuevo_nombre: { type: 'string', description: 'Solo para un artefacto nuevo.' },
    },
    required: ['contenido', 'descripcion'],
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
});

// Primero lo que la app está guardando ahora; si no se encuentra (otra versión
// de macOS, la app nunca abierta), el último respaldo de Documentos.
async function leerDatos() {
  let enVivo = null;
  try {
    enVivo = await leerDatosEnVivo();
  } catch {
    // Datos en vivo ilegibles: se sigue con los respaldos.
  }
  if (enVivo) return { enVivo: true, modificado: enVivo.modificado, proyectos: proyectosDe(enVivo.datos) };
  const respaldo = await leerUltimoRespaldo();
  return { enVivo: false, modificado: respaldo.modificado, proyectos: respaldo.proyectos };
}

function encabezado(datos) {
  const hora = datos.modificado.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  if (datos.enVivo) return `(Datos en vivo de la app, guardados por última vez a las ${hora}, ${antiguedad(datos.modificado)}.)`;
  return [
    `(No se encontraron los datos en vivo de la app; esto es el último respaldo automático, de las ${hora}, ${antiguedad(datos.modificado)}.`,
    ' Puede no incluir los últimos minutos de trabajo.)',
  ].join('');
}

function elegirProyecto(proyectos, consulta) {
  if (!consulta) return loQueEstaAbierto(proyectos)?.proyecto ?? null;
  const proyecto = buscar(proyectos, consulta);
  if (!proyecto) throw new Error(`No hay un proyecto "${consulta}". Proyectos: ${proyectos.map((p) => p.name).join(', ')}.`);
  return proyecto;
}

function elegirArtefacto(proyecto, consulta) {
  const artefactos = proyecto.artifacts ?? [];
  const artefacto = buscar(artefactos, consulta);
  if (!artefacto) {
    throw new Error(`En "${proyecto.name}" no hay un artefacto "${consulta}". Artefactos: ${artefactos.map((a) => a.name).join(', ')}.`);
  }
  return artefacto;
}

async function ejecutar(nombre, argumentos = {}) {
  if (nombre === 'ver_guia_de_formato') return guiaPara(argumentos.tipo);
  if (nombre === 'ver_propuestas_pendientes') {
    const pendientes = await propuestasPendientes();
    if (pendientes.length === 0) return 'No hay propuestas pendientes: el estudiante aplicó o descartó todas.';
    return ['Propuestas que el estudiante todavía no resolvió:', ...pendientes.map((p) => `- ${p.nuevo ? 'Artefacto nuevo' : 'Cambio en'} "${p.nombre}": ${p.descripcion}`)].join('\n');
  }

  const datos = await leerDatos();
  const { proyectos } = datos;
  if (proyectos.length === 0) return 'No hay proyectos en el Modelador de Sistemas.';

  switch (nombre) {
    case 'ver_lo_que_estoy_haciendo': {
      const abierto = loQueEstaAbierto(proyectos);
      if (!abierto?.artefacto) return `${encabezado(datos)}\n\nEl proyecto "${abierto?.proyecto?.name}" no tiene artefactos todavía.`;
      const otros = abierto.proyecto.artifacts
        .filter((a) => a.id !== abierto.artefacto.id)
        .map((a) => `${nombreDeTipo(a.type)} "${a.name}"`);
      return [
        encabezado(datos),
        '',
        `Proyecto: ${abierto.proyecto.name}`,
        otros.length > 0 ? `Otros artefactos del proyecto (se leen con leer_artefacto): ${otros.join('; ')}` : '',
        '',
        resumirArtefacto(abierto.artefacto, abierto.proyecto, { ids: argumentos.con_ids === true }),
      ].join('\n');
    }
    case 'listar_proyectos': {
      const abierto = loQueEstaAbierto(proyectos);
      const lineas = [encabezado(datos)];
      for (const proyecto of proyectos) {
        lineas.push('', `## ${proyecto.name}${proyecto === abierto?.proyecto ? ' (el último en que trabajó)' : ''}`);
        for (const artefacto of proyecto.artifacts ?? []) {
          const marca = proyecto === abierto?.proyecto && artefacto === abierto.artefacto ? ' ← abierto' : '';
          lineas.push(`- ${nombreDeTipo(artefacto.type)}: ${artefacto.name} (modificado ${artefacto.updatedAt ?? '¿?'})${marca}`);
        }
      }
      return lineas.join('\n');
    }
    case 'leer_artefacto': {
      const proyecto = elegirProyecto(proyectos, argumentos.proyecto);
      return `${encabezado(datos)}\n\n${resumirArtefacto(elegirArtefacto(proyecto, argumentos.artefacto), proyecto, { ids: argumentos.con_ids === true })}`;
    }
    case 'leer_artefacto_json': {
      const proyecto = elegirProyecto(proyectos, argumentos.proyecto);
      return `${encabezado(datos)}\n\n${JSON.stringify(elegirArtefacto(proyecto, argumentos.artefacto))}`;
    }
    case 'leer_mis_dudas': {
      const proyecto = elegirProyecto(proyectos, argumentos.proyecto);
      const lineas = [encabezado(datos), '', `Apuntes y dudas del proyecto "${proyecto.name}":`];
      let hay = false;
      for (const artefacto of proyecto.artifacts ?? []) {
        const apuntes = resumirApuntes(artefacto.notebook);
        if (apuntes.length === 0) continue;
        hay = true;
        lineas.push('', `## ${nombreDeTipo(artefacto.type)}: ${artefacto.name}`, ...apuntes);
      }
      if (!hay) lineas.push('', '(No escribió apuntes ni dudas en este proyecto.)');
      return lineas.join('\n');
    }
    case 'editar_artefacto':
      return editarArtefacto(proyectos, argumentos);
    case 'proponer_cambio':
      return proponerCambio(proyectos, argumentos);
    default:
      throw new Error(`Herramienta desconocida: ${nombre}`);
  }
}

async function editarArtefacto(proyectos, argumentos) {
  const proyecto = elegirProyecto(proyectos, argumentos.proyecto);
  if (!proyecto) throw new Error('No hay un proyecto abierto.');
  const artefacto = elegirArtefacto(proyecto, argumentos.artefacto);
  const descripcion = String(argumentos.descripcion ?? '').trim();
  if (!descripcion) throw new Error('Falta "descripcion": el estudiante la lee antes de decidir.');
  let operaciones = argumentos.operaciones;
  if (typeof operaciones === 'string') {
    try {
      operaciones = JSON.parse(operaciones);
    } catch {
      throw new Error('"operaciones" no es un JSON válido.');
    }
  }

  const { contenido, hechas } = aplicarOperaciones(artefacto.content, operaciones);
  return guardarPropuesta({
    projectId: proyecto.id,
    artifactId: artefacto.id,
    type: artefacto.type,
    name: artefacto.name,
    basedOnUpdatedAt: artefacto.updatedAt ?? null,
  }, contenido, descripcion, `Operaciones aplicadas sobre la versión actual: ${hechas.join(', ')}.`);
}

async function guardarPropuesta(propuesta, contenido, descripcion, detalle = '') {
  const problemas = problemasDelContenido(propuesta.type, contenido);
  if (problemas.length > 0) {
    throw new Error(`La app no aceptaría este contenido:\n- ${problemas.join('\n- ')}\nRevisá ver_guia_de_formato y volvé a intentar.`);
  }
  await escribirPropuesta({ ...propuesta, description: descripcion, content: contenido });
  return [
    detalle,
    `Listo: en el Modelador le aparece al estudiante un aviso para ${propuesta.artifactId ? `aplicar el cambio en "${propuesta.name}"` : `crear "${propuesta.name}"`} o descartarlo.`,
    'Todavía no se aplicó: decíselo, y que si lo aplica lo puede deshacer.',
  ].filter(Boolean).join(' ');
}

async function proponerCambio(proyectos, argumentos) {
  const proyecto = elegirProyecto(proyectos, argumentos.proyecto);
  if (!proyecto) throw new Error('No hay un proyecto abierto al que proponerle el cambio.');
  let contenido = argumentos.contenido;
  if (typeof contenido === 'string') {
    try {
      contenido = JSON.parse(contenido);
    } catch {
      throw new Error('"contenido" no es un JSON válido.');
    }
  }
  const descripcion = String(argumentos.descripcion ?? '').trim();
  if (!descripcion) throw new Error('Falta "descripcion": el estudiante la lee antes de decidir.');

  let propuesta;
  if (argumentos.artefacto) {
    const artefacto = elegirArtefacto(proyecto, argumentos.artefacto);
    propuesta = {
      projectId: proyecto.id,
      artifactId: artefacto.id,
      type: artefacto.type,
      name: artefacto.name,
      basedOnUpdatedAt: artefacto.updatedAt ?? null,
    };
  } else {
    const nombre = String(argumentos.nuevo_nombre ?? '').trim();
    if (!argumentos.nuevo_tipo || !nombre) throw new Error('Para un artefacto nuevo hacen falta "nuevo_tipo" y "nuevo_nombre"; para cambiar uno, "artefacto".');
    propuesta = { projectId: proyecto.id, artifactId: null, type: argumentos.nuevo_tipo, name: nombre, basedOnUpdatedAt: null };
  }

  return guardarPropuesta(propuesta, contenido, descripcion);
}

// ---------------------------------------------------------------------------
// JSON-RPC por stdio

const responder = (mensaje) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...mensaje })}\n`);

async function atender(pedido) {
  const { id, method, params } = pedido;
  const esNotificacion = id === undefined || id === null;

  switch (method) {
    case 'initialize':
      return responder({
        id,
        result: {
          protocolVersion: params?.protocolVersion ?? '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'modelador-de-sistemas', version: VERSION },
          instructions:
            'Herramientas para ver el trabajo del estudiante en el Modelador de Sistemas (materia Diseño de Sistemas). Leen lo que la app tiene guardado en este Mac. Para cambiar algo, editar_artefacto (cambios puntuales) o proponer_cambio (artefactos nuevos) dejan una propuesta que el estudiante aplica o descarta en la app; nunca se modifica nada sin que él acepte. Al hablar de un mensaje de una secuencia, nombralo por su texto, sus participantes y el fragmento donde está; no le pongas números, porque el estudiante no los usa.',
        },
      });
    case 'ping':
      return responder({ id, result: {} });
    case 'tools/list':
      return responder({ id, result: { tools: HERRAMIENTAS } });
    case 'tools/call':
      try {
        const texto = await ejecutar(params?.name, params?.arguments);
        return responder({ id, result: { content: [{ type: 'text', text: texto }] } });
      } catch (error) {
        return responder({ id, result: { content: [{ type: 'text', text: error.message }], isError: true } });
      }
    default:
      if (!esNotificacion) responder({ id, error: { code: -32601, message: `Método no soportado: ${method}` } });
  }
}

createInterface({ input: process.stdin }).on('line', (linea) => {
  if (!linea.trim()) return;
  let pedido;
  try {
    pedido = JSON.parse(linea);
  } catch {
    responder({ id: null, error: { code: -32700, message: 'JSON inválido' } });
    return;
  }
  atender(pedido).catch((error) => process.stderr.write(`${error.stack ?? error}\n`));
});
