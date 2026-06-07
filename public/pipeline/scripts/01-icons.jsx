// Lucide icons inlined as small React components — pulled from the Lucide CDN library.
// All icons share: 24×24 viewBox, currentColor stroke, 2px stroke width, round caps/joins.

const Ic = ({ children, size = 16, ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...rest}
  >
    {children}
  </svg>
);

const IconSearch    = (p) => <Ic {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></Ic>;
const IconPlus      = (p) => <Ic {...p}><path d="M12 5v14M5 12h14"/></Ic>;
const IconChevDown  = (p) => <Ic {...p}><path d="M6 9l6 6 6-6"/></Ic>;
const IconChevRight = (p) => <Ic {...p}><path d="M9 6l6 6-6 6"/></Ic>;
const IconChevUp    = (p) => <Ic {...p}><path d="M18 15l-6-6-6 6"/></Ic>;
const IconClose     = (p) => <Ic {...p}><path d="M18 6 6 18M6 6l12 12"/></Ic>;
const IconFilter    = (p) => <Ic {...p}><path d="M22 3H2l8 9.46V19l4 2v-8.54z"/></Ic>;
const IconLayers    = (p) => <Ic {...p}><path d="M20 7L12 3 4 7l8 4zM4 7v10l8 4M20 7v10l-8 4M4 12l8 4M20 12l-8 4"/></Ic>;
const IconLayout    = (p) => <Ic {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></Ic>;
const IconTable     = (p) => <Ic {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></Ic>;
const IconKanban    = (p) => <Ic {...p}><rect x="3" y="3" width="5" height="14" rx="1"/><rect x="10" y="3" width="5" height="10" rx="1"/><rect x="17" y="3" width="4" height="6" rx="1"/></Ic>;
const IconHome      = (p) => <Ic {...p}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></Ic>;
const IconBriefcase = (p) => <Ic {...p}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></Ic>;
const IconUsers     = (p) => <Ic {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></Ic>;
const IconBuilding  = (p) => <Ic {...p}><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/></Ic>;
const IconTrend     = (p) => <Ic {...p}><path d="M3 3v18h18"/><path d="M18.7 8 13 13.7l-3-3L6 14.7"/></Ic>;
const IconFile      = (p) => <Ic {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></Ic>;
const IconSettings  = (p) => <Ic {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></Ic>;
const IconBell      = (p) => <Ic {...p}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></Ic>;
const IconCalendar  = (p) => <Ic {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></Ic>;
const IconClock     = (p) => <Ic {...p}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></Ic>;
const IconMail      = (p) => <Ic {...p}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="m22 6-10 7L2 6"/></Ic>;
const IconPhone     = (p) => <Ic {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></Ic>;
const IconMore      = (p) => <Ic {...p}><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></Ic>;
const IconCheck     = (p) => <Ic {...p}><path d="M20 6 9 17l-5-5"/></Ic>;
const IconArrowUp   = (p) => <Ic {...p}><path d="M12 19V5M5 12l7-7 7 7"/></Ic>;
const IconArrowDown = (p) => <Ic {...p}><path d="M12 5v14M19 12l-7 7-7-7"/></Ic>;
const IconAttach    = (p) => <Ic {...p}><path d="M21.44 11.05l-9.19 9.19a6 6 0 1 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></Ic>;
const IconChat      = (p) => <Ic {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></Ic>;
const IconImport    = (p) => <Ic {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></Ic>;
const IconZap       = (p) => <Ic {...p}><path d="M13 2 3 14h9l-1 8 10-12h-9z"/></Ic>;
const IconLink      = (p) => <Ic {...p}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></Ic>;
const IconMapPin    = (p) => <Ic {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></Ic>;
const IconStar      = (p) => <Ic {...p}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></Ic>;
const IconEdit      = (p) => <Ic {...p}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></Ic>;
const IconSparkle   = (p) => <Ic {...p}><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z"/></Ic>;
const IconDownload  = (p) => <Ic {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></Ic>;

window.Icons = {
  Search: IconSearch, Plus: IconPlus, ChevDown: IconChevDown, ChevRight: IconChevRight, ChevUp: IconChevUp,
  Close: IconClose, Filter: IconFilter, Layers: IconLayers, Layout: IconLayout, Table: IconTable,
  Kanban: IconKanban, Home: IconHome, Briefcase: IconBriefcase, Users: IconUsers, Building: IconBuilding,
  Trend: IconTrend, File: IconFile, Settings: IconSettings, Bell: IconBell, Calendar: IconCalendar,
  Clock: IconClock, Mail: IconMail, Phone: IconPhone, More: IconMore, Check: IconCheck,
  ArrowUp: IconArrowUp, ArrowDown: IconArrowDown, Attach: IconAttach, Chat: IconChat,
  Import: IconImport, Zap: IconZap, Link: IconLink, MapPin: IconMapPin, Star: IconStar,
  Edit: IconEdit, Sparkle: IconSparkle, Download: IconDownload,
};
