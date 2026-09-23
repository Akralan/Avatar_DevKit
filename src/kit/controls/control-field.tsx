import type { Control } from "../types";

type Field<C> = Exclude<Control<C>, { kind: "group" }>;

interface ControlFieldProps<C> {
  control: Field<C>;
  /** Préfixe d'identifiant, unique par panneau : deux panneaux montés en même
   *  temps ne doivent pas se disputer l'association label/champ. */
  idPrefix: string;
  value: C[keyof C];
  onChange(value: unknown): void;
}

export function ControlField<C>({ control, idPrefix, value, onChange }: ControlFieldProps<C>) {
  const id = `${idPrefix}-${String(control.key)}`;

  return (
    <div className="control-field">
      <div className="control-head">
        <label htmlFor={id}>{control.label}</label>
        {/* La valeur courante : sans elle on règle à l'aveugle, et on ne peut
            pas reporter le chiffre validé dans defaultConfig. */}
        {control.kind === "slider" && <span className="control-value">{String(value)}</span>}
      </div>

      {control.kind === "slider" && (
        <input
          id={id}
          type="range"
          min={control.min}
          max={control.max}
          step={control.step}
          value={Number(value)}
          onChange={(event) => onChange(event.target.valueAsNumber)}
        />
      )}

      {control.kind === "color" && (
        <input
          id={id}
          type="color"
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      )}

      {control.kind === "toggle" && (
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
      )}

      {control.kind === "select" && (
        <select id={id} value={String(value)} onChange={(event) => onChange(event.target.value)}>
          {control.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
