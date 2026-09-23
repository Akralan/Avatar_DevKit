import { useId } from "react";
import type { SubjectDescriptor } from "../kit/subjects";

interface SubjectPickerProps {
  subjects: SubjectDescriptor[];
  activeId: string;
  onChange(id: string): void;
}

/**
 * Le sujet reste visible en permanence dans le panneau : en changer sans
 * perdre son réglage en cours est le geste le plus fréquent de l'atelier.
 */
export function SubjectPicker({ subjects, activeId, onChange }: SubjectPickerProps) {
  const id = useId();

  return (
    <div className="subject-picker">
      <label htmlFor={id}>Sujet</label>
      <select id={id} value={activeId} onChange={(event) => onChange(event.target.value)}>
        {subjects.map((subject) => (
          <option key={subject.id} value={subject.id}>
            {subject.label}
          </option>
        ))}
      </select>
    </div>
  );
}
