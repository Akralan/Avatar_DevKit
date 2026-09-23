import { useEffect, useState } from "react";
import { Link } from "react-router";
import { listRenderModules } from "../kit/registry";
import { getSubjectThumbnail, warmSubjectThumbnails } from "../kit/subject-thumbnails";
import { listSubjects, type SubjectDescriptor } from "../kit/subjects";

export function SubjectsPage() {
  const [subjects, setSubjects] = useState<SubjectDescriptor[]>([]);
  const [apercus, setApercus] = useState<Record<string, string>>({});
  const [premierRendu] = listRenderModules();

  useEffect(() => {
    let cancelled = false;

    const charger = async () => {
      const liste = await listSubjects();
      if (cancelled) return;
      setSubjects(liste);

      // Les aperçus manquants se rendent une fois, puis vivent en cache.
      await warmSubjectThumbnails();
      if (cancelled) return;

      const entrees = await Promise.all(
        liste.map(async (subject) => [subject.id, await getSubjectThumbnail(subject.id)] as const),
      );
      if (cancelled) return;

      setApercus(
        Object.fromEntries(entrees.filter((entree): entree is [string, string] => !!entree[1])),
      );
    };

    void charger();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="subjects">
      <header className="gallery-head">
        <h1>Sujets</h1>
        <p>
          Un sujet est un corps entier avec son visage. Le corps versionné avec
          le dépôt garantit que tout le monde compare ses rendus sur le même
          modèle ; les corps déposés en local s'ajoutent à la liste.
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
              {premierRendu && (
                <Link
                  className="subject-open"
                  to={`/render/${premierRendu.id}?s=${subject.id}`}
                >
                  Ouvrir un atelier
                </Link>
              )}
            </div>
          </li>
        ))}

        {/* Le troisième emplacement existe dans la maquette validée. Il est
            annoncé plutôt qu'absent — un emplacement manquant ferait croire à
            une panne — mais sans bouton mort : la génération arrive avec le
            pipeline avatar. */}
        <li className="subject-slot subject-slot-pending">
          <div className="subject-preview">
            <span className="subject-plus">+</span>
          </div>
          <div className="subject-body">
            <strong>Le vôtre</strong>
            <span className="subject-origin">
              Votre corps, généré depuis une photo. Un seul, sur cet appareil.
            </span>
            <span className="subject-soon">Arrive avec le pipeline avatar</span>
          </div>
        </li>
      </ul>
    </section>
  );
}
