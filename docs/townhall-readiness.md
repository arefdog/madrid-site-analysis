# Boalo estate — Plan Parcial readiness assessment

*Working document. Status flags: ✅ verified (source cited) · ⚠️ unverified working assumption — replace before any submission.*
*Scorecard flags: 🟢 in hand / low risk · 🟡 partial or assumed · 🔴 unresolved / blocking.*

---

## 0. Plan Parcial readiness scorecard

Each row is an item from the generic "things to consider before designing a Plan Parcial" checklist, scored against what the toolchain currently knows about the Boalo parcel (RC `1683501VL2018S`, 70,484 m²). This is the one-page state of play — the sections below give the detail.

### Gate (nothing else matters until this is green)

| # | Item | Status | What we know | Next action |
|---|------|--------|--------------|-------------|
| 0.1 | **Is a Plan Parcial the right instrument?** | 🟡 | The live **SIU constraint check returned `SUELO URBANIZABLE DELIMITADO/SECTORIZADO` at 10/10 sample points** — which *would* make a Plan Parcial the correct tool. But sampled on the hand-drawn footprint (Catastro was offline), not the exact cadastral parcel. | Click the **exact parcel** on SIU + sedecatastro; pull the **cédula urbanística** from the Ayuntamiento. |
| 0.2 | **Sector already delimited (vs needing Plan de Sectorización)?** | 🔴 | No urbanizable *sector* matching a 70,484 m² program is identified in public NNSS records. "Delimitado" per SIU implies a sector exists — reconcile with the NNSS ficha. | Find the sector number + ficha in the NNSS El Boalo-Cerceda-Mataelpino. |
| 0.3 | **General plan (NNSS/PGOU) determinaciones** | 🔴 | NNSS 1997/98 in force, no PGOU. Global edificability, dominant use, max homes for this sector — unknown. | Read the sector ficha; those numbers replace the engine's working assumptions. |

### Site diligence (the map overlays)

| # | Item | Status | What we know | Next action |
|---|------|--------|--------------|-------------|
| 1.1 | Ownership & cadastre | 🟢 | Single parcel, RC confirmed; Catastro geometry via INSPIRE. | Nota simple for charges/owners. |
| 1.2 | Protected overlays (Red Natura, ENP/PRCAM, montes preservados, vías pecuarias, HIC) | 🟡 | **Montes preservados WFS returned *no overlap*** (positive — the dehesa may *not* be protected forest); ZFP/DPH view active. ENP/PRCAM + Red Natura services were down in-browser, so **not cross-checked**. Prior research still flags likely PRCAM. | Run the **bake-constraints** workflow (server-side, no CORS) to settle PRCAM/Red Natura/vías pecuarias definitively. |
| 1.3 | Hydrology / flood (SNCZI ZFP) | 🟢 | Red hidrográfica: **no cauce within ±200 m** of sample points; ZFP layer available. | Confirm no arroyo on the exact parcel edges. |
| 1.4 | Topography & grades | 🟢 | Baked IGN LiDAR MDT05 (5 m); engine holds **road ≤10% / streets ≤16%** and passes. | Field topographic survey for final planos. |
| 1.5 | Heritage (BIC, carta arqueológica) | 🔴 | Torre del Parro on the horizon; not checked against the CM archaeological charter. | Query CM Patrimonio / carta arqueológica for the parcel. |
| 1.6 | Infrastructure hook-ups (water/sewer/power/road) | 🔴 | Access off Calle Berrocal assumed; connection points & capacity unknown. | Utility capacity letters; enganche points from the Ayuntamiento. |
| 1.7 | Servidumbres (carreteras, AT líneas, gas) | 🟡 | 25 m perimeter buffer modelled; no CM-road *línea de edificación* or AT line checked. | Confirm nearest CM road class + any overhead lines. |

### Plan content & standards (what the engine already produces)

