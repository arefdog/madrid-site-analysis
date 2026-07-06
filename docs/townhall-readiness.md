# Boalo estate — town-hall readiness assessment

*Working document. Status flags: ✅ verified (source cited) · ⚠️ unverified working assumption — replace before any submission.*

## 1. The gating question: land classification

⚠️ **Unresolved.** The parcel's class under the **NNSS de El Boalo, Cerceda y Mataelpino** has not been verified. What is known:

- The NNSS classify the municipality into **urbano / urbanizable / no urbanizable protegido** (agricultural, forest, PRCAM, cattle-trail protections). Source: [Plan Parcial Sector 10C memoria (Comunidad de Madrid)](https://www.comunidad.madrid/transparencia/sites/default/files/regulation/documents/1_documento_urbanistico_memoria_s-10-c.pdf), [Ayuntamiento — normativa urbanística](https://elboalo-cerceda-mataelpino.org/normativa-urbanistica/).
- El Boalo lies inside the **Parque Regional de la Cuenca Alta del Manzanares (PRCAM)** — zonings **A2** (reserva natural educativa), **B1**, and peri-urban **P zones** where planning may order limited construction. Sources: [Ley 1/1985](https://www.boe.es/buscar/doc.php?id=BOE-A-1985-8242), [Ley 7/1991 (ampliación)](https://www.boe.es/buscar/doc.php?id=BOE-A-1991-13417), [PRCAM PRUG](https://www.comunidad.madrid/transparencia/sites/default/files/plan/document/601_821_mgr_cit_13710_prcam_prug_0.pdf).
- Catastro registers the holding as *urbana* (sites.json `land.landClass`), which is **not** the same thing as planning classification.

**Consequences by scenario:**

| If the parcel is… | Instrument | Realistic path |
|---|---|---|
| Suelo urbano / urbanizable (or PRCAM zone P ordered by planning) | **Plan Parcial** (+ possibly Estudio de Detalle) | Design → cessions → approval cycle. The current engine models this. |
| SNU común | **Calificación urbanística** (Ley 9/2001 art. 29) for rural-tourism / equestrian uses | Hotel + equestrian viable; villa subdivision is NOT. |
| SNU protegido (PRCAM A2/B1, vía pecuaria, forest) | Reclassification practically excluded | Landscape/agro estate only; rethink program. |

**Action:** request a **cédula urbanística** from the Ayuntamiento (formal, ~weeks) and read the parcel against the NNSS + PRCAM zoning maps (1:10,000, annexed to Ley 7/1991). This is the first conversation with the town hall — nothing else should be commissioned before it.

## 2. Regional-law parameters wired into the engine (`data/planning-config.json`)

✅ From **Ley 9/2001 del Suelo CM, art. 36** ([BOE consolidated text](https://www.boe.es/buscar/act.php?id=BOE-A-2001-18984)):
- Local networks standard: **30 m² of suelo per 100 m² built** (redes locales), of which **green ≥ 15 m²/100 m²**.
- **VPP ≥ 30%** of residential edificability in suelo urbanizable.
- Parking: **1.5 spaces per 100 m² built** (1 space ≈ 25 m² counted).
- Note the 2024 reform (Ley 7/2024) touched parts of Ley 9/2001 — re-check exact article numbers at submission time. [Comparison table](https://derecholocal.es/cuadro-comparativo/reforma-de-la-ley-9-2001-del-suelo-de-madrid-por-ley-7-2024).

⚠️ Zone parameters (edificability m²/m², heights, min lot 300 m²) are **working assumptions** consistent with comparable NNSS sectors (Sector 10C used 200–300 m² min lots). Replace with the actual ficha values from the cédula.

## 3. What the map system now does toward submission

- **Exclusion buffers:** 25 m perimeter strip (INFOMA fire self-protection + road setback) frozen out of development, rendered hatched; slots for vía pecuaria / arroyo / PRCAM polygons in the config once verified.
- **Cessions ledger:** live *cuadro de superficies* per zone + edificability + compliance checks (green ≥15/100, VPP ≥30%, parking ≥1.5/100) shown on-map.
- **Exports:** GeoJSON (GIS), **DXF in ETRS89/UTM 30N** (CAD, official CRS), CSV area schedule — the technical annexes a consultant needs.
- **Terrain:** baked heightmap pipeline (CI workflow `bake-terrain`); currently EU-DEM 25 m at 20×20; **TODO: swap sampler to IGN MDT02/05 LiDAR** for grading-quality contours.

## 4. Submission checklist (Plan Parcial scenario)

1. Cédula urbanística + NNSS ficha ⚠️
2. Topographic survey (LiDAR + field check) ⚠️
3. Memoria descriptiva y justificativa — area schedule auto-exported from the map ✅ (draft)
4. Planos: situación / estado actual / ordenación / alineaciones / infraestructuras — DXF export is the base ✅ (draft)
5. Cessions & VPP compliance — ledger ✅ (against assumed parameters ⚠️)
6. Informe ambiental (PRCAM proximity makes this heavier) ⚠️
7. Infrastructure/utilities viability report ⚠️
8. Economic sustainability report ⚠️

## 5. Consulta previa one-pager (draft skeleton)

> **Asunto:** Consulta urbanística previa — finca «Boalo estate», RC 1683501VL2018S (70,484 m²), El Boalo.
> **Promotor:** BYLD.
> **Programa propuesto:** conjunto turístico-residencial de baja densidad: hotel lineal (~1,500 m² huella), ~16 parcelas de villa (~420 m²), VPP compacta junto al núcleo, centro ecuestre, ≥65% de la finca como dehesa/verde.
> **Se solicita:** clasificación y calificación vigentes de la finca, zonificación PRCAM aplicable, instrumento de desarrollo procedente y criterios municipales.

---
*Generated by the BYLD Madrid Site Analysis toolchain. Update `data/planning-config.json` as parameters get verified; the map, checks and exports follow automatically.*
