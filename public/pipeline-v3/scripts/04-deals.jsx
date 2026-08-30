// IMG CRM — seed data loaded from IMG_CRM_Seed_Data.xlsx (real data, not random).
// Exposes USERS, ORGANIZATIONS, PRODUCT_GROUPS, PIPELINE_STAGES, STAGE_PROBABILITY,
// DEALS, CURRENT_USER, plus formatting helpers.

// ============================================================
// USERS (7 — IMG internal team)
// ============================================================
window.USERS = [
  { id: 'U001', name: 'Ahmad Al-Faouri',  role: 'Admin',         email: 'ahmad.faouri@img.jo',   phone: '079 500 0001', dept: 'IT',     active: true,  notes: 'System administrator' },
  { id: 'U002', name: 'Essam Al-Eker',    role: 'Sales Manager', email: 'essam.eker@img.jo',     phone: '079 500 0002', dept: 'Sales',  active: true,  notes: 'Head of sales department' },
  { id: 'U003', name: 'Yazan Obeidat',    role: 'Salesman',      email: 'yazan.obeidat@img.jo', phone: '079 500 0003', dept: 'Sales',  active: true,  notes: 'Senior salesman — Commercial focus' },
  { id: 'U004', name: 'Mahmoud Haddad',   role: 'Salesman',      email: 'mahmoud.haddad@img.jo',phone: '079 500 0004', dept: 'Sales',  active: true,  notes: 'Salesman — Residential focus' },
  { id: 'U005', name: 'Sally Khoury',     role: 'Design Manager',email: 'sally.khoury@img.jo',  phone: '079 500 0005', dept: 'Design', active: true,  notes: 'Head of design department' },
  { id: 'U006', name: 'Omar Tarawneh',    role: 'Designer',      email: 'omar.tarawneh@img.jo', phone: '079 500 0006', dept: 'Design', active: true,  notes: 'Senior HVAC designer' },
  { id: 'U007', name: 'Hilal Nasser',     role: 'Designer',      email: 'hilal.nasser@img.jo', phone: '079 500 0007', dept: 'Design', active: true,  notes: 'HVAC designer' },
];

window.SALES_TEAM = window.USERS.filter(u => ['Sales Manager', 'Salesman'].includes(u.role));
window.SALESMEN   = window.USERS.filter(u => u.role === 'Salesman');

// Demo "logged-in user". For the prototype we let you switch via the sidebar
// (persisted in localStorage). Defaults to Yazan, a salesman.
(function _resolveCurrentUser() {
  let id = null;
  try { id = localStorage.getItem('imgCurrentUserId'); } catch {}
  window.CURRENT_USER = window.USERS.find(u => u.id === id) || window.USERS.find(u => u.id === 'U003');
})();

window.findUserByFirstName = (firstName) =>
  window.USERS.find(u => u.name.split(' ')[0].toLowerCase() === String(firstName || '').toLowerCase()) || null;

// ============================================================
// ORGANIZATIONS (20)
// ============================================================
window.ORG_TYPES = ['Customer', 'Engineering Office', 'Contractor', 'Subcontractor'];

