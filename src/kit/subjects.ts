import { getPersonalSubject, PERSONAL_SUBJECT_ID } from "./avatar/personal-subject";

export interface SubjectDescriptor {
  id: string;
  label: string;
  url: string;
  origin: "livré" | "personnel";
  /** Un sujet verrouillé ne peut être ni supprimé ni refait. */
  locked: boolean;
}

export const DEFAULT_SUBJECT_ID = "male_body";

// Le corps versionné avec le dépôt. Il garantit que tout le monde compare ses
// rendus sur le même modèle.
const SHIPPED: SubjectDescriptor[] = [
  {
    id: "male_body",
    label: "male_body",
    url: "/models/male_body.glb",
    origin: "livré",
    locked: true,
  },
];

/**
 * Corps présents chez certains seulement : déposés dans `public/models/` mais
 * **non versionnés** — un scan de corps identifiable n'a pas sa place dans un
 * dépôt public.
 *
 * Ils sont proposés si le fichier répond, ignorés sinon. Les lister en dur
 * donnerait à quiconque clone un sujet qui échoue au chargement ; les retirer
 * complètement priverait ceux qui les ont d'un corps réel pour éprouver leurs
 * rendus.
 */
const OPTIONAL: SubjectDescriptor[] = [
  {
    id: "rubens",
    label: "Corps réel",
    url: "/models/Rubens_MyTwin.glb",
    origin: "livré",
    locked: true,
  },
];

/**
 * Vite sert `index.html` en repli pour tout chemin inconnu : un fichier absent
 * répond donc 200, mais en `text/html`. C'est le type de contenu qui tranche,
 * pas le code de statut.
 */
async function estPresent(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    if (!response.ok) return false;

    return !(response.headers.get("content-type") ?? "").includes("text/html");
  } catch {
    return false;
  }
}

/**
 * Une URL d'objet par avatar, pas par appel. `listSubjects` est appelée à chaque
 * montage d'écran : en créer une à chaque fois épinglerait autant de fois les
 * ~60 Mo de l'avatar en mémoire, sans jamais les relâcher.
 */
let dateDeLUrl = 0;
let derniereUrl = "";

function urlDuSujetPersonnel(personnel: { glb: Blob; createdAt: number }): string {
  // La clé est la date de création de l'enregistrement, jamais l'identité du
  // Blob : IndexedDB en désérialise un nouveau à chaque lecture, donc un cache
  // par identité ne toucherait jamais et fuirait une URL par appel.
  if (personnel.createdAt === dateDeLUrl && derniereUrl) return derniereUrl;

  if (derniereUrl) URL.revokeObjectURL(derniereUrl);
  dateDeLUrl = personnel.createdAt;
  derniereUrl = URL.createObjectURL(personnel.glb);

  return derniereUrl;
}

function oublierSujetPersonnel(): void {
  if (!derniereUrl) return;

  URL.revokeObjectURL(derniereUrl);
  derniereUrl = "";
  dateDeLUrl = 0;
}

/**
 * Les sujets disponibles, dans l'ordre : ceux versionnés avec le dépôt, ceux
 * simplement posés sur la machine, puis celui que le contributeur a généré
 * depuis sa photo. Il vient en dernier parce qu'il n'existe pas toujours, et
 * qu'un ordre qui bouge selon la présence d'un fichier serait déroutant.
 */
export async function listSubjects(): Promise<SubjectDescriptor[]> {
  const presents = await Promise.all(
    OPTIONAL.map(async (subject) => ((await estPresent(subject.url)) ? subject : null)),
  );

  const personnel = await getPersonalSubject();
  // Plus d'avatar : on relâche l'URL qui l'épinglait. Supprimer sert
  // précisément à récupérer de la place.
  if (!personnel) oublierSujetPersonnel();

  const sien: SubjectDescriptor[] = personnel
    ? [
        {
          id: PERSONAL_SUBJECT_ID,
          label: "Le vôtre",
          url: urlDuSujetPersonnel(personnel),
          origin: "personnel",
          locked: false,
        },
      ]
    : [];

  return [...SHIPPED, ...presents.filter((subject) => subject !== null), ...sien];
}
