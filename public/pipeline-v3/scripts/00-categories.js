// Curated product category list — surfaced in the Pricelist Add/Edit modal
// (and any other UI that needs to constrain category choices).
//
// Placeholder list — pending the canonical list Hamzeh will provide. Update
// this array in place when he hands it over. Anything not in this list still
// renders as free-text in the modal (the input is a <datalist>, not a strict
// <select>) so existing SKU rows keep working until the migration runs.
window.PRODUCT_CATEGORIES = [
  // Gree GMV / VRF indoor units
  'GMV duct IU',
  'GMV cassette IU',
  'GMV wall-mounted IU',
  'GMV floor-standing IU',
  'GMV ceiling-suspended IU',
  // Gree GMV outdoor units
  'GMV ODU',
  // Light commercial split
  'Light commercial split',
  // Residential split
  'Residential split',
  // Free-match systems
  'Free-match ODU',
  'Free-match IU',
  // Controls & accessories
  'Controls & thermostats',
  'Accessories',
];
