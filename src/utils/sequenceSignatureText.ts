/** Keeps the straight quotes the signature parser expects when macOS substitutes smart ones. */
export const normalizeSignatureQuotes = (text: string): string =>
  text.replace(/[“”„]/g, '"').replace(/[‘’]/g, "'");

/** Signature text inserted when a method is picked from the list. */
export const methodInsertText = (method: { name: string; parameters: string; returnType: string }): string => {
  const name = method.name.trim().toLocaleLowerCase();
  // The arguments of these two are written by hand, so only the name and "(" go in.
  if (name === 'buscar' || name === 'guardar') return `${method.name}(`;
  return `${method.name}(${method.parameters})${method.returnType ? `: ${method.returnType}` : ''}`;
};
