# Winner corpus

Twelve winning Devpost submissions across three hackathons, read in full. Six come from a
single hackathon, which is what makes the placement differences readable.

## H0: Hack the Zero Stack (AWS Databases + Vercel)

| Project | Prize | Pitch | Thesis | Inversion |
|---|---|---|---|---|
| **Waylo** | First Place — Monetizable B2C | An AI that lives on your Mac and guides you through anything; a pulsing red dot shows where to click next | Four progressively cheaper detection layers — accessibility tree, OCR, dual YOLO, then Bedrock — so most steps resolve "in under 50ms at zero marginal cost" | Vision is the last resort, not the first tool |
| **Sammy** | First Place — Monetizable B2B | HIPAA blocks pooling patient data; predicts readmission risk with federated learning, running XGBoost inside the database | Aurora is "the secure core, not a passive store" — the trained model is stored as bytes inside the database, and "nothing ever leaves that private network boundary" | The model goes to the data, not the data to the model |
| **Sonar** | First Place — Million-scale Global | A live radar of what's happening around you — ephemeral, crowd-curated, conversational | "DynamoDB for speed, Aurora DSQL for record" — ephemeral geo-writes and durable state split by access pattern | The database is chosen by the access pattern, not the data model |
| **HYPE** | Best Technical Implementation | "Play money. Real database guarantees. Internet culture finally has a market." | Aurora DSQL as "the trust layer behind a live, auditable, proof-of-solvency market" | Play money, real settlement guarantees |
| **Relay** | Most Impactful | Standby access for the people who will need it | Aurora DSQL for multi-region active-active availability, strong consistency on irreversible actions, and optimistic concurrency on low-contention vaults | Continuity planning for *living* emergencies, not only death |
| **Kintwadi** | Best Design | One shared, permission-aware care record for families caring for an aging parent across cities and time zones | "The database is the thesis, not a default" — caregiving is relational, transactional and access-controlled | Authorization lives in the database, not the UI |

### The placement finding

Kintwadi's thesis is as strong as any in the table. It is buried inside "How we built it."
It won a $2,000 category prize.

Relay put "Which AWS Database — and why Aurora DSQL" at **section three**, ahead of "How we
built it." HYPE gave the argument two top-level headings, "Why Aurora DSQL Matters" and
"DSQL-Aware Engineering Decisions." Sonar renamed a default heading around it: "How we
built it — the data model is the product." All three won $10,000.

Same rubric, same panel, same class of argument. Different placement.

### Heading structure

HYPE won Best Technical Implementation with headings that restate the criteria:
Inspiration · What HYPE Does · Core Product Surfaces · How We Built It · Architecture ·
The Math: Proof of Solvency · Why Aurora DSQL Matters · DSQL-Aware Engineering Decisions ·
Monetization Model · Path to a $100M-Scale Opportunity · Impact · Challenges · What We
Learned · What Makes HYPE Original · What's Next.

Relay named its **track** in a heading: "Business model (Monetizable B2C)."

## Google Cloud Rapid Agent Hackathon

| Project | Prize | Pitch | Inversion |
|---|---|---|---|
| **Cassandra** | First Place — Arize | "AI agents fail silently, confidently wrong, and nobody notices. Cassandra is an AI that watches your AIs." | An AI supervisor for AIs |
| **CrisisRoute** | First Place — Elastic | "Right Patient, Right Hospital, Right Time" — multi-agent emergency hospital routing | Routing on clinical capability, not geographic proximity |
| **Karma** | Second Place — Dynatrace | Learns a deprecated service's hidden contracts and haunts its replacement | "Tests check the contract you wrote down. Karma checks the contract you forgot you had." |

## Amazon Nova AI Hackathon

| Project | Prize | Pitch | Inversion |
|---|---|---|---|
| **BackstageCommercials** | First Prize Overall | AI-integrated ads seamlessly embedded into the background | Product placement instead of interruption |
| **Title AI** | Best of UI Automation | Autonomously searches any US county recorder website and produces a complete title commitment report | "County recorder websites are the last mile of real estate data, and the only way through is a browser controlled by an AI that can reason about unfamiliar interfaces." |
| **Project Memoria** | Best of Multimodal Understanding | Helps dementia patients recall conversations and find lost objects | Retrieval quality beats model capability |

## What generalises

**Every winner in H0 has a technology thesis.** Six of six — the other two hackathons in
this corpus don't record a Thesis column, so this claim is scoped to H0. Not "we used X" but
a reason a competitor using something else could not claim.

**Nearly every winner can be stated as an inversion.** See the tables — it is the form to
aim for, and most winners exhibit it, though not every row fits it cleanly (HYPE, Title AI).

**Everyone quantifies.** "$3.6 trillion real estate industry" (Title AI). "Path to a
$100M-Scale Opportunity" (HYPE). "Under 50ms at zero marginal cost" (Waylo). "74 RLS
policies across 33 tables" (Kintwadi).

**No winner is a thin wrapper.** In-database federated XGBoost. A dual-database
access-pattern split. An optimistic-concurrency ledger with a public solvency proof. A
four-layer detection cascade. Multi-agent contract inference over live telemetry.

**A no-account demo is a strong lever, not a gate.** Only Kintwadi, Sammy and CrisisRoute
advertise one. Project Memoria and BackstageCommercials shipped **no live demo at all** —
GitHub only — and still won. Combined with the common rule that "judges are not required to
test the Project and may choose to judge based solely on the text description, images, and
video," the written submission carries more weight than the demo.

**Challenges sections are specific and technical.** "A stray `{service_id}` in a prompt
raised a `KeyError`" (Karma). "Coordinate system mismatches across macOS" (Waylo).
"Couldn't use raw MIMIC-IV in a public demo" (Sammy). Nobody writes "time management was
hard."
