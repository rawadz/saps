import type { ReactNode } from 'react'
import OfficialHeader from './OfficialHeader'

export type SectionKey =
  | 'scan'
  | 'employees'
  | 'visitor-permits'
  | 'vehicle-permits'
  | 'reports'
  | 'users'
  | 'gates'

interface DashboardScreenProps {
  role: string
  onSelect: (section: SectionKey) => void
  onLogout: () => void
}

// Shared wrapper for the linear (outline) section icons. Stroke is currentColor, so
// the approved gold comes from `.dash-tile-icon { color: var(--gold) }` in the theme.
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

// One consistent linear-icon family (Lucide-style) for all sections.
const ScanIcon = (
  <Icon>
    <path d="M4 8V6a2 2 0 0 1 2-2h2" />
    <path d="M16 4h2a2 2 0 0 1 2 2v2" />
    <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
    <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
    <line x1="4" y1="12" x2="20" y2="12" />
  </Icon>
)
const EmployeesIcon = (
  <Icon>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </Icon>
)
const VisitorPermitIcon = (
  <Icon>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="8.5" cy="10.5" r="1.8" />
    <path d="M5.7 16a3 3 0 0 1 5.6 0" />
    <line x1="14" y1="10" x2="18" y2="10" />
    <line x1="14" y1="14" x2="18" y2="14" />
  </Icon>
)
const VehiclePermitIcon = (
  <Icon>
    <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L18.4 7.6A2 2 0 0 0 16.5 6h-9a2 2 0 0 0-1.9 1.4L4.5 11.1C3.7 11.3 3 12.1 3 13v3c0 .6.4 1 1 1h2" />
    <circle cx="7" cy="17" r="2" />
    <circle cx="17" cy="17" r="2" />
  </Icon>
)
const ReportsIcon = (
  <Icon>
    <path d="M3 3v18h18" />
    <path d="M18 17V9" />
    <path d="M13 17V5" />
    <path d="M8 17v-3" />
  </Icon>
)
const UsersIcon = (
  <Icon>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
)
// A gate barrier: a vertical post on the left and a horizontal arm across the lane.
const GatesIcon = (
  <Icon>
    <line x1="5" y1="4" x2="5" y2="20" />
    <path d="M5 8h13a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2H5" />
    <line x1="9" y1="10" x2="9" y2="10" />
    <line x1="13" y1="10" x2="13" y2="10" />
    <line x1="17" y1="10" x2="17" y2="10" />
  </Icon>
)

interface Tile {
  key: SectionKey
  label: string
  desc: string
  icon: ReactNode
  // Roles that may SEE this card — mirrors the backend @Roles for its target screen.
  roles: string[]
}

const TILES: Tile[] = [
  {
    key: 'scan',
    label: 'مسح البوابة',
    desc: 'التحقّق من الهويات والتصاريح على البوابة',
    icon: ScanIcon,
    roles: ['super_admin', 'branch_head', 'supervisor'],
  },
  {
    key: 'employees',
    label: 'إدارة الموظفين',
    desc: 'إنشاء الموظفين وتفعيلهم وإدارة حالتهم',
    icon: EmployeesIcon,
    roles: ['super_admin', 'branch_head', 'supervisor', 'hr', 'hr_head'],
  },
  {
    key: 'visitor-permits',
    label: 'تصاريح الزوار',
    desc: 'إصدار ومتابعة تصاريح دخول الزوار',
    icon: VisitorPermitIcon,
    roles: ['super_admin', 'branch_head', 'supervisor', 'permit_officer'],
  },
  {
    key: 'vehicle-permits',
    label: 'تصاريح المركبات',
    desc: 'إصدار ومتابعة تصاريح دخول المركبات',
    icon: VehiclePermitIcon,
    roles: ['super_admin', 'branch_head', 'supervisor', 'permit_officer'],
  },
  {
    key: 'reports',
    label: 'التقارير',
    desc: 'سجلّ حركة البوابة والإحصاءات اليومية',
    icon: ReportsIcon,
    roles: [
      'super_admin',
      'branch_head',
      'supervisor',
      'department_manager',
      'hr_head',
      'hr',
    ],
  },
  {
    key: 'users',
    label: 'إدارة المستخدمين',
    desc: 'إدارة حسابات المستخدمين والصلاحيات',
    icon: UsersIcon,
    roles: ['super_admin', 'department_manager', 'branch_head'],
  },
  {
    key: 'gates',
    label: 'إدارة البوابات',
    desc: 'تعريف البوابات واتجاهها وحالتها',
    icon: GatesIcon,
    roles: [], // HIDDEN: gates disabled — أعِد الأدوار للتراجع
  },
]

export default function DashboardScreen({
  role,
  onSelect,
  onLogout,
}: DashboardScreenProps) {
  // Show only the cards this role may use — each tile lists the roles matching the
  // backend @Roles for its screen (display filter; the server still enforces access).
  const tiles = TILES.filter((t) => t.roles.includes(role))

  return (
    <div className="app">
      <main className="card dash-card">
        <OfficialHeader />
        <p className="subtitle">لوحة التحكّم</p>
        {/* Total available units — derived from the rendered (role-filtered) list. */}
        <div className="dash-count-badge">{tiles.length} وحدات</div>

        <div className="dash-grid">
          {tiles.map((t) => (
            <button
              key={t.key}
              type="button"
              className="dash-tile"
              onClick={() => onSelect(t.key)}
            >
              <span className="dash-tile-icon" aria-hidden="true">
                {t.icon}
              </span>
              <span className="dash-tile-text">
                <span className="dash-tile-title">{t.label}</span>
                <span className="dash-tile-desc">{t.desc}</span>
              </span>
              <span className="dash-tile-arrow" aria-hidden="true">
                ‹
              </span>
            </button>
          ))}
        </div>

        <button
          className="btn btn-ghost-gold"
          type="button"
          onClick={onLogout}
        >
          تسجيل الخروج
        </button>
      </main>
    </div>
  )
}
