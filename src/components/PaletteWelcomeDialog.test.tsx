import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PaletteWelcomeDialog } from './PaletteWelcomeDialog';

const render = (palette: 'grafito' | 'cuaderno') => {
  const handler = vi.fn();
  return renderToString(
    <PaletteWelcomeDialog
      palette={palette}
      appearance="light"
      themePreference="system"
      onPreviewPalette={handler}
      onThemePreferenceChange={handler}
      onConfirm={handler}
    />,
  );
};

describe('PaletteWelcomeDialog', () => {
  it('offers both palettes with a preview each and checks the current one', () => {
    const html = render('grafito');
    expect(html).toContain('¿Cómo querés ver tus diagramas?');
    expect(html.match(/class="palette-preview"/g)).toHaveLength(2);
    expect(html).toMatch(/checked="" value="grafito"/);
    expect(html).not.toMatch(/checked="" value="cuaderno"/);
  });

  it('marks the appearance in use and says where to change the palette later', () => {
    const html = render('cuaderno');
    expect(html).toMatch(/checked="" value="cuaderno"/);
    expect(html).toMatch(/aria-checked="true"[^>]*>Automático/);
    expect(html).toContain('desde Apariencia');
  });
});
