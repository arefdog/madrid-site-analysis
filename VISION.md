# Vision — a due-diligence engine for land

**One line:** click any parcel → get an objective, sourced read of what you can legally build there, what could go on it, and whether it pencils — assembled automatically from public cadastral, planning, and market records.

---

## Who it's for
**Real-estate developers** screening and masterplanning land. Today they answer *"what can I do with this plot?"* by paying consultants weeks of work per site, or by guessing. This tool compresses that into a click.

## What makes it different
Most property maps are **read-only** — they show zoning layers and stop. This one **synthesizes and designs**:

1. **Synthesis, not toggles.** It fuses live official sources (Catastro, NNSS/planeamiento, PRCAM, Red Natura, flood, income, tourism) into a single **buildability verdict**, not a pile of overlays.
2. **It designs.** A generative masterplanning engine subdivides a real parcel, routes roads along terrain, allocates a program against the rights, and exports GeoJSON/DXF/CSV. This is the crown jewel — almost no competitor has it.
3. **Honest by design.** Every figure carries a confidence flag (`Verified` / `Medium` / `Weak` / `Pending`); gaps are shown, not hidden. That is what makes it trustworthy enough to underwrite on.

## Product architecture — two layers
- **Public dossier** (neutral, objective) — what the public records say about the parcel. Works for *any* parcel, any user. Contains zero private/scheme intel. See `docs/samples/` for the reference format.
- **Private overlay** (per-developer) — a specific scheme, program, and pro-forma laid on top. Where the deal-specific value lives.

Keeping these strictly separate is what lets the tool scale from one company's internal instrument to a product anyone can use.

## The moat
**Sourcing development rights.** The hard, valuable part isn't the map — it's turning messy, often un-digitized planning documents (e.g. a municipal NNSS sector *ficha*) into structured, **verified** buildability parameters, region by region. Whoever assembles that data layer owns the category.

## The path
1. **Perfect Madrid first** — nail the click → possibilities verdict on real parcels. *(In flight: one sector-ficha coefficient from a complete first verdict.)*
2. **Abstract the data providers** — put Spain-specific sources behind a provider interface so a new region = one new provider, not a rewrite.
3. **Generalize** — any parcel, anywhere, with a graceful fallback where official data is thin (OSM / Overture / Copernicus / global DEM).
4. **Productize** — accounts, saved projects, shareable PDF dossiers, feasibility/pro-forma, portfolio pipeline, change/alert monitoring.

## Where revenue comes from
The **shareable, sourced dossier** is the artifact that justifies a subscription — the thing a developer sends to an investor or landowner to de-risk a deal. Recurring value comes from **monitoring** (new parcels on market, zoning changes) and **portfolio screening** across many sites.

---

**In a sentence:** the tool that tells a developer, for any plot on earth, *"here's what's possible, here's the proof, here's what it's worth"* — starting with the Madrid sierra and expanding once it's airtight.