window.ORGANIZATIONS = [
  { id: 'ORG001', name: 'Abdali Investment & Development', type: 'Customer',           industry: 'Real Estate',             address: 'Abdali Boulevard, Building 14',    city: 'Amman',    phone: '06 560 1000',  email: 'info@abdali.jo',              website: 'www.abdali.jo',     notes: 'Major mixed-use developer' },
  { id: 'ORG002', name: 'Tamimi Holdings',                  type: 'Customer',           industry: 'Real Estate',             address: 'Dabouq, Villa District',           city: 'Amman',    phone: '06 541 2200',  email: 'info@tamimi-holdings.jo',     website: '',                  notes: 'Luxury residential developer' },
  { id: 'ORG003', name: 'Capital Real Estate',              type: 'Customer',           industry: 'Real Estate',             address: 'Shmeisani, Al-Sharif Nasser St',   city: 'Amman',    phone: '06 568 9000',  email: 'info@capital-re.jo',          website: 'www.capital-re.jo', notes: 'Commercial towers' },
  { id: 'ORG004', name: 'Jordan Medical Center',            type: 'Customer',           industry: 'Healthcare',              address: 'Gardens District, Queen Rania St', city: 'Amman',    phone: '06 585 1000',  email: 'admin@jmc.jo',                website: 'www.jmc.jo',        notes: 'Private hospital group' },
  { id: 'ORG005', name: 'Al-Dawliyya Hotels',               type: 'Customer',           industry: 'Hospitality',             address: 'Dead Sea Road, KM 45',             city: 'Dead Sea', phone: '05 349 1000',  email: 'info@dawliyya.jo',            website: '',                  notes: '5-star resort operator' },
  { id: 'ORG006', name: 'Khalil Trading Co.',               type: 'Customer',           industry: 'Warehousing',             address: 'Bayader Industrial Zone, Lot 7',   city: 'Amman',    phone: '06 402 3300',  email: 'ahmad@khalil-trading.jo',     website: '',                  notes: 'Cold storage & logistics' },
  { id: 'ORG007', name: 'Rami Haddad Properties',           type: 'Customer',           industry: 'Real Estate',             address: 'Mecca St, Tower 3',                city: 'Amman',    phone: '079 611 0000', email: 'rami@rhp.jo',                 website: '',                  notes: 'Small residential developer' },
  { id: 'ORG008', name: 'Cafe Rumi Chain',                  type: 'Customer',           industry: 'F&B',                     address: 'Rainbow St, Downtown',             city: 'Amman',    phone: '079 123 0000', email: 'sara@cafesrumi.jo',           website: 'www.cafesrumi.jo',  notes: '5-branch coffee chain' },
  { id: 'ORG009', name: 'University of Petra',              type: 'Customer',           industry: 'Education',               address: 'Airport Road, KM 12',              city: 'Amman',    phone: '06 571 5555',  email: 'facilities@uop.edu.jo',       website: 'www.uop.edu.jo',    notes: 'Private university' },
  { id: 'ORG010', name: 'Safeway Supermarkets',             type: 'Customer',           industry: 'Retail',                  address: 'Multiple locations',               city: 'Amman',    phone: '06 581 0000',  email: 'facilities@safeway.jo',       website: 'www.safeway.jo',    notes: 'Retail chain — 12 branches' },
  { id: 'ORG011', name: 'Sigma Engineering',                type: 'Engineering Office', industry: 'MEP Consulting',          address: 'Wadi Saqra, Office 301',           city: 'Amman',    phone: '06 464 2100',  email: 'design@sigma-eng.jo',         website: 'www.sigma-eng.jo',  notes: 'Top MEP consultant' },
  { id: 'ORG012', name: 'Arc Design Consultants',           type: 'Engineering Office', industry: 'Architecture',            address: 'Sweifieh, Paris Circle',           city: 'Amman',    phone: '06 585 7700',  email: 'info@arc-design.jo',          website: 'www.arc-design.jo', notes: 'Architecture + MEP' },
  { id: 'ORG013', name: 'Beta Engineering',                 type: 'Engineering Office', industry: 'MEP Consulting',          address: 'Jabal Amman, 3rd Circle',          city: 'Amman',    phone: '06 461 3300',  email: 'contact@beta-eng.jo',         website: '',                  notes: 'MEP for commercial projects' },
  { id: 'ORG014', name: 'Dar Al-Omran',                     type: 'Engineering Office', industry: 'Architecture',            address: 'Abdoun, Queen Noor St',            city: 'Amman',    phone: '06 592 4400',  email: 'info@daralomran.jo',          website: 'www.daralomran.jo', notes: 'Government & institutional' },
  { id: 'ORG015', name: 'ABC Contracting',                  type: 'Contractor',         industry: 'General Contracting',     address: 'Sahab Industrial Zone',            city: 'Amman',    phone: '06 401 5500',  email: 'projects@abc-contracting.jo', website: '',                  notes: 'Large-scale commercial' },
  { id: 'ORG016', name: 'Elite Build',                      type: 'Contractor',         industry: 'General Contracting',     address: 'Dabouq Heights',                   city: 'Amman',    phone: '06 541 8800',  email: 'info@elitebuild.jo',          website: 'www.elitebuild.jo', notes: 'Luxury residential specialist' },
  { id: 'ORG017', name: 'Home Pro JO',                      type: 'Contractor',         industry: 'Residential Contracting', address: 'Khalda, Wasfi Al-Tal St',          city: 'Amman',    phone: '079 855 0000', email: 'info@homepro.jo',             website: '',                  notes: 'Villas & apartments' },
  { id: 'ORG018', name: 'Build Corp International',         type: 'Contractor',         industry: 'General Contracting',     address: 'King Hussein Business Park',       city: 'Amman',    phone: '06 580 2200',  email: 'tenders@buildcorp.jo',        website: 'www.buildcorp.jo',  notes: 'Towers & malls' },
  { id: 'ORG019', name: 'Al-Mohandis MEP',                  type: 'Subcontractor',      industry: 'MEP Installation',        address: 'Zarqa Free Zone',                  city: 'Zarqa',    phone: '05 390 1100',  email: 'info@mohandis-mep.jo',        website: '',                  notes: 'HVAC installation specialist' },
  { id: 'ORG020', name: 'Frost HVAC Services',              type: 'Subcontractor',      industry: 'HVAC Maintenance',        address: 'Abu Alanda, Industrial St',        city: 'Amman',    phone: '079 666 3300', email: 'service@frosthvac.jo',        website: '',                  notes: 'Maintenance & service contracts' },
];

