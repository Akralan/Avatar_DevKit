import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { graft } from "../../kit/avatar/api";
import { savePersonalSubject } from "../../kit/avatar/personal-subject";
import { capturePoster } from "../../kit/avatar/poster";
import { FaceStep } from "./face-step";
import { PhotoStep } from "./photo-step";
import { useBodyTask } from "./use-body-task";

type Etape = "photo" | "visage" | "greffe" | "range";

const ETAPES: { cle: Etape; titre: string; detail: string }[] = [
  { cle: "photo", titre: "Photo", detail: "le corps, détouré côté backend" },
  { cle: "visage", titre: "Visage", detail: "capture locale, rien n'est envoyé" },
  { cle: "greffe", titre: "Greffe", detail: "environ une minute de calcul" },
  { cle: "range", titre: "Sujet", detail: "rangé sur cet appareil" },
];

/**
 * Parcours photo → avatar.
 *
 * Le corps se génère **pendant** la capture du visage : les deux attentes ne
 * s'additionnent pas, et c'est ce qui rend le parcours supportable.
 */
export function WizardPage() {
  const navigate = useNavigate();
  const corps = useBodyTask();

  const [etape, setEtape] = useState<Etape>("photo");
  const [masque, setMasque] = useState<Blob | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [modeTest, setModeTest] = useState(false);

  // La greffe ne part qu'une fois. Sans ce garde, passer l'étape à « greffe »
  // relancerait l'effet qui en dépend, et sa propre annulation tuerait le
  // travail en vol.
  const greffeLancee = useRef(false);

  // La greffe ne part que lorsque les deux moitiés existent. L'ordre d'arrivée
  // n'a pas d'importance : c'est le point de rendez-vous.
  useEffect(() => {
    if (!masque || !corps.ready || !corps.taskId || greffeLancee.current) return;

    greffeLancee.current = true;
    let annule = false;
    setEtape("greffe");

    const greffer = async () => {
      try {
        const avatar = await graft(corps.taskId!, masque, modeTest ? { localFace: true } : {});
        if (annule) return;

        // Le poster est décoratif : son échec ne doit jamais empêcher de ranger
        // un corps qu'on vient d'attendre une minute.
        const poster = await capturePoster(avatar).catch(() => null);
        await savePersonalSubject(avatar, poster);
        if (annule) return;

        setEtape("range");
        navigate("/sujets");
      } catch (cause) {
        if (annule) return;
        setErreur(cause instanceof Error ? cause.message : String(cause));
      }
    };

    void greffer();

    return () => {
      annule = true;
    };
  }, [masque, corps.ready, corps.taskId, modeTest, navigate]);

  const messageErreur = erreur ?? corps.error;

  return (
    <section className="wizard">
      <header className="gallery-head">
        <h1>Générer votre corps</h1>
        <p>
          Tout se passe sur votre appareil, sauf la génération du corps et la greffe.
          L'avatar obtenu n'en sort jamais.
        </p>
      </header>

      <ol className="wizard-steps">
        {ETAPES.map((cellule) => (
          <li
            key={cellule.cle}
            className={cellule.cle === etape ? "is-current" : undefined}
            aria-current={cellule.cle === etape ? "step" : undefined}
          >
            <strong>{cellule.titre}</strong>
            <span>{cellule.detail}</span>
          </li>
        ))}
      </ol>

      {messageErreur && (
        <p role="alert" className="stage-error">
          {messageErreur}
        </p>
      )}

      {etape === "photo" && (
        <>
          <PhotoStep
            onChosen={(photos) => {
              corps.start(photos, modeTest ? { localBody: true } : {});
              setEtape("visage");
            }}
          />
          <label className="wizard-test">
            <input
              type="checkbox"
              checked={modeTest}
              onChange={(event) => setModeTest(event.target.checked)}
            />
            Mode test — n'appelle pas Meshy et ne consomme aucun crédit
          </label>
        </>
      )}

      {etape === "visage" && (
        <div className="wizard-panel">
          <FaceStep onCaptured={setMasque} localFace={modeTest} />

          <div className="wizard-progress">
            <div className="wizard-progress-head">
              <span>Génération du corps</span>
              <strong>{corps.ready ? "prêt" : `${corps.progress} %`}</strong>
            </div>
            <div className="wizard-bar">
              <i style={{ width: `${corps.ready ? 100 : corps.progress}%` }} />
            </div>
            {corps.hint && <p className="face-hint">{corps.hint}</p>}
          </div>
        </div>
      )}

      {etape === "greffe" && (
        <div className="wizard-panel">
          <p className="face-hint">
            Greffe en cours — environ une minute. Ne fermez pas cet onglet.
          </p>
        </div>
      )}

      <Link to="/sujets" className="subject-open">
        Revenir aux sujets
      </Link>
    </section>
  );
}
