# El Boalo — verified ordinance parameters (parsed from source PDFs)

Values here are **read directly from official PDFs** (not search summaries). Each block names its exact source and its applicability to the `boalo-estate` parcel.

---

## Source A — Plan Parcial **Sector 10C**, Normas Urbanísticas (comunidad.madrid, Enero 2022)

**File:** `2_documento_urbanistico_nnuu_s-10-c.pdf` (52 pp) · [portal copy](https://www.comunidad.madrid/transparencia/sites/default/files/regulation/documents/2_documento_urbanistico_nnuu_s-10-c.pdf)
**Status:** VERIFIED-from-document.
**⚠️ Applicability:** Sector 10C is a **suelo urbanizable of use "AP · Actividades Productivas" (business park) in Cerceda** — zones AP / ELP / ESpacio libre privado / ZV-CE (zona verde corredor ecológico) / ET (espacios de transición) / IV (viario). **No residential use.** This is why it showed "IND" (not a dwelling count) in the sector inventory. → Use it as a **ficha-format template and for the structural rules that apply municipality-wide**, NOT as the coefficient for residential Sector 1B.

### Zone AP (Actividades Productivas) — Art. 27
| Parameter | Value |
|-----------|-------|
| Edificabilidad máxima | **1,25 m²/m²** (may rise to **1,40** on individual plots, not to exceed the sector total) |
| Total edificable del ámbito | **20,041 m²e** |
| Nº máximo plantas | **2 + aprovechamiento bajo cubierta** |
| Altura máxima edificación | **9,00 m** (cumbrera **12 m**) |
| Ocupación máxima | **70%** sobre rasante · **100%** bajo rasante (parking) |
| Superficie mínima de parcela | **1,000 m²** |
| Retranqueo mínimo a linderos | **3,00 m** (adosable a viario/ELP in defined cases) |

### Municipality-wide structural rules confirmed (apply to any El Boalo sector, incl. 1B)
- **10% del aprovechamiento lucrativo** ceded to the Ayuntamiento (monetizable) — Ley 9/2001 confirmed against a live ficha.
- Development by **Sistema de Compensación**; single owner ⇒ Junta may be replaced by **convenio de gestión** (relevant: the Boalo parcel is `parcelCount: 1`).
- **Banda de protección del PRCAM**: a sector abutting the park must cede an **ecological-corridor / PRCAM protection band** at the park edge, onto which affected trees are transplanted (Art. 24 med. 4). → Directly constrains the Boalo dehesa edge; feeds `exclusions.protectionPolygons`.
- Carreteras autonómicas (M-607/M-608 here; Boalo abuts M-608): **dominio público 3 m + protección 25 m** (Red Principal) — setback source for Boalo's road frontage.
- Saneamiento **separativo**; CHT (Confederación Hidrográfica del Tajo) informe required for any watercourse.

---

## Still needed for the residential verdict on Sector 1B

The 10C doc does **not** carry residential coefficients. To finish the parcel verdict, the next document must be one of:
1. **NNSS Normas Urbanísticas — residential ordinance** (capítulos 4º/6º; the "residencial unifamiliar" grade, e.g. RU-3): gives edificabilidad m²/m², parcela mínima, altura, retranqueos for housing. Lives in the **full NNSS text** ([docplayer 68158277](https://docplayer.es/68158277-Normas-subsidiarias-de-el.html) · [doczz 3113213](https://doczz.es/doc/3113213/)).
2. **Ficha del Sector 1B** (in the NNSS "fichas de ámbitos/sectores"): superficie, aprovechamiento, nº viviendas (78 per inventory), usos permitidos (confirm whether **terciario/hotelero** is allowed — the make-or-break for the 44-key hotel), cesiones.
3. If it exists: a **Plan Parcial / Proyecto de Urbanización de la UE-1B** (approved 3 Aug 2023) — would confirm the sector is actually advancing and covers RC 1683501VL2018S.

**Dead link note:** `idem.madrid.org/.../El_Boalo/PlanesParciales/48406/MEMORIA.PDF` returns a comunidad.madrid 404 — do not rely on it. The ayuntamiento's [Normativa Urbanística page](https://elboalo-cerceda-mataelpino.org/normativa-urbanistica/) and the docplayer NNSS full text are the working routes.