window.findOrgById   = (id)   => window.ORGANIZATIONS.find(o => o.id === id) || null;
window.findOrgByName = (name) => {
  if (!name) return null;
  const q = String(name).toLowerCase().trim();
  let hit = window.ORGANIZATIONS.find(o => o.name.toLowerCase() === q);
  if (hit) return hit;
  hit = window.ORGANIZATIONS.find(o => o.name.toLowerCase().startsWith(q));
  if (hit) return hit;
  hit = window.ORGANIZATIONS.find(o => o.name.toLowerCase().includes(q) || q.includes(o.name.toLowerCase().split(' ')[0]));
  return hit || null;
};

// ============================================================
// PRODUCT GROUPS (real HVAC categories at IMG)
// ============================================================
// Baseline kept here so the New Deal modal still renders if the API call
// hasn't returned yet. window.loadProductGroups() (below) overwrites this
// with the live list from /api/opportunities/meta/product-groups.
window.PRODUCT_GROUPS = ['VRF', 'Wall-mounted Split', 'Cassette', 'Ducted', 'Floor-standing / Ceiling', 'Chillers', 'AHU', 'Fan Coils', 'Controls & Accessories', 'Plumbing'];

window.loadProductGroups = (function () {
  let _p = null;
  return function () {
    if (_p) return _p;
    _p = (window.api ? window.api.get('/opportunities/meta/product-groups') : Promise.reject(new Error('api not ready')))
      .then(list => {
        if (Array.isArray(list) && list.length) window.PRODUCT_GROUPS = list;
        return window.PRODUCT_GROUPS;
      })
      .catch(() => window.PRODUCT_GROUPS);
    return _p;
  };
})();

// ============================================================
// PIPELINE STAGES & PROBABILITIES
// ============================================================
// STAGE_ORDER (the 5 active kanban columns) is set in 03-stage-meta.jsx.
window.PIPELINE_STAGES = ['prospect', 'tender', 'analysis', 'negotiation', 'closing'];
window.STAGE_PROBABILITY = {
  prospect: 10, tender: 30, analysis: 50, negotiation: 70, closing: 90, won: 100, lost: 0,
};

// ============================================================
// DEALS / OPPORTUNITIES (15 — real, from IMG_CRM_Seed_Data.xlsx)
// ============================================================
function _closeDateForQuarter(q) {
  if (!q) return null;
  const m = /^Q([1-4])\s+(\d{4})$/.exec(String(q).trim());
  if (!m) return null;
  const qNum = +m[1], year = +m[2];
  const lastDay = ['03-31', '06-30', '09-30', '12-31'][qNum - 1];
  return `${year}-${lastDay}`;
}

function _deal(opp) {
  const stage = opp.stage.toLowerCase();
  const status = opp.status || 'Active';
  const finalStage = status.toLowerCase() === 'won' ? 'won'
                   : status.toLowerCase() === 'lost' ? 'lost'
                   : stage;
  const owner = window.findUserByFirstName(opp.salesman);
  return {
    id:           opp.id,
    name:         opp.title,
    account:      opp.organization,
    orgId:        opp.orgId,
    contactId:    opp.contactId,
    contactName:  opp.contact,
    value:        opp.value,
    stage:        finalStage,
    status,
    owner:        owner ? owner.name : opp.salesman,
    ownerId:      owner ? owner.id : null,
    probability:  window.STAGE_PROBABILITY[finalStage] ?? 0,
    scope:        opp.productGroup,
    closeDate:    _closeDateForQuarter(opp.closeQuarter),
    closeQuarter: opp.closeQuarter,
    age:          0,
    segment:      opp.segment || null,
    source:       opp.source || null,
    district:     opp.district || null,
    engOffice:    opp.engOffice || null,
    contractor:   opp.contractor || null,
    discount:     opp.discount || 0,
    notes:        opp.notes || '',
  };
}

