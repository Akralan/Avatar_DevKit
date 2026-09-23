import { useState } from "react";
import { Link } from "react-router";
import { ControlsPanel } from "../kit/controls/controls-panel";
import { SubjectPicker } from "./subject-picker";
import type { SubjectDescriptor } from "../kit/subjects";
import type { RenderModule } from "../kit/types";

interface WorkshopOverlayProps<C extends object> {
  module: RenderModule<C>;
  subjects: SubjectDescriptor[];
  subjectId: string;
  config: C;
  onChange(next: C): void;
  onReset(): void;
  onSubjectChange(id: string): void;
  onAction(actionId: string): void;
}

/**
 * Tout tient dans un seul panneau flottant : le canvas garde la totalité de la
 * surface derrière lui. Replier supprime l'interface entière — c'est le mode
 * « je regarde mon rendu », et la raison d'être de ce layout.
 */
export function WorkshopOverlay<C extends object>({
  module,
  subjects,
  subjectId,
  config,
  onChange,
  onReset,
  onSubjectChange,
  onAction,
}: WorkshopOverlayProps<C>) {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <button type="button" className="overlay-reopen" onClick={() => setOpen(true)}>
        Réglages
      </button>
    );
  }

  const copyLink = () => {
    // La page maintient déjà l'URL en phase avec le réglage et le sujet : il
    // n'y a rien à reconstruire, l'adresse courante EST le lien partageable.
    void navigator.clipboard?.writeText(location.href);
  };

  const copyConfig = () => {
    // Prêt à coller dans `defaultConfig` une fois le réglage validé.
    void navigator.clipboard?.writeText(JSON.stringify(config, null, 2));
  };

  return (
    <aside className="overlay">
      <header className="overlay-head">
        <Link to="/" aria-label="Retour à la galerie">
          ←
        </Link>
        <span className="overlay-title">{module.title}</span>
        <button type="button" onClick={() => setOpen(false)}>
          Replier
        </button>
      </header>

      <SubjectPicker subjects={subjects} activeId={subjectId} onChange={onSubjectChange} />

      <ControlsPanel controls={module.controls} config={config} onChange={onChange} />

      <footer className="overlay-actions">
        {/* Les actions propres au module d'abord : « Rejouer » n'existe que
            pour les rendus qui ont une chronologie. */}
        {module.actions?.map((action) => (
          <button key={action.id} type="button" onClick={() => onAction(action.id)}>
            {action.label}
          </button>
        ))}
        <button type="button" onClick={onReset}>
          Défauts
        </button>
        <button type="button" onClick={copyLink}>
          Copier le lien
        </button>
        <button type="button" onClick={copyConfig}>
          Copier la config
        </button>
      </footer>
    </aside>
  );
}
