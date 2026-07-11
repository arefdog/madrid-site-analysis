// The buildability scoring "brain" — the product's core logic.
//
// Turns a parcel's typed planning *signals* into the three headline verdicts
// (buildability, entitlement risk, hard overrides). Deliberately pure: no DOM,
// no I/O, no framework — so it is unit-testable and region-agnostic. When the
// provider abstraction lands, every region feeds the same signal shape and this
// scoring stays unchanged.

export const LEVEL = { GO: 'go', CAUTION: 'caution', NOGO: 'nogo', PENDING: 'pending' };

/**
 * @param {object} signals
 * @param {'urbano'|'urbanizable-sector'|'rustico'|'protected'|undefined} signals.landClass
 * @param {boolean|null} [signals.instrumentApproved] plan parcial approved for this parcel?
 * @param {'advancing'|'contested'|'blocked'|undefined} [signals.entitlementTrend]
 * @param {number} [signals.overridesConfirmed]
 * @param {number} [signals.overridesOpen]
 * @returns {{buildability:object, entitlement:object, overrides:object}}
 */
export function computeVerdict(signals = {}) {
  return {
    buildability: buildabilityVerdict(signals),
    entitlement: entitlementVerdict(signals),
    overrides: overridesVerdict(signals),
  };
}

function buildabilityVerdict(s) {
  switch (s.landClass) {
    case 'urbano':
      return v(LEVEL.GO, 'Buildable', 'Consolidated urban land — directly developable, subject to ordinance.');
    case 'urbanizable-sector':
      return v(LEVEL.CAUTION, 'Caution',
        s.instrumentApproved
          ? 'Urbanizable sector with an approved development instrument.'
          : 'Nominally urbanizable, but no approved plan parcial confirmed for this parcel.');
    case 'rustico':
      return v(LEVEL.NOGO, 'Restricted', 'Rústic / non-urbanizable — building precluded barring special authorisation.');
    case 'protected':
      return v(LEVEL.NOGO, 'Protected', 'Protected land — urbanization precluded.');
    default:
      return v(LEVEL.PENDING, 'Unresolved', 'Classification not yet resolved for this parcel.');
  }
}

function entitlementVerdict(s) {
  switch (s.entitlementTrend) {
    case 'advancing':
      return v(LEVEL.CAUTION, 'Moderate', 'Sector instruments are advancing through approval.');
    case 'contested':
      return v(LEVEL.NOGO, 'High · two-sided', 'Region pushing zero-growth / declassification; yet nearby sectors advance.');
    case 'blocked':
      return v(LEVEL.NOGO, 'High', 'Active declassification or moratorium pressure.');
    default:
      return v(LEVEL.PENDING, 'Unknown', 'Entitlement trend not assessed.');
  }
}

function overridesVerdict(s) {
  const confirmed = s.overridesConfirmed ?? 0;
  const open = s.overridesOpen ?? 0;
  if (confirmed === 0 && open === 0) {
    return v(LEVEL.GO, 'None found', 'No hard overrides identified for this parcel.');
  }
  const level = confirmed > 0 ? LEVEL.CAUTION : LEVEL.PENDING;
  const label = `${confirmed} confirmed · ${open} open`;
  const note = open
    ? 'Some overlay queries still pending for this parcel.'
    : 'Confirmed overrides constrain the buildable area.';
  return v(level, label, note);
}

function v(level, label, note) { return { level, label, note }; }