window.DEALS = [
  _deal({ id: 'OPP001', title: 'Abdali Mall HVAC System',           contact: 'Ahmad Khalil',        contactId: 'C001', organization: 'Abdali Investment & Development', orgId: 'ORG001', salesman: 'Yazan',   stage: 'Negotiation', value: 450000,  productGroup: 'VRF Systems',     segment: 'Commercial',  source: 'Consultant', district: 'Abdali',     engOffice: 'Sigma Engineering',          contractor: 'ABC Contracting',          closeQuarter: 'Q3 2026', status: 'Active', discount: 15, notes: 'Major project — 3 floors retail + offices' }),
  _deal({ id: 'OPP002', title: 'Mecca St Residential Tower',        contact: 'Rami Haddad',         contactId: 'C011', organization: 'Rami Haddad Properties',          orgId: 'ORG007', salesman: 'Mahmoud', stage: 'Prospect',    value: 85000,   productGroup: 'Split Units',     segment: 'Residential', source: 'Walk-in',    district: 'Mecca St',                                                                            closeQuarter: 'Q4 2026', status: 'Active', discount: 0,  notes: '14-floor tower, 56 apartments' }),
  _deal({ id: 'OPP003', title: 'Sweifieh Villa — Mansour',          contact: 'Laith Tamimi',        contactId: 'C004', organization: 'Tamimi Holdings',                  orgId: 'ORG002', salesman: 'Yazan',   stage: 'Closing',     value: 32000,   productGroup: 'Ducted Units',    segment: 'Residential', source: 'Internet',   district: 'Sweifieh',                                            contractor: 'Home Pro JO',              closeQuarter: 'Q2 2026', status: 'Active', discount: 10, notes: 'High-end villa, customer ready to sign' }),
  _deal({ id: 'OPP004', title: 'Dabouq Luxury Villas (5 units)',    contact: 'Fadi Tamimi',         contactId: 'C003', organization: 'Tamimi Holdings',                  orgId: 'ORG002', salesman: 'Yazan',   stage: 'Analysis',    value: 320000,  productGroup: 'VRF Systems',     segment: 'Residential', source: 'Referral',   district: 'Dabouq',     engOffice: 'Arc Design Consultants',     contractor: 'Elite Build',              closeQuarter: 'Q3 2026', status: 'Active', discount: 0,  notes: '5 luxury villas — complex layout' }),
  _deal({ id: 'OPP005', title: 'Rainbow St Cafe Chain AC',          contact: 'Sara Nasser',         contactId: 'C012', organization: 'Cafe Rumi Chain',                  orgId: 'ORG008', salesman: 'Mahmoud', stage: 'Closing',     value: 18000,   productGroup: 'Split Units',     segment: 'Commercial',  source: 'Walk-in',    district: 'Rainbow',                                                                             closeQuarter: 'Q2 2026', status: 'Won',    discount: 5,  notes: '5 branches — completed' }),
  _deal({ id: 'OPP006', title: 'Shmeisani Office Tower Chiller',    contact: 'Nour Halabi',         contactId: 'C005', organization: 'Capital Real Estate',              orgId: 'ORG003', salesman: 'Mahmoud', stage: 'Analysis',    value: 780000,  productGroup: 'Chiller Systems', segment: 'Commercial',  source: 'Consultant', district: 'Shmeisani',  engOffice: 'Beta Engineering',           contractor: 'Build Corp International', closeQuarter: 'Q4 2026', status: 'Active', discount: 0,  notes: '12-floor tower — large chiller system' }),
  _deal({ id: 'OPP007', title: 'Jordan Medical Wing B',             contact: 'Dr. Samer Awwad',     contactId: 'C007', organization: 'Jordan Medical Center',            orgId: 'ORG004', salesman: 'Yazan',   stage: 'Prospect',    value: 1200000, productGroup: 'VRF Systems',     segment: 'Commercial',  source: 'Referral',   district: 'Gardens',    engOffice: 'Sigma Engineering',          contractor: 'ABC Contracting',          closeQuarter: 'Q1 2027', status: 'Active', discount: 0,  notes: 'Hospital expansion — critical environment' }),
  _deal({ id: 'OPP008', title: 'Dead Sea Resort Expansion',         contact: 'Majed Al-Khatib',     contactId: 'C009', organization: 'Al-Dawliyya Hotels',               orgId: 'ORG005', salesman: 'Mahmoud', stage: 'Tender',      value: 550000,  productGroup: 'Chiller Systems', segment: 'Commercial',  source: 'Consultant', district: 'Dead Sea',   engOffice: 'Dar Al-Omran',               contractor: 'Build Corp International', closeQuarter: 'Q4 2026', status: 'Active', discount: 0,  notes: '150-room resort wing addition' }),
  _deal({ id: 'OPP009', title: 'Khalil Warehouse Cold Storage',     contact: 'Ahmad Khalil',        contactId: 'C010', organization: 'Khalil Trading Co.',               orgId: 'ORG006', salesman: 'Mahmoud', stage: 'Prospect',    value: 65000,   productGroup: 'Fan Coils',       segment: 'Commercial',  source: 'Walk-in',    district: 'Bayader',                                             contractor: 'Al-Mohandis MEP',          closeQuarter: 'Q3 2026', status: 'Active', discount: 0,  notes: 'Temperature-controlled warehouse' }),
  _deal({ id: 'OPP010', title: 'UoP New Campus Building',           contact: 'Prof. Mazen Shobaki', contactId: 'C013', organization: 'University of Petra',              orgId: 'ORG009', salesman: 'Yazan',   stage: 'Tender',      value: 420000,  productGroup: 'VRF Systems',     segment: 'Commercial',  source: 'Consultant', district: 'Airport Rd', engOffice: 'Sigma Engineering',          contractor: 'ABC Contracting',          closeQuarter: 'Q1 2027', status: 'Active', discount: 0,  notes: 'Academic building — 4 floors' }),
  _deal({ id: 'OPP011', title: 'Safeway Branch Retrofit (3 stores)',contact: 'Jihad Abu Ghazaleh',  contactId: 'C015', organization: 'Safeway Supermarkets',             orgId: 'ORG010', salesman: 'Yazan',   stage: 'Negotiation', value: 95000,   productGroup: 'Split Units',     segment: 'Commercial',  source: 'Referral',   district: 'Multiple',                                            contractor: 'Al-Mohandis MEP',          closeQuarter: 'Q3 2026', status: 'Active', discount: 20, notes: 'Replacing old units in 3 branches' }),
  _deal({ id: 'OPP012', title: 'Tamimi Villa #6 Dabouq',            contact: 'Laith Tamimi',        contactId: 'C004', organization: 'Tamimi Holdings',                  orgId: 'ORG002', salesman: 'Yazan',   stage: 'Prospect',    value: 58000,   productGroup: 'Ducted Units',    segment: 'Residential', source: 'Referral',   district: 'Dabouq',     engOffice: 'Arc Design Consultants',     contractor: 'Elite Build',              closeQuarter: 'Q4 2026', status: 'Active', discount: 0,  notes: 'Additional villa — same compound' }),
  _deal({ id: 'OPP013', title: 'Abdali Phase 2 Offices',            contact: 'Nadia Sabbagh',       contactId: 'C002', organization: 'Abdali Investment & Development',  orgId: 'ORG001', salesman: 'Yazan',   stage: 'Prospect',    value: 380000,  productGroup: 'VRF Systems',     segment: 'Commercial',  source: 'Consultant', district: 'Abdali',     engOffice: 'Sigma Engineering',          contractor: 'ABC Contracting',          closeQuarter: 'Q1 2027', status: 'Active', discount: 0,  notes: 'Phase 2 office building — follow-on from OPP001' }),
  _deal({ id: 'OPP014', title: 'Capital RE Parking Ventilation',    contact: 'Tariq Al-Masri',      contactId: 'C006', organization: 'Capital Real Estate',              orgId: 'ORG003', salesman: 'Mahmoud', stage: 'Negotiation', value: 45000,   productGroup: 'AHU',             segment: 'Commercial',  source: 'Consultant', district: 'Shmeisani',  engOffice: 'Beta Engineering',           contractor: 'Build Corp International', closeQuarter: 'Q3 2026', status: 'Active', discount: 8,  notes: 'Underground parking ventilation system' }),
  _deal({ id: 'OPP015', title: 'Frost Service Contract 2026',       contact: 'Firas Habashneh',     contactId: 'C025', organization: 'Frost HVAC Services',              orgId: 'ORG020', salesman: 'Mahmoud', stage: 'Closing',     value: 22000,   productGroup: 'Split Units',     segment: 'Commercial',  source: 'Walk-in',    district: 'Multiple',                                                                            closeQuarter: 'Q2 2026', status: 'Active', discount: 0,  notes: 'Annual maintenance contract renewal' }),
];

// ============================================================
// FORMATTERS
// ============================================================
window.formatJOD = (n) => 'JOD ' + (n || 0).toLocaleString('en-US');
window.formatJODshort = (n) => {
  n = n || 0;
  if (n >= 1_000_000) return 'JOD ' + (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return 'JOD ' + (n / 1_000).toFixed(0) + 'K';
  return 'JOD ' + n;
};
window.formatDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};
window.daysUntil = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  const now = new Date();
  return Math.round((d - now) / (1000 * 60 * 60 * 24));
};
