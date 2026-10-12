import { Monitor, Moon, Sun } from 'lucide-react';
import type { ThemePreference } from '../hooks/useTheme';
import { PALETTES, type PaletteId } from '../theme/themes';
import { MenuItem, MenuLabel, MenuSeparator, ToolMenu } from './ui/Toolbar';
import { isMacPlatform } from '../utils/shortcutLabel';

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'system', label: 'Automático', icon: Monitor },
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
];

type ThemeToggleProps = {
  preference: ThemePreference;
  onChange: (preference: ThemePreference) => void;
  palette: PaletteId;
  onPaletteChange: (palette: PaletteId) => void;
  showLabel?: boolean;
};

/**
 * Apariencia: a menu like every other one, opening upwards from the sidebar
 * footer. It replaces a button that cycled automático → claro → oscuro on
 * each click, where the next state was a guess. Below the appearance it
 * switches the global palette picked in the welcome dialog.
 */
export function ThemeToggle({ preference, onChange, palette, onPaletteChange, showLabel = false }: ThemeToggleProps) {
  const current = OPTIONS.find((option) => option.value === preference) ?? OPTIONS[0];
  return (
    <ToolMenu
      align="start"
      className="theme-toggle"
      direction="up"
      icon={current.icon}
      label={showLabel ? current.label : `Apariencia: ${current.label}`}
      showLabel={showLabel}
      title={`Apariencia: ${current.label}`}
    >
      <MenuLabel>Apariencia</MenuLabel>
      {OPTIONS.map((option) => (
        <MenuItem key={option.value} checked={preference === option.value} onSelect={() => onChange(option.value)}>
          {option.label}
          {option.value === 'system' ? <span className="v2-menu-item-hint">{isMacPlatform() ? 'según macOS' : 'según el sistema'}</span> : null}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuLabel>Paleta</MenuLabel>
      {PALETTES.map((option) => (
        <MenuItem key={option.id} checked={palette === option.id} onSelect={() => onPaletteChange(option.id)}>
          {option.name}
          <span className="v2-menu-item-hint">{option.description}</span>
        </MenuItem>
      ))}
    </ToolMenu>
  );
}
