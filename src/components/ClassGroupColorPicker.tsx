import type { CSSProperties } from 'react';
import { Check, Slash } from 'lucide-react';
import { CLASS_GROUP_COLORS, type ClassGroupColor } from '../constants/classGroupColors';

type Props = {
  value: ClassGroupColor | undefined | 'mixed';
  count: number;
  onChange: (color: ClassGroupColor | undefined) => void;
};

export function ClassGroupColorPicker({ value, count, onChange }: Props) {
  return (
    <div className="class-color-picker" role="group" aria-label="Color de grupo">
      <div className="class-color-picker-heading">
        <span>Color de grupo</span>
        {count > 1 ? <span className="class-color-count">{count} clases</span> : null}
      </div>
      <div className="class-color-swatches">
        <button className="class-color-swatch" type="button" aria-label="Sin color" title="Sin color"
          aria-pressed={value === undefined} onClick={() => onChange(undefined)}>
          <span className="class-color-none"><Slash size={13} aria-hidden="true" /></span>
        </button>
        {CLASS_GROUP_COLORS.map(color => (
          <button className="class-color-swatch" key={color.id} type="button" aria-label={`Color ${color.label.toLowerCase()}`}
            title={color.label} aria-pressed={value === color.id} onClick={() => onChange(color.id)}
            style={{ '--group-swatch': color.swatch } as CSSProperties}>
            <span data-swatch="">
              {value === color.id ? <Check size={13} strokeWidth={2.5} aria-hidden="true" /> : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
