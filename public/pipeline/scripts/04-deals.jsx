// Seed pipeline data — realistic HVAC tenders/projects in Jordan.
// Each deal has: id, name, account, value (JOD), stage, owner, probability,
// scope (HVAC system type), expectedClose (ISO), updatedAt, age (days in current stage)

const DEALS = [
  // Prospect
  { id: 'D-2026-0356', name: 'Princess Sumaya University — lab cooling refresh', account: 'Princess Sumaya University', value: 86500,  stage: 'prospect', owner: 'Rami Haddad', probability: 15, scope: 'Chillers + AHU', closeDate: '2026-08-15', age: 4 },
  { id: 'D-2026-0354', name: 'Abdali Mall — central plant assessment',           account: 'Abdali Mall',                  value: 142000, stage: 'prospect', owner: 'Hala Jaber', probability: 20, scope: 'Central plant', closeDate: '2026-09-30', age: 9 },
  { id: 'D-2026-0351', name: 'Aqaba Logistics — warehouse ventilation',          account: 'Aqaba Logistics City',         value: 64000,  stage: 'prospect', owner: 'Ahmad Marji', probability: 10, scope: 'Industrial vent.',  closeDate: '2026-10-12', age: 12 },
  { id: 'D-2026-0349', name: 'King Hussein Cancer — wing 4 retrofit',            account: 'King Hussein Cancer Foundation', value: 312000, stage: 'prospect', owner: 'Rami Haddad', probability: 25, scope: 'VRF + AHU',     closeDate: '2026-11-01', age: 18 },

  // Tender
  { id: 'D-2026-0341', name: 'Royal Jordanian HQ — chiller upgrade',             account: 'Royal Jordanian',              value: 248500, stage: 'tender',   owner: 'Hala Jaber', probability: 40, scope: 'Chillers',      closeDate: '2026-07-20', age: 12 },
  { id: 'D-2026-0339', name: 'Mecca Mall expansion — phase 2 MEP',               account: 'Mecca Mall',                   value: 522000, stage: 'tender',   owner: 'Sana Khalil', probability: 35, scope: 'Full MEP HVAC', closeDate: '2026-08-05', age: 21 },
  { id: 'D-2026-0335', name: 'Fairmont Amman — guest tower FCU replacement',     account: 'Fairmont Amman',               value: 178400, stage: 'tender',   owner: 'Ahmad Marji', probability: 45, scope: 'FCU',           closeDate: '2026-07-12', age: 8 },

  // Analysis
  { id: 'D-2026-0322', name: 'University of Jordan — lecture hall AC',           account: 'University of Jordan',         value: 95800,  stage: 'analysis', owner: 'Sana Khalil', probability: 55, scope: 'VRF',           closeDate: '2026-07-01', age: 14 },
  { id: 'D-2026-0319', name: 'Crowne Plaza Petra — lobby & spa rework',          account: 'Crowne Plaza Petra',           value: 134000, stage: 'analysis', owner: 'Layla Odeh',  probability: 50, scope: 'AHU + ducting', closeDate: '2026-06-28', age: 22 },
  { id: 'D-2026-0317', name: 'Jordan Petroleum Refinery — admin block',          account: 'Jordan Petroleum Refinery',    value: 287000, stage: 'analysis', owner: 'Rami Haddad', probability: 60, scope: 'Chillers + AHU', closeDate: '2026-07-30', age: 11 },
  { id: 'D-2026-0314', name: 'Bank al-Etihad — new HQ floors 4–8',               account: 'Bank al-Etihad',               value: 198500, stage: 'analysis', owner: 'Ahmad Marji', probability: 55, scope: 'VRF',           closeDate: '2026-08-10', age: 6 },

  // Negotiation
  { id: 'D-2026-0298', name: 'Marriott Amman — VRF retrofit, 8 floors',          account: 'Marriott Amman',               value: 412000, stage: 'negotiation', owner: 'Sana Khalil', probability: 75, scope: 'VRF',         closeDate: '2026-06-15', age: 28 },
  { id: 'D-2026-0294', name: 'Arab Bank Tower — chilled water loop',             account: 'Arab Bank',                    value: 356000, stage: 'negotiation', owner: 'Rami Haddad', probability: 70, scope: 'Chillers',    closeDate: '2026-06-22', age: 33 },
  { id: 'D-2026-0289', name: 'Le Meridien Amman — ballroom AHU',                 account: 'Le Meridien Amman',            value: 92500,  stage: 'negotiation', owner: 'Layla Odeh',  probability: 80, scope: 'AHU',         closeDate: '2026-06-08', age: 17 },

  // Closing
  { id: 'D-2026-0271', name: 'Zara Investment HQ — full HVAC fit-out',           account: 'Zara Investment Holding',      value: 624000, stage: 'closing', owner: 'Hala Jaber', probability: 90, scope: 'Full HVAC',     closeDate: '2026-05-25', age: 9 },
  { id: 'D-2026-0268', name: 'IKEA Amman — service yard exhaust',                account: 'IKEA Amman',                   value: 76000,  stage: 'closing', owner: 'Ahmad Marji', probability: 95, scope: 'Industrial vent.', closeDate: '2026-05-18', age: 5 },
];

window.DEALS = DEALS;

// Helpers
window.formatJOD = (n) => 'JOD ' + n.toLocaleString('en-US');
window.formatJODshort = (n) => {
  if (n >= 1_000_000) return 'JOD ' + (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return 'JOD ' + (n / 1_000).toFixed(0) + 'K';
  return 'JOD ' + n;
};
window.formatDate = (iso) => {
  const d = new Date(iso);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};
window.daysUntil = (iso) => {
  const d = new Date(iso);
  const now = new Date('2026-05-06'); // pinned demo date
  return Math.round((d - now) / (1000 * 60 * 60 * 24));
};
