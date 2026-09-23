import { useId, useState } from "react";

/** Le backend en accepte quatre au plus (`MAX_IMAGES`). */
const MAX_PHOTOS = 4;

interface PhotoStepProps {
  onChosen(photos: File[]): void;
}

/**
 * Choix des photos du corps. Plusieurs angles valent mieux qu'un seul : c'est
 * à partir d'eux que Meshy fabrique la silhouette.
 */
export function PhotoStep({ onChosen }: PhotoStepProps) {
  const id = useId();
  const [erreur, setErreur] = useState<string | null>(null);

  const choisir = (liste: FileList | null) => {
    const photos = Array.from(liste ?? []);
    if (!photos.length) return;

    if (photos.length > MAX_PHOTOS) {
      setErreur(`Quatre photos au maximum — ${photos.length} sélectionnées.`);
      return;
    }

    setErreur(null);
    onChosen(photos);
  };

  return (
    <div className="wizard-panel">
      <label htmlFor={id}>Vos photos</label>
      <p className="face-hint">
        Une photo de face suffit ; trois angles (face, profil, dos) donnent un bien
        meilleur corps. Quatre au maximum.
      </p>

      <input
        id={id}
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => choisir(event.target.files)}
      />

      {erreur && (
        <p role="alert" className="stage-error">
          {erreur}
        </p>
      )}
    </div>
  );
}
