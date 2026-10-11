import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * pdf.js necesita sus CMaps, fuentes estándar, decodificadores wasm y perfiles ICC como archivos
 * sueltos con su nombre original. En el build se copian a dist/pdfjs/ y en `vite` se sirven desde
 * node_modules, así el visor de PDF no depende de ningún servidor externo (la app funciona sin red).
 */
const FOLDERS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'pdfjs-dist');

const filesIn = (folder) => {
  const directory = join(packageRoot, folder);
  return existsSync(directory) ? readdirSync(directory).filter((name) => statSync(join(directory, name)).isFile()) : [];
};

export default function pdfjsAssets() {
  return {
    name: 'modelador-pdfjs-assets',
    configureServer(server) {
      server.middlewares.use('/pdfjs/', (request, response, next) => {
        const relative = decodeURIComponent((request.url ?? '').split('?')[0]).replace(/^\/+/, '');
        const file = resolve(packageRoot, normalize(relative));
        const folder = relative.split('/')[0];
        if (!FOLDERS.includes(folder) || !file.startsWith(packageRoot + sep) || !existsSync(file) || !statSync(file).isFile()) {
          next();
          return;
        }
        response.setHeader('Content-Type', 'application/octet-stream');
        response.end(readFileSync(file));
      });
    },
    generateBundle() {
      for (const folder of FOLDERS) {
        for (const name of filesIn(folder)) {
          this.emitFile({ type: 'asset', fileName: `pdfjs/${folder}/${name}`, source: readFileSync(join(packageRoot, folder, name)) });
        }
      }
    },
  };
}
