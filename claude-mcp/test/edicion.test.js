import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { aplicarOperaciones } from '../server/edicion.js';
import { problemasDelContenido } from '../server/propuestas.js';
import { resumirArtefacto } from '../server/resumen.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const demo = JSON.parse(await readFile(join(aqui, '../../fixtures/demo-gestion-tramites.json'), 'utf8'));
const artefacto = (tipo) => demo.artifacts.find((a) => a.type === tipo);
const secuencia = artefacto('sequence-diagram').content;
const mensaje = (id, sourceId, targetId, name, extra = {}) => ({ id, kind: 'message', type: 'synchronous', sourceId, targetId, name, arguments: '', parameterValues: '', returnType: '', flowReference: '', ...extra });

test('saca un mensaje del loop, lo pone antes, nombra el loop y no toca nada más', () => {
  const { contenido, hechas } = aplicarOperaciones(secuencia, [
    { op: 'mover', id: 's3', en: 'contenido', lista: 'items', despues_de: 's2' },
    { op: 'modificar', id: 'f1', campos: { name: 'Por cada trámite' } },
    { op: 'modificar', id: 's3', campos: { name: 'getListNroTramite' } },
  ]);
  assert.deepEqual(contenido.items.map((item) => item.id), ['s1', 's2', 's3', 'f1', 's5']);
  assert.deepEqual(contenido.items[3].operands[0].items.map((item) => item.id), ['s4']);
  assert.equal(contenido.items[3].name, 'Por cada trámite');
  assert.equal(contenido.items[2].name, 'getListNroTramite');
  assert.deepEqual(contenido.participants, secuencia.participants);
  assert.deepEqual(hechas, ['movido s3', 'modificado f1', 'modificado s3']);
  assert.equal(secuencia.items.length, 4, 'el original no se modifica');
  assert.deepEqual(problemasDelContenido('sequence-diagram', contenido), []);
});

test('no deja referencias rotas al quitar', () => {
  const conRetorno = aplicarOperaciones(secuencia, [
    { op: 'agregar', en: 'contenido', lista: 'items', despues_de: 's5', elemento: mensaje('r1', secuencia.items[3].targetId, secuencia.items[3].sourceId, '', { type: 'return', replyToMessageId: 's5' }) },
  ]).contenido;
  assert.throws(() => aplicarOperaciones(conRetorno, [{ op: 'quitar', id: 's5' }]), /items\[\d\]\.replyToMessageId → "s5"/);
  // Quitar el loop se lleva sus mensajes; quitar también lo que los nombra lo deja consistente.
  const sinLoop = aplicarOperaciones(conRetorno, [{ op: 'quitar', id: 's5' }, { op: 'quitar', id: 'r1' }, { op: 'quitar', id: 'f1' }]).contenido;
  assert.deepEqual(sinLoop.items.map((item) => item.id), ['s1', 's2']);
  // Corregir a qué llamada responde un retorno es un modificar.
  const corregido = aplicarOperaciones(conRetorno, [{ op: 'modificar', id: 'r1', campos: { replyToMessageId: 's2' } }]).contenido;
  assert.equal(corregido.items.at(-1).replyToMessageId, 's2');
});

test('agrega miembros a una clase y cambia el encabezado de un flujo', () => {
  const clases = aplicarOperaciones(artefacto('class-diagram').content, [
    { op: 'agregar', en: 'c-consultor', lista: 'data.attributes', elemento: { name: 'email', type: 'String' } },
    { op: 'modificar', id: 'c-consultor', campos: { data: { name: 'Consultor' } } },
  ]).contenido;
  const consultor = clases.nodes.find((nodo) => nodo.id === 'c-consultor');
  assert.equal(consultor.data.attributes.at(-1).name, 'email');
  assert.match(consultor.data.attributes.at(-1).id, /^[0-9a-f-]{36}$/);
  assert.equal(consultor.data.methods.length, 1, 'mezclar data no borra los métodos');
  assert.deepEqual(problemasDelContenido('class-diagram', clases), []);

  const flujo = aplicarOperaciones(artefacto('use-case-flow').content, [
    { op: 'modificar', id: 'contenido', campos: { description: { postcondition: 'Nueva' } } },
  ]).contenido;
  assert.equal(flujo.description.postcondition, 'Nueva');
  assert.equal(flujo.description.actor, artefacto('use-case-flow').content.description.actor);
});

test('explica cada error con la operación que lo causó', () => {
  const casos = [
    [[], /al menos una operación/],
    [[{ op: 'modificar', id: 'nada', campos: {} }], /Operación 1 \(modificar\): No hay ningún elemento con id "nada"/],
    [[{ op: 'modificar', id: 's1', campos: { id: 'otro' } }], /No se puede cambiar el id/],
    [[{ op: 'agregar', en: 's1', lista: 'items', elemento: {} }], /"s1" no tiene una lista "items"/],
    [[{ op: 'agregar', en: 'contenido', lista: 'items', elemento: { id: 's1' } }], /ya existe un elemento con id "s1"/],
    [[{ op: 'mover', id: 's1', en: 'contenido', lista: 'items', despues_de: 'no-esta' }], /"despues_de": "no-esta" no está/],
    [[{ op: 'quitar', id: 'contenido' }], /no está en una lista/],
    [[{ op: 'borrar', id: 's1' }], /"op" tiene que ser/],
  ];
  for (const [operaciones, error] of casos) assert.throws(() => aplicarOperaciones(secuencia, operaciones), error);
});

test('el resumen con ids muestra a qué apuntar', () => {
  const texto = resumirArtefacto(artefacto('sequence-diagram'), demo, { ids: true });
  assert.match(texto, /fragmento loop \(bucle\) ‹f1›/);
  assert.match(texto, /operando \[por cada trámite\] ‹o1›/);
  assert.match(texto, /getNroTramite\(\): int {2}\[paso del flujo: 2\] ‹s3›/);
  assert.doesNotMatch(resumirArtefacto(artefacto('sequence-diagram'), demo), /‹/);
  assert.match(resumirArtefacto(artefacto('class-diagram'), demo, { ids: true }), /### Tramite ‹c-tramite›/);
});
