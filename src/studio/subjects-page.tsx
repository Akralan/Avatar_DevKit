import { useEffect, useState } from "react";
import { Link } from "react-router";
import { listRenderModules } from "../kit/registry";
import { listSubjects, type SubjectDescriptor } from "../kit/subjects";

export function SubjectsPage() {
  const [subjects, setSubjects] = useState<SubjectDescriptor[]>([]);
  const [premierRendu] = listRenderModules();

  useEffect(() => {
    let cancelled = false;
    void listSubjects().then((liste) => {
      if (!cancelled) setSubjects(liste);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="subjects">
      <header className="gallery-head">
        <h1>Sujets</h1>
        <p>
          Un sujet est un corps entier avec son visage. Les deux exemplaires livrés
          garantissent que tout le monde compare ses rendus sur le même corps.
        </p>
      </header>

      <ul className="subjects-grid">
        {subjects.map((subject) => (
          <li key={subject.id} className="subject-slot">
            <div className="subject-preview">
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
      </ul>
    </section>
  );
}
