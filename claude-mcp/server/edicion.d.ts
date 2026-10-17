// Tipos para que la app (TypeScript) importe edicion.js.
export declare const RAIZ: 'contenido';
export declare function aplicarOperaciones(
  contenidoOriginal: unknown,
  operaciones: unknown,
): { contenido: unknown; hechas: string[] };
