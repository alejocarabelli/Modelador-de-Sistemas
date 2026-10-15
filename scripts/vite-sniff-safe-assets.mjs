/*
 * En Windows la app la sirve Tauri, que decide el tipo de cada archivo mirando su contenido (crate
 * `infer`) antes que la extensión. Si un .js trae por casualidad una firma conocida en su primer KB
 * (por ejemplo el texto «%PDF» de pdfExport), sale como application/pdf, WebView2 se niega a
 * ejecutarlo y todo editor que lo importe muere con «Failed to fetch dynamically imported module».
 *
 * Por eso cada .js, .mjs y .css del build empieza con un comentario de más de 1 KB: lo único que
 * ve `infer` es un comentario, que no coincide con ninguna firma, y el tipo sale de la extensión.
 */
const SNIFF_WINDOW = 1024;
const PADDED = /\.(?:m?js|css)$/;

const LINE = ' * Relleno para que Tauri no confunda este archivo con otro tipo por su contenido.\n';
export const SNIFF_PADDING = `/*\n${LINE.repeat(Math.ceil(SNIFF_WINDOW / LINE.length))} */\n`;

/** Antepone el relleno, salvo en CSS con @charset, que tiene que ser lo primero del archivo. */
export const padForContentSniffing = (fileName, code) => {
  if (!PADDED.test(fileName) || code.startsWith(SNIFF_PADDING)) return code;
  if (fileName.endsWith('.css') && code.startsWith('@charset')) return code;
  return SNIFF_PADDING + code;
};

export default function sniffSafeAssets() {
  return {
    name: 'modelador-sniff-safe-assets',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        for (const output of Object.values(bundle)) {
          if (output.type === 'chunk') {
            output.code = padForContentSniffing(output.fileName, output.code);
          } else if (PADDED.test(output.fileName)) {
            const source = typeof output.source === 'string' ? output.source : new TextDecoder().decode(output.source);
            output.source = padForContentSniffing(output.fileName, source);
          }
        }
      },
    },
  };
}