| # | Item | Status | What we know | Next action |
|---|------|--------|--------------|-------------|
| 2.1 | Ordenación pormenorizada (zoning, alignments, edificability) | 🟢 (draft) | Program-driven pixel plan: typed lots, road, cessions — exportable GeoJSON / **DXF ETRS89-UTM30** / CSV. | Consultant redraws against the verified ficha. |
| 2.2 | **VPP reserve ≥ 40%** (Ley 12/2023 floor) | 🔴 | Engine reads **34% achieved vs 40% required** — currently **non-compliant**. | Grow VPP block or trim market residences (test live via *Editar programa*). |
| 2.3 | Green / espacios libres ≥ 15 m²/100 m² | 🟢 | Ledger check passes. | — |
| 2.4 | Parking ≥ 1.5 plazas/100 m² | 🟢 | Ledger check passes (basement + surface). | — |
| 2.5 | Redes locales ~30 m²/100 m², equipamientos | 🟡 | Redes-locales standard wired; **equipamiento parcels not yet modelled**. | Add equipment cessions to the program brief. |
| 2.6 | Open land ≥ 75% (dehesa) | 🟢 | Ledger check passes (~78%). | — |
| 2.7 | Red viaria (hierarchy, sections, accessibility) | 🟡 | Grades + widths modelled; formal *Orden VIV/561/2010* sections not detailed. | Engineering cross-sections. |
| 2.8 | Plan de etapas / phasing | 🟢 (draft) | P1/P2/P3 phase views on the card. | Tie phases to entitlement milestones. |
| 2.9 | Estudio económico-financiero + cargas de urbanización | 🔴 | Not modelled (no pro forma yet). | Line-item urbanización cost (CAM cuadro de precios). |
| 2.10 | Sistema de actuación (compensación/cooperación) | 🟢 | Single owner → compensación straightforward. | Confirm in convenio with Ayuntamiento. |

### Process & approval

| # | Item | Status | Next action |
|---|------|--------|-------------|
| 3.1 | Evaluación Ambiental Estratégica | 🔴 | Scope with CM Medio Ambiente early — PRCAM proximity makes it heavy. |
| 3.2 | Sectoral reports (CHT/agua, carreteras, patrimonio, telecom) | 🔴 | Identify required informes once the ficha is in hand. |
| 3.3 | Approval chain (inicial → info pública → provisional → **definitiva CM** → BOCM) | 🔴 | Budget **years**; stage land payments to milestones. |

**Headline:** the gate (0.1) swung from "likely SNU/protected" toward **URBANIZABLE** on the live SIU check — a materially better signal than the earlier assumption — **but it is not yet verified on the exact parcel**, and two hard items are red: **VPP is below the new 40% floor**, and **entitlement/EAE timeline risk** is unquantified. Verify 0.1 first; everything else is downstream of it.

---

## 1. The gating question: land classification

⚠️→🟡 **Provisional positive signal, unverified on the exact parcel.** The app's **Constraint-check (live)** layer, run in-browser, returned **`SUELO URBANIZABLE DELIMITADO O SECTORIZADO` at all 10 interior sample points** of the parcel footprint. This is the SIU (Ministerio de Vivienda) classification and, if it holds on the precise cadastral parcel, makes a **Plan Parcial the correct instrument**.

Caveats before acting on it:
- Sampled on the **hand-drawn footprint** (Catastro WFS was offline that session), which may sit slightly off the registered parcel.
- **ENP/PRCAM and Red Natura 2000 services were unavailable in-browser**, so protection overlays were *not* cross-checked in the same run — prior desk research still flags likely PRCAM coverage.
- "Delimitado/sectorizado" implies a **sector already exists** in the NNSS — which contradicts the earlier finding that no matching urbanizable sector appears in public records. This must be reconciled.

**Action (unchanged, now higher-value):** click the **exact parcel** on SIU + sedecatastro, and request a **cédula urbanística** from the Ayuntamiento. Run the **bake-constraints** GitHub workflow (server-side, no CORS) to get PRCAM / Red Natura / vías pecuarias verdicts the browser couldn't fetch.

**Consequences by scenario:**

