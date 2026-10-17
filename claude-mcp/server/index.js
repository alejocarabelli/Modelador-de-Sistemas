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

const VERSION = '0.4.0';

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
  description: 'Agrega el id de cada elemento entre ‹ ›. Pedilo antes de usar proponer_cambio en un artefacto existente.',
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
  name: 'proponer_cambio',
  description: [
    'Propone un cambio que el estudiante aplica o descarta en la app: no modifica nada por sí sola. En el Modelador le aparece un aviso con tu',
    'descripción y los botones Aplicar y Descartar; si aplica, se deshace con Cmd+Z. Usala solo cuando te pida que cambies o armes algo.',
    'Para cambiar un artefacto existente mandá "artefacto" y "operaciones": solo lo que cambia, NUNCA el diagrama entero.',
    'Sacá los id con ver_lo_que_estoy_haciendo o leer_artefacto con con_ids: true. La extensión aplica las operaciones sobre la versión actual,',
    'verifica que no quede ninguna referencia rota (por ejemplo un retorno sin su llamada) y la app las vuelve a aplicar al aceptar, así no se pierde',
    'lo que el estudiante haya cambiado mientras tanto.',
    'Operaciones: {"op":"modificar","id":X,"campos":{...}} mezcla los campos (los objetos por dentro, p. ej. {"data":{"name":"Y"}} en una clase;',
    'las listas se reemplazan; null borra el campo). {"op":"agregar","en":X,"lista":"nombre de la lista","elemento":{...},"despues_de":id|"inicio"}',
    '(sin despues_de va al final; sin id en el elemento se genera uno). {"op":"quitar","id":X}. {"op":"mover","id":X,"en":Y,"lista":...,"despues_de":...}',
    'para cambiar algo de lugar (por ejemplo sacar un mensaje de un fragmento: en = id del operando o "contenido", lista = "items").',
    'El id "contenido" es la raíz: el encabezado de un flujo se cambia con {"op":"modificar","id":"contenido","campos":{"description":{"postcondition":"..."}}}.',
    'Listas habituales: en "contenido", nodes y edges (clases y casos de uso), participants, items y notes (secuencia), basicFlow y alternativeFlows (flujo);',
    'en una clase, "data.attributes" y "data.methods"; en un fragmento, "operands"; en un operando, "items"; en un camino alternativo, "steps".',
    'Si no conocés los campos de un elemento nuevo, mirá uno parecido con leer_artefacto_json o leé ver_guia_de_formato.',
    'Para un artefacto NUEVO mandá "contenido" completo con "nuevo_tipo" y "nuevo_nombre" (leé antes ver_guia_de_formato).',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      artefacto: { type: 'string', description: 'Nombre o ID del artefacto a cambiar. Omitilo si proponés uno nuevo.' },
      proyecto: ARGUMENTOS_DE_ARTEFACTO.properties.proyecto,
      operaciones: { type: 'array', items: { type: 'object' }, description: 'Para cambiar un artefacto existente: las operaciones, en orden.' },
      contenido: { type: 'object', description: 'Solo para un artefacto nuevo: su "content" completo.' },
      descripcion: { type: 'string', description: 'Qué cambia y por qué, en una o dos oraciones, para el aviso de la app.' },
      nuevo_tipo: { type: 'string', enum: TIPOS_VALIDOS, description: 'Solo para un artefacto nuevo.' },
      nuevo_nombre: { type: 'string', description: 'Solo para un artefacto nuevo.' },
    },
    required: ['descripcion'],
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
    case 'editar_artefacto': // Nombre de la 0.3.0: lo mismo que proponer_cambio con operaciones.
    case 'proponer_cambio':
      return proponerCambio(proyectos, argumentos);
    default:
      throw new Error(`Herramienta desconocida: ${nombre}`);
  }
}

const comoJson = (valor, campo) => {
  if (typeof valor !== 'string') return valor;
  try {
    return JSON.parse(valor);
  } catch {
    throw new Error(`"${campo}" no es un JSON válido.`);
  }
};

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
  const descripcion = String(argumentos.descripcion ?? '').trim();
  if (!descripcion) throw new Error('Falta "descripcion": el estudiante la lee antes de decidir.');
  const operaciones = comoJson(argumentos.operaciones, 'operaciones');
  const contenido = comoJson(argumentos.contenido, 'contenido');
  const hayOperaciones = operaciones !== undefined && operaciones !== null;
  const hayContenido = contenido !== undefined && contenido !== null;
  if (hayOperaciones && hayContenido) throw new Error('Mandá "operaciones" o "contenido", no los dos.');

  if (!argumentos.artefacto) {
    const nombre = String(argumentos.nuevo_nombre ?? '').trim();
    if (!argumentos.nuevo_tipo || !nombre) throw new Error('Para un artefacto nuevo hacen falta "nuevo_tipo", "nuevo_nombre" y "contenido"; para cambiar uno, "artefacto" y "operaciones".');
    if (!hayContenido) throw new Error('Un artefacto nuevo necesita "contenido" completo.');
    return guardarPropuesta({ projectId: proyecto.id, artifactId: null, type: argumentos.nuevo_tipo, name: nombre, basedOnUpdatedAt: null }, contenido, descripcion);
  }

  const artefacto = elegirArtefacto(proyecto, argumentos.artefacto);
  const propuesta = {
    projectId: proyecto.id,
    artifactId: artefacto.id,
    type: artefacto.type,
    name: artefacto.name,
    basedOnUpdatedAt: artefacto.updatedAt ?? null,
  };
  if (hayOperaciones) {
    const { contenido: resultado, hechas } = aplicarOperaciones(artefacto.content, operaciones);
    return guardarPropuesta({ ...propuesta, operations: operaciones }, resultado, descripcion, `Operaciones aplicadas sobre la versión actual: ${hechas.join(', ')}.`);
  }
  if (!hayContenido) throw new Error('Mandá "operaciones" con lo que cambia (con los id de con_ids: true).');
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
            'Herramientas para ver el trabajo del estudiante en el Modelador de Sistemas (materia Diseño de Sistemas). Leen lo que la app tiene guardado en este Mac. Para cambiar algo, proponer_cambio deja una propuesta que el estudiante aplica o descarta en la app; nunca se modifica nada sin que él acepte. Para un artefacto existente mandá solo operaciones sobre los elementos que cambian (sus id salen con con_ids: true), nunca el diagrama entero. Al hablar de un mensaje de una secuencia, nombralo por su texto, sus participantes y el fragmento donde está; no le pongas números, porque el estudiante no los usa.',
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
