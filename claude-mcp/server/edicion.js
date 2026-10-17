// Cambios chicos sobre un artefacto: Claude manda operaciones que apuntan a
// elementos por su id (un mensaje, una clase, un paso, un fragmento…) y acá se
// aplican sobre el contenido actual. Así no tiene que reescribir el diagrama
// entero, que es donde se rompen referencias sin que se note.
//
// Operaciones:
//   { op: 'modificar', id, campos }              mezcla `campos` en el elemento (los objetos se
//                                                mezclan por dentro; las listas se reemplazan)
//   { op: 'agregar', en, lista, elemento, despues_de? }
//                                                agrega a la lista `lista` del elemento `en`
//   { op: 'quitar', id }                         saca el elemento de la lista donde está
//   { op: 'mover', id, en, lista, despues_de? }  lo saca de donde está y lo pone en otra posición
// `id: 'contenido'` (o `en: 'contenido'`) es la raíz del artefacto. `despues_de` es el id
// del elemento anterior, 'inicio' para el principio, o se omite para el final.
//
// La app importa este mismo archivo (src/storage/claudeProposals.ts) para volver a aplicar
// las operaciones sobre la versión que tiene en ese momento: por eso no usa nada de Node.

const nuevoId = () => (globalThis.crypto?.randomUUID
  ? globalThis.crypto.randomUUID()
  : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export const RAIZ = 'contenido';

const esObjeto = (valor) => typeof valor === 'object' && valor !== null && !Array.isArray(valor);

/** Cada objeto con `id` del contenido, con la lista que lo contiene y una ruta legible. */
function indexar(contenido) {
  const porId = new Map();
  const recorrer = (valor, ruta, lista) => {
    if (Array.isArray(valor)) {
      valor.forEach((item, indice) => recorrer(item, `${ruta}[${indice}]`, valor));
      return;
    }
    if (!esObjeto(valor)) return;
    if (typeof valor.id === 'string' && valor.id) {
      const encontrados = porId.get(valor.id) ?? [];
      encontrados.push({ objeto: valor, lista, ruta });
      porId.set(valor.id, encontrados);
    }
    for (const [clave, hijo] of Object.entries(valor)) recorrer(hijo, `${ruta}.${clave}`, null);
  };
  recorrer(contenido, RAIZ, null);
  return porId;
}

function buscarUno(contenido, id) {
  if (id === RAIZ) return { objeto: contenido, lista: null, ruta: RAIZ };
  const encontrados = indexar(contenido).get(id) ?? [];
  if (encontrados.length === 0) throw new Error(`No hay ningún elemento con id "${id}".`);
  if (encontrados.length > 1) throw new Error(`Hay más de un elemento con id "${id}" (${encontrados.map((e) => e.ruta).join(', ')}).`);
  return encontrados[0];
}

function mezclar(destino, campos) {
  for (const [clave, valor] of Object.entries(campos)) {
    if (clave === 'id') throw new Error('No se puede cambiar el id de un elemento: quitalo y agregá otro.');
    if (esObjeto(valor) && esObjeto(destino[clave])) mezclar(destino[clave], valor);
    else if (valor === null) delete destino[clave];
    else destino[clave] = structuredClone(valor);
  }
}

function insertar(lista, elemento, despuesDe) {
  if (despuesDe === undefined || despuesDe === null || despuesDe === 'final') {
    lista.push(elemento);
  } else if (despuesDe === 'inicio') {
    lista.unshift(elemento);
  } else {
    const indice = lista.findIndex((item) => esObjeto(item) && item.id === despuesDe);
    if (indice < 0) throw new Error(`"despues_de": "${despuesDe}" no está en esa lista.`);
    lista.splice(indice + 1, 0, elemento);
  }
}

/** Las listas de un objeto, también las que están un nivel adentro (data.attributes). */
function listasDe(objeto) {
  const listas = [];
  for (const [clave, valor] of Object.entries(objeto)) {
    if (Array.isArray(valor)) listas.push(clave);
    else if (esObjeto(valor)) for (const [interna, v] of Object.entries(valor)) if (Array.isArray(v)) listas.push(`${clave}.${interna}`);
  }
  return listas;
}

function listaDestino(contenido, en, nombreDeLista) {
  const { objeto } = buscarUno(contenido, en ?? RAIZ);
  if (typeof nombreDeLista !== 'string' || !nombreDeLista) throw new Error('Falta "lista": el campo lista donde va (por ejemplo "items", "nodes", "data.methods", "steps").');
  const lista = nombreDeLista.split('.').reduce((actual, clave) => (esObjeto(actual) ? actual[clave] : undefined), objeto);
  if (!Array.isArray(lista)) {
    throw new Error(`"${en ?? RAIZ}" no tiene una lista "${nombreDeLista}". Listas que tiene: ${listasDe(objeto).join(', ') || 'ninguna'}.`);
  }
  return lista;
}

function sacar(entrada, id) {
  if (!entrada.lista) throw new Error(`"${id}" no está en una lista: no se puede quitar ni mover (modificá sus campos).`);
  entrada.lista.splice(entrada.lista.indexOf(entrada.objeto), 1);
}

/** Textos del contenido que nombran exactamente a un id: referencias de un elemento a otro. */
function referenciasA(contenido, ids) {
  const encontradas = [];
  const recorrer = (valor, ruta) => {
    if (Array.isArray(valor)) valor.forEach((item, indice) => recorrer(item, `${ruta}[${indice}]`));
    else if (esObjeto(valor)) for (const [clave, hijo] of Object.entries(valor)) recorrer(hijo, `${ruta}.${clave}`);
    else if (typeof valor === 'string' && ids.has(valor) && !ruta.endsWith('.id')) encontradas.push(`${ruta} → "${valor}"`);
  };
  recorrer(contenido, RAIZ);
  return encontradas;
}

export function aplicarOperaciones(contenidoOriginal, operaciones) {
  if (!Array.isArray(operaciones) || operaciones.length === 0) throw new Error('Mandá al menos una operación en "operaciones".');
  const contenido = structuredClone(contenidoOriginal);
  const quitados = new Set();
  const hechas = [];

  operaciones.forEach((operacion, indice) => {
    const donde = `Operación ${indice + 1} (${operacion?.op ?? '¿?'})`;
    try {
      if (!esObjeto(operacion)) throw new Error('tiene que ser un objeto.');
      switch (operacion.op) {
        case 'modificar': {
          if (!esObjeto(operacion.campos)) throw new Error('falta "campos" con lo que cambia.');
          mezclar(buscarUno(contenido, operacion.id).objeto, operacion.campos);
          hechas.push(`modificado ${operacion.id}`);
          break;
        }
        case 'agregar': {
          if (!esObjeto(operacion.elemento)) throw new Error('falta "elemento".');
          const elemento = structuredClone(operacion.elemento);
          if (typeof elemento.id !== 'string' || !elemento.id) elemento.id = nuevoId();
          if (indexar(contenido).has(elemento.id)) throw new Error(`ya existe un elemento con id "${elemento.id}".`);
          insertar(listaDestino(contenido, operacion.en, operacion.lista), elemento, operacion.despues_de);
          quitados.delete(elemento.id);
          hechas.push(`agregado ${elemento.id}`);
          break;
        }
        case 'quitar': {
          const entrada = buscarUno(contenido, operacion.id);
          sacar(entrada, operacion.id);
          // Lo que estaba adentro (los mensajes de un fragmento, los pasos de un camino) también se va.
          for (const id of indexar(entrada.objeto).keys()) quitados.add(id);
          hechas.push(`quitado ${operacion.id}`);
          break;
        }
        case 'mover': {
          const entrada = buscarUno(contenido, operacion.id);
          sacar(entrada, operacion.id);
          insertar(listaDestino(contenido, operacion.en, operacion.lista), entrada.objeto, operacion.despues_de);
          hechas.push(`movido ${operacion.id}`);
          break;
        }
        default:
          throw new Error('"op" tiene que ser modificar, agregar, quitar o mover.');
      }
    } catch (error) {
      throw new Error(`${donde}: ${error.message}`);
    }
  });

  // Nada puede quedar apuntando a algo que se quitó (un retorno a su llamada, una nota a su
  // mensaje, una relación a su clase…): mejor frenar que entregar un diagrama roto.
  for (const id of indexar(contenido).keys()) quitados.delete(id);
  const sueltas = referenciasA(contenido, quitados);
  if (sueltas.length > 0) {
    throw new Error([
      'Estas referencias quedarían apuntando a elementos quitados. Quitalas, cambialas o quitá también esos elementos en las mismas operaciones:',
      ...sueltas.slice(0, 15).map((referencia) => `- ${referencia}`),
    ].join('\n'));
  }
  return { contenido, hechas };
}
