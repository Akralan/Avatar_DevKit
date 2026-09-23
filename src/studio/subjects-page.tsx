import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { deletePersonalSubject, PERSONAL_SUBJECT_ID } from "../kit/avatar/personal-subject";
import { listRenderModules } from "../kit/registry";
import { getSubjectThumbnail, warmSubjectThumbnails } from "../kit/subject-thumbnails";
import { listSubjects, type SubjectDescriptor } from "../kit/subjects";

export function SubjectsPage() {
  const [subjects, setSubjects] = useState<SubjectDescriptor[]>([]);
  const [apercus, setApercus] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState(false);
  const [premierRendu] = listRenderModules();

  const charger = useCallback(async () => {
    const liste = await listSubjects();
    setSubjects(liste);

    // Les aperçus manquants se rendent une fois, puis vivent en cache.
    await warmSubjectThumbnails();

    const entrees = await Promise.all(
      liste.map(async (subject) => [subject.id, await getSubjectThumbnail(subject.id)] as const),
    );

    setApercus(
      Object.fromEntries(entrees.filter((entree): entree is [string, string] => !!entree[1])),
    );
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const supprimer = async () => {
    await deletePersonalSubject();
    setConfirmation(false);
    await charger();
  };

  const aUnSujetPersonnel = subjects.some((subject) => subject.id === PERSONAL_SUBJECT_ID);

  return (
    <section className="subjects">
      <header className="gallery-head">
        <h1>Sujets</h1>
        <p>
          Un sujet est un corps entier avec son visage. Le corps versionné avec le dépôt
          garantit que tout le monde compare ses rendus sur le même modèle ; les corps
          déposés en local s'ajoutent à la liste.
        </p>
      </header>

      <ul className="subjects-grid">
        {subjects.map((subject) => (
          <li key={subject.id} className="subject-slot">
            <div className="subject-preview">
              {apercus[subject.id] ? (
                <img src={apercus[subject.id]} alt={`Aperçu du sujet ${subject.label}`} />
              ) : (
                <span className="tile-pending">aperçu en cours…</span>
              )}
              {subject.locked && <span className="subject-lock">livré</span>}
            </div>

            <div className="subject-body">
              <strong>{subject.label}</strong>
              <span className="subject-origin">
                {subject.origin === "livré"
                  ? "Fourni avec le dépôt"
                  : "Généré sur cet appareil"}
              </span>

              <div className="subject-actions">
                {premierRendu && (
                  <Link
                    className="subject-open"
                    to={`/render/${premierRendu.id}?s=${subject.id}`}
                  >
                    Ouvrir un atelier
                  </Link>
                )}

                {/* Un corps livré ne s'efface pas : il appartient au dépôt, pas
                    à celui qui l'utilise. */}
                {!subject.locked && (
                  <>
                    <Link className="subject-open" to="/sujets/nouveau">
                      Refaire
                    </Link>
                    <button type="button" onClick={() => setConfirmation(true)}>
                      Supprimer
                    </button>
                  </>
                )}
              </div>
            </div>
          </li>
        ))}

        {!aUnSujetPersonnel && (
          <li className="subject-slot subject-slot-pending">
            <div className="subject-preview">
              <span className="subject-plus">+</span>
            </div>
            <div className="subject-body">
              <strong>Le vôtre</strong>
              <span className="subject-origin">
                Votre corps, depuis une photo. Un seul, sur cet appareil.
              </span>
              <div className="subject-actions">
                <Link className="subject-open" to="/sujets/nouveau">
                  Générer
                </Link>
              </div>
            </div>
          </li>
        )}
      </ul>

      {confirmation && (
        <div className="confirm-backdrop">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Supprimer votre avatar"
            className="confirm"
          >
            <p>
              Supprimer votre avatar est <strong>définitif</strong>. Le refaire demande une
              nouvelle séance photo et environ une minute de calcul.
            </p>
            <div className="confirm-actions">
              <button type="button" onClick={() => setConfirmation(false)}>
                Annuler
              </button>
              <button type="button" className="is-danger" onClick={() => void supprimer()}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
