import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { guiaPara } from '../server/guia.js';
import { escribirPropuesta, problemasDelContenido, propuestasPendientes } from '../server/propuestas.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const demo = JSON.parse(await readFile(join(aqui, '../../fixtures/demo-gestion-tramites.json'), 'utf8'));

test('valida la forma del contenido igual que la importación de la app', () => {
  for (const artefacto of demo.artifacts) assert.deepEqual(problemasDelContenido(artefacto.type, artefacto.content), [], artefacto.type);
  assert.match(problemasDelContenido('otra-cosa', {})[0], /Tipo desconocido/);
  assert.match(problemasDelContenido('sequence-diagram', { participants: [] })[0], /"items"/);
  const clases = structuredClone(demo.artifacts.find((a) => a.type === 'class-diagram').content);
  clases.edges.push({ id: 'rota', source: 'no-existe', target: clases.nodes[0].id, data: {} });
  delete clases.nodes[0].position;
  const problemas = problemasDelContenido('class-diagram', clases);
  assert.ok(problemas.some((p) => /position/.test(p)));
  assert.ok(problemas.some((p) => /"rota" une nodos que no existen/.test(p)));
});

test('escribe la propuesta de forma atómica, con nombre ordenable y sin temporales', async () => {
  const carpeta = join(await mkdtemp(join(tmpdir(), 'propuestas-')), 'Claude', 'Propuestas');
  const nombre = await escribirPropuesta({ projectId: 'p', artifactId: 'a', type: 'use-case-model', name: 'Casos de uso ñandú', description: 'x', content: {} }, carpeta, new Date('2026-10-12T14:03:22.123Z'));
  assert.equal(nombre, '2026-10-12-14-03-22-123-casos-de-uso-nandu.json');
  assert.deepEqual(await readdir(carpeta), [nombre]);
  const datos = JSON.parse(await readFile(join(carpeta, nombre), 'utf8'));
  assert.equal(datos.format, 'modelador-propuesta');
  assert.equal(datos.version, 1);
  assert.equal((await propuestasPendientes(carpeta))[0].nombre, 'Casos de uso ñandú');
});

test('la guía se recorta al tipo pedido', async () => {
  const guia = await guiaPara('use-case-flow');
  assert.match(guia, /^## 1\. Contrato común/);
  assert.match(guia, /## 4\. Flujo de sucesos/);
  assert.doesNotMatch(guia, /## 2\. Diagrama de clases/);
  assert.ok((await guiaPara('sequence-diagram')).includes('## 7. Proyecto completo'));
  await assert.rejects(guiaPara('nada'), /Tipo desconocido/);
});

function llamar(entorno, nombre, argumentos) {
  const servidor = spawn(process.execPath, [join(aqui, '../server/index.js')], { env: { ...process.env, ...entorno } });
  return new Promise((resolver) => {
    servidor.stdout.once('data', (parte) => {
      servidor.kill();
      resolver(JSON.parse(String(parte).trim().split('\n')[0]).result);
    });
    servidor.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: nombre, arguments: argumentos } })}\n`);
  });
}

test('proponer_cambio deja la propuesta para el artefacto que corresponde', async () => {
  const base = await mkdtemp(join(tmpdir(), 'modelador-'));
  await writeFile(join(base, 'respaldo-1.json'), JSON.stringify({ version: 2, projects: [demo] }));
  const entorno = { MODELADOR_RESPALDOS: base, MODELADOR_WEBKIT: join(base, 'nada'), MODELADOR_PROPUESTAS: join(base, 'Propuestas') };
  const flujo = demo.artifacts.find((a) => a.type === 'use-case-flow');
  const contenido = { ...structuredClone(flujo.content), alternativeFlows: [] };

  const bien = await llamar(entorno, 'proponer_cambio', { artefacto: 'cambio de estado', contenido, descripcion: 'Saco el camino alternativo.' });
  assert.equal(bien.isError, undefined);
  assert.match(bien.content[0].text, /Todavía no se aplicó/);
  const [archivo] = await readdir(join(base, 'Propuestas'));
  const propuesta = JSON.parse(await readFile(join(base, 'Propuestas', archivo), 'utf8'));
  assert.equal(propuesta.projectId, demo.id);
  assert.equal(propuesta.artifactId, flujo.id);
  assert.equal(propuesta.type, 'use-case-flow');
  assert.equal(propuesta.basedOnUpdatedAt, flujo.updatedAt);
  assert.deepEqual(propuesta.content.alternativeFlows, []);

  const mal = await llamar(entorno, 'proponer_cambio', { artefacto: 'cambio de estado', contenido: { basicFlow: [] }, descripcion: 'x' });
  assert.equal(mal.isError, true);
  assert.match(mal.content[0].text, /La app no aceptaría este contenido/);

  const nuevoSinNombre = await llamar(entorno, 'proponer_cambio', { contenido: {}, descripcion: 'x' });
  assert.match(nuevoSinNombre.content[0].text, /hacen falta "nuevo_tipo" y "nuevo_nombre"/);

  const pendientes = await llamar(entorno, 'ver_propuestas_pendientes', {});
  assert.match(pendientes.content[0].text, /Cambio en "CU 3 · Cambio de estado": Saco el camino alternativo\./);
});
