import { useId } from "react";
import { ControlField } from "./control-field";
import type { Control } from "../types";

interface ControlsPanelProps<C extends object> {
  controls: Control<C>[];
  config: C;
  /** Reçoit la config **complète**, jamais un patch : le stage la repousse
   *  telle quelle au module, qui n'a rien à fusionner. */
  onChange(next: C): void;
}

export function ControlsPanel<C extends object>({
  controls,
  config,
  onChange,
}: ControlsPanelProps<C>) {
  const idPrefix = useId();

  const set = (key: keyof C, value: unknown) => onChange({ ...config, [key]: value } as C);

  const renderField = (control: Exclude<Control<C>, { kind: "group" }>, index: number) => (
    <ControlField
      key={`${String(control.key)}-${index}`}
      control={control}
      idPrefix={idPrefix}
      value={config[control.key]}
      onChange={(value) => set(control.key, value)}
    />
  );

  return (
    <div className="controls-panel">
      {controls.map((control, index) =>
        control.kind === "group" ? (
          <fieldset key={`${control.label}-${index}`} className="control-group">
            <legend>{control.label}</legend>
            {/* Un groupe dans un groupe est ignoré volontairement : deux
                niveaux suffisent à ranger un panneau, et la récursion inviterait
                à construire des arbres de réglages impilotables à l'œil. */}
            {control.children
              .filter((child) => child.kind !== "group")
              .map((child, childIndex) =>
                renderField(child as Exclude<Control<C>, { kind: "group" }>, childIndex),
              )}
          </fieldset>
        ) : (
          renderField(control, index)
        ),
      )}
    </div>
  );
}