| If the parcel is… | Instrument | Realistic path |
|---|---|---|
| Suelo urbanizable **delimitado/sectorizado** (SIU signal) | **Plan Parcial** (+ possibly Estudio de Detalle) | The current engine models this. Verify the sector ficha for real parameters. |
| Urbanizable **no sectorizado** | **Plan de Sectorización** first, then Plan Parcial | Longer path; sector must be delimited before design. |
| SNU común | **Calificación urbanística** (Ley 9/2001 art. 29) for rural-tourism / equestrian | Hotel + equestrian viable; villa subdivision is NOT. |
| SNU protegido (PRCAM A2/B1, vía pecuaria, forest) | Reclassification practically excluded | Landscape/agro estate only; rethink program. |

## 2. Regional-law parameters wired into the engine (`data/planning-config.json`)

✅ From **Ley 9/2001 del Suelo CM, art. 36** ([BOE consolidated text](https://www.boe.es/buscar/act.php?id=BOE-A-2001-18984)):
- Local networks standard: **30 m² suelo / 100 m² built** (redes locales), of which **green ≥ 15 m²/100 m²**.
- Parking: **1.5 spaces per 100 m² built** (1 space ≈ 25 m²).

✅ **VPP ≥ 40%** of residential edificability for **nueva urbanización** — the **Ley 12/2023 (por el derecho a la vivienda)** raised the state floor (art. 20.1.b TRLSRU) from 30% to 40% (20% in suelo urbano no consolidado). Every CCAA sits on top of that floor. The engine's VPP check now uses 40% and **currently reads non-compliant (34% achieved)** — a real, visible gap, not a rounding issue.

⚠️ Zone parameters (edificability m²/m², heights, min lot) remain **working assumptions** consistent with comparable NNSS sectors. Replace with the actual ficha values from the cédula.

## 3. What the map system now does toward submission

- **Constraint check (live):** SIU classification + PRCAM/Red Natura/vías pecuarias/hydrology, per-source verdict card, JSON export.
- **Protected-land carves:** ZFP/DPH and Montes preservados as map layers; vías pecuarias + HIC baked as carve sources (no dead toggles). Any protected polygon intersecting the parcel is excluded from the buildable footprint via `exclusions.protectionPolygons` — reliably baked server-side by the **bake-constraints** workflow (browser WFS is CORS-limited).
- **Cessions ledger:** live *cuadro de superficies*, edificability, and compliance checks (green ≥15/100, **VPP ≥40%**, parking, open-land ≥75%, road/street grades).
- **Phasing + road engineering + editable program:** phase filter, grade-coloured viario, and live *Editar programa* recalculation.
- **Exports:** GeoJSON, **DXF ETRS89/UTM 30N**, CSV — the technical annexes a consultant needs.
- **Terrain:** baked IGN PNOA-LiDAR MDT05 (5 m) via the `bake-terrain` CI workflow. Field survey still required for final planos.

## 4. Submission checklist (Plan Parcial scenario)

1. Cédula urbanística + NNSS **sector ficha** 🔴
2. Topographic survey (LiDAR + field check) 🟡
3. Memoria descriptiva y justificativa — area schedule auto-exported 🟢 (draft)
4. Planos: situación / estado actual / ordenación / alineaciones / infraestructuras — DXF base 🟢 (draft)
5. Cessions & **VPP ≥40%** compliance — ledger passes green/parking/open-land, **fails VPP** 🔴
6. Informe/EAE ambiental (PRCAM proximity makes this heavier) 🔴
7. Infrastructure/utilities viability report 🔴
8. Economic sustainability report + cargas de urbanización 🔴

## 5. Consulta previa one-pager (draft skeleton)

> **Asunto:** Consulta urbanística previa — finca «Boalo estate», RC 1683501VL2018S (70,484 m²), El Boalo.
> **Promotor:** BYLD.
> **Programa propuesto:** conjunto turístico-residencial de baja densidad: hotel lineal + spa, ~27 villas tipificadas, VPP compacta junto al núcleo (a redimensionar al ≥40% de edificabilidad residencial), centro ecuestre, ~75% de la finca como dehesa/verde.
> **Se solicita:** clasificación y calificación vigentes de la finca (contrastar señal SIU «urbanizable delimitado»), sector y ficha aplicables, zonificación PRCAM, instrumento de desarrollo procedente y criterios municipales.

---
*Generated by the BYLD Madrid Site Analysis toolchain. Update `data/planning-config.json` as parameters get verified; the map, checks and exports follow automatically.*
