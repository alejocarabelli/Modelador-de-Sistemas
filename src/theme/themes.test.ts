import { describe, expect, it } from 'vitest';
import { buildThemeVariables } from '../hooks/useTheme';
import {
  resolveParticipantVisualIdentity,
  resolveSequenceNoteScheme,
  toDarkParticipantFamily,
  SEQUENCE_PARTICIPANT_PALETTE,
} from '../utils/sequenceParticipantColors';
import { SEQUENCE_NOTE_COLORS } from '../types/diagram';
import {
  academicDarkTheme,
  academicLightTheme,
  getExportTheme,
  getTheme,
  getThemeById,
  indigoDarkTheme,
  indigoLightTheme,
  themes,
} from './themes';

const readRaw = (modules: Record<string, unknown>): string[] => Object.values(modules) as string[];
const stylesheets = readRaw(import.meta.glob('../*.css', { query: '?raw', import: 'default', eager: true }));
const componentSources = readRaw(import.meta.glob('../components/*.tsx', { query: '?raw', import: 'default', eager: true }));

/** Variables that stylesheets or components define locally instead of the theme. */
const locallyDefined = new Set([
  ...stylesheets.flatMap((css) => Array.from(css.matchAll(/(--[\w-]+)\s*:/g), (match) => match[1])),
  ...componentSources.flatMap((source) => Array.from(source.matchAll(/['"](--[\w-]+)['"]\s*:/g), (match) => match[1])),
]);

const relativeLuminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string): number => {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

describe('themes', () => {
  it('resolves both appearances by id and falls back to light', () => {
    expect(getThemeById('academic-dark')).toBe(academicDarkTheme);
    expect(getThemeById('academic-light')).toBe(academicLightTheme);
    expect(getThemeById('unknown')).toBe(academicLightTheme);
  });

  it('defines every theme variable the stylesheets read, in both themes', () => {
    expect(stylesheets).toHaveLength(2);
    expect(componentSources.length).toBeGreaterThan(10);
    const used = new Set(
      stylesheets.flatMap((css) => Array.from(css.matchAll(/var\((--[\w-]+)\)/g), (match) => match[1])),
    );
    themes.forEach((theme) => {
      const defined = new Set(Object.keys(buildThemeVariables(theme)));
      const missing = [...used].filter((name) => !defined.has(name) && !locallyDefined.has(name));
      expect(missing, theme.id).toEqual([]);
    });
  });

  it.each([academicDarkTheme, indigoDarkTheme])('keeps body text readable on dark surfaces ($id)', ({ ui, status, sequence, classNode }) => {
    expect(contrast(ui.panelText, ui.panelBackground)).toBeGreaterThan(7);
    expect(contrast(ui.panelMutedText, ui.panelBackground)).toBeGreaterThan(4.5);
    expect(contrast(ui.buttonActiveText, ui.buttonActiveBackground)).toBeGreaterThan(4.5);
    expect(contrast(classNode.text, classNode.background)).toBeGreaterThan(7);
    expect(contrast(sequence.text, sequence.canvasBackground)).toBeGreaterThan(7);
    Object.values(status).forEach((tone) => expect(contrast(tone.text, tone.soft)).toBeGreaterThan(4.5));
  });

  it('pairs each palette with both appearances and exports on its light theme', () => {
    expect(getTheme('indigo', 'light')).toBe(indigoLightTheme);
    expect(getTheme('indigo', 'dark')).toBe(indigoDarkTheme);
    expect(getTheme('cuaderno', 'dark')).toBe(academicDarkTheme);
    expect(getExportTheme('indigo')).toBe(indigoLightTheme);
    expect(getExportTheme('cuaderno')).toBe(academicLightTheme);
  });

  it('gives every Tinta y ámbar participant indigo boxes and amber activations, whatever its class', () => {
    const identities = ['Tramite', 'Estado', 'GestorCambioEstado'].map((classifierName) =>
      resolveParticipantVisualIdentity({ id: classifierName, kind: 'object', name: '', classifierName }, { theme: indigoLightTheme }),
    );
    identities.forEach((identity) => {
      expect(identity.headerBorder).toBe(indigoLightTheme.participants?.headerBorder);
      expect(identity.activationBorder).toBe(indigoLightTheme.participants?.activationBorder);
    });
    const disabled = resolveParticipantVisualIdentity({ id: 't', kind: 'object', name: '', classifierName: 'Tramite' }, { theme: indigoLightTheme, enabled: false });
    expect(disabled.familyId).toBe('neutral');
  });

  it('gives every project card the same tone in Tinta y ámbar, with no amber', () => {
    [indigoLightTheme, indigoDarkTheme].forEach((theme) => {
      expect(new Set(theme.ui.projectTones).size, theme.id).toBe(1);
    });
  });

  it('keeps participant text readable on Tinta y ámbar boxes', () => {
    [indigoLightTheme, indigoDarkTheme].forEach((theme) => {
      expect(contrast(theme.sequence.text, theme.participants!.headerFill), theme.id).toBeGreaterThan(7);
    });
  });

  it('draws Tinta y ámbar notes on the amber note paper with readable text, in both appearances', () => {
    [indigoLightTheme, indigoDarkTheme].forEach((theme) => {
      (Object.keys(SEQUENCE_NOTE_COLORS) as Array<keyof typeof SEQUENCE_NOTE_COLORS>).forEach((color) => {
        const scheme = resolveSequenceNoteScheme(theme, color);
        expect(contrast(scheme.text, scheme.background), `${theme.id} ${color}`).toBeGreaterThan(7);
      });
    });
    expect(resolveSequenceNoteScheme(academicLightTheme, 'red')).toBe(SEQUENCE_NOTE_COLORS.red);
  });

  it('darkens participant families so light text stays legible on their headers', () => {
    SEQUENCE_PARTICIPANT_PALETTE.forEach((family) => {
      const dark = toDarkParticipantFamily(family, academicDarkTheme.sequence.canvasBackground);
      expect(contrast(academicDarkTheme.sequence.text, dark.headerFill)).toBeGreaterThan(7);
    });
  });
});
