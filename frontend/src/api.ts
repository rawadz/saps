// The frontend's single point of contact with the backend. Requests target RELATIVE
// paths under a configurable base (default '/api'); in dev the Vite proxy forwards
// '/api' to http://localhost:3000 and strips the prefix, so the browser stays
// same-origin — no CORS, one Ngrok tunnel. For a production build (no dev proxy), set
// VITE_API_BASE_URL to the backend's real URL.
const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface HealthReport {
  status: 'ok' | 'degraded';
  postgres: boolean;
  redis: boolean;
}

export interface AdminLoginResponse {
  accessToken: string;
  refreshToken: string;
  mustChangePassword: boolean;
}

export interface EmployeeLoginResponse {
  accessToken: string;
}

export interface MyBarcodeResponse {
  barcode: string | null;
}

export interface MyProfile {
  selfId: string;
  fullName: string;
  commandDepartment: string | null;
  rank: string | null;
  personnelType: 'civilian' | 'military';
  status: string;
}

// ── Gate-scan subject (SAFE guard-facing detail block; any field may be null) ──
export interface EmployeeScanInfo {
  kind: 'employee';
  fullName: string;
  commandDepartment: string | null;
  branch: string | null;
  priority: string | null;
  personnelType: 'civilian' | 'military';
  rank: string | null;
  currentJobTitle: string | null;
  // Service/employment exit status — shown at the gate whenever it is not 'active'.
  serviceStatus: 'active' | 'transferred' | 'discharged' | 'contract_ended';
  serviceExitDate: string | null; // ISO date of the documented exit (or null)
  serviceExitNote: string | null;
}

export interface VisitorScanInfo {
  kind: 'visitor';
  visitorName: string;
  permitType: 'scheduled' | 'single_entry';
  host: string;
  reason: string | null;
  personnelType: 'civilian' | 'military' | null;
  startDate: string | null; // ISO, scheduled only
  endDate: string | null;
}

export interface VehicleScanInfo {
  kind: 'vehicle';
  plateNumber: string;
  vehicleType: string | null;
  ownerType: 'employee' | 'visitor';
  owner: EmployeeScanInfo | VisitorScanInfo | null;
}

export type ScanSubject = EmployeeScanInfo | VisitorScanInfo | VehicleScanInfo;

/** The gate decision. POST /gate/scan ALWAYS returns HTTP 200 with one of these —
 *  a rejection (RED) is a valid result, not an HTTP error. `subject` carries the
 *  SAFE detail block (null for a forged/not-found scan); present on GREEN and RED. */
export type ScanDecision =
  | {
      result: 'GREEN';
      subjectName: string;
      department: string;
      subject: ScanSubject | null;
    }
  | { result: 'RED'; reason: string; subject: ScanSubject | null };

/**
 * The signed-in session, persisted in sessionStorage. DEMO-grade: a token in web
 * storage is exposed to XSS — fine for the demo, NOT for production (which would use
 * an httpOnly cookie or in-memory token + refresh).
 */
export interface AuthSession {
  accessToken: string;
  role: string | null;
}

/**
 * A failed request: a non-2xx response, or a network failure (status 0). It carries
 * the backend's error code (the response `message`) so the UI can show a precise
 * Arabic message without leaking details.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  constructor(status: number, code: string | undefined, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// ── Session storage: the single source of truth for the access token ──────────
const AUTH_STORAGE_KEY = 'esaps.auth';

export function getStoredSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

export function setStoredSession(session: AuthSession): void {
  sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession(): void {
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
}

// ── Auth-expiry signal ────────────────────────────────────────────────────────
// A subscribable callback the router layer registers (AuthExpiryBridge). Fired on a
// real 401 or a missing session so the app can redirect to /login. Kept here (not in
// React) so the network layer stays decoupled from routing.
type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null): void {
  unauthorizedHandler = fn;
}

// ── Core request ──────────────────────────────────────────────────────────────
interface RequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT';
  body?: unknown;
  /** When true, attach `Authorization: Bearer <token>` from the stored session. */
  auth?: boolean;
}

/** Pull the error code out of a Nest error body ({ message: string | string[] }). */
function extractCode(data: unknown): string | undefined {
  if (data && typeof data === 'object' && 'message' in data) {
    const message = (data as { message: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && typeof message[0] === 'string') {
      return message[0];
    }
  }
  return undefined;
}

async function request<T>(path: string, opts: RequestOptions): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (opts.auth) {
    const token = getStoredSession()?.accessToken;
    if (!token) {
      // No session at all — surface it like an auth failure so the UI re-logs in.
      unauthorizedHandler?.();
      throw new ApiError(401, 'NO_SESSION', 'NO_SESSION');
    }
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: opts.method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (err) {
    // fetch rejects only on a network-level failure (backend down, DNS, refused…).
    const reason = err instanceof Error ? err.message : 'Network request failed';
    throw new ApiError(0, 'NETWORK', reason);
  }

  if (!res.ok) {
    let code: string | undefined;
    try {
      code = extractCode(await res.json());
    } catch {
      code = undefined;
    }
    // A 401 on a protected call means the stored token is stale — drop it so the app
    // falls back to the login screen.
    if (res.status === 401 && opts.auth) {
      clearStoredSession();
      unauthorizedHandler?.(); // route back to /login (see AuthExpiryBridge)
    }
    throw new ApiError(res.status, code, code ?? `HTTP ${res.status}`);
  }

  // Nest serialises a `null` use-case result as an EMPTY body (Content-Length: 0),
  // not the text "null". Calling res.json() on an empty body throws SyntaxError.
  // Read as text first and tolerate the empty case so endpoints that legitimately
  // return null (e.g. GET /gate/my-gate when no station is pinned) resolve to null.
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

// Plain verbs never send a token; the *Auth verbs always do.
function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' });
}
function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body });
}

/** Generic PROTECTED request helpers — attach the bearer token automatically. */
export function apiGetAuth<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET', auth: true });
}
export function apiPostAuth<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body, auth: true });
}
export function apiPatchAuth<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'PATCH', body, auth: true });
}
export function apiPutAuth<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'PUT', body, auth: true });
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

/** GET /health — verifies the frontend can actually reach the backend (no auth). */
export function getHealth(): Promise<HealthReport> {
  return apiGet<HealthReport>('/health');
}

/** POST /auth/admin/login — username + password + deviceId. NO Authorization header. */
export function adminLogin(input: {
  username: string;
  password: string;
  deviceId: string;
}): Promise<AdminLoginResponse> {
  return apiPost<AdminLoginResponse>('/auth/admin/login', input);
}

/** POST /auth/employee/login — Employee ID only. NO Authorization header. */
export function employeeLogin(selfId: string): Promise<EmployeeLoginResponse> {
  return apiPost<EmployeeLoginResponse>('/auth/employee/login', { selfId });
}

/** GET /me/barcode — PROTECTED (employee role). Returns the employee's signed token. */
export function getMyBarcode(): Promise<MyBarcodeResponse> {
  return apiGetAuth<MyBarcodeResponse>('/me/barcode');
}

/** GET /me/profile — PROTECTED (employee role). The employee's own profile (name, id…). */
export function getMyProfile(): Promise<MyProfile> {
  return apiGetAuth<MyProfile>('/me/profile');
}

// ── Admin: view a specific employee's barcode (Phase 3-a) ─────────────────────
/** SAFE projection from GET /accounts/employees/:selfId/barcode — never a national/
 *  military id. barcodeToken is null for a not-yet-activated employee. */
export interface EmployeeBarcodeView {
  selfId: string;
  fullName: string;
  commandDepartment: string | null;
  branch: string | null;
  barcodeToken: string | null;
}

/** GET /accounts/employees/:selfId/barcode — PROTECTED (super_admin / branch_head /
 *  supervisor / hr). Returns the stored barcode token + safe display fields. */
export function getEmployeeBarcode(
  selfId: string,
): Promise<EmployeeBarcodeView> {
  return apiGetAuth<EmployeeBarcodeView>(
    `/accounts/employees/${encodeURIComponent(selfId)}/barcode`,
  );
}

/** POST /gate/scan — PROTECTED (guard/supervisor/branch_head/super_admin). Resolves
 *  with HTTP 200; the decision is GREEN (allowed) or RED (rejected, with a reason). */
export function gateScan(input: {
  barcode: string;
}): Promise<ScanDecision> {
  return apiPostAuth<ScanDecision>('/gate/scan', input);
}

// ── Visitor permits ───────────────────────────────────────────────────────────
export type PermitType = 'scheduled' | 'single_entry';
export type PermitStatus = 'active' | 'used' | 'expired' | 'cancelled';

export interface CreatePermitInput {
  permitType: PermitType;
  visitorName: string;
  idOrPhone: string;
  personnelType: 'civilian' | 'military';
  host: string;
  reason: string;
  // Scheduled-only window (the backend requires startDate + endDate when scheduled).
  startDate?: string;
  endDate?: string;
  allowedDays?: number[];
  allowedTimeFrom?: string;
  allowedTimeTo?: string;
}

export interface CreatePermitResponse {
  permitNumber: string;
  token: string;
}

/** Full visitor permit as returned by GET /permits/:permitNumber (dates are ISO strings). */
export interface VisitorPermit {
  permitNumber: string;
  token: string | null;
  permitType: PermitType;
  status: PermitStatus;
  visitorName: string;
  idOrPhone: string | null;
  personnelType: 'civilian' | 'military' | null;
  host: string;
  reason: string | null;
  startDate: string | null;
  endDate: string | null;
  allowedDays: number[];
  allowedTimeFrom: string | null;
  allowedTimeTo: string | null;
  createdAt: string;
}

/** POST /permits — issue a visitor permit. Returns its number + signed token. */
export function createVisitorPermit(
  input: CreatePermitInput,
): Promise<CreatePermitResponse> {
  return apiPostAuth<CreatePermitResponse>('/permits', input);
}

/** GET /permits/:permitNumber — look up an existing visitor permit. */
export function getVisitorPermit(permitNumber: string): Promise<VisitorPermit> {
  return apiGetAuth<VisitorPermit>(
    `/permits/${encodeURIComponent(permitNumber)}`,
  );
}

// ── Visitor permits directory (admin list) ───────────────────────────────────
/** One row of GET /permits — SAFE fields only (no idOrPhone, no token). */
export interface VisitorPermitListItem {
  permitNumber: string;
  visitorName: string;
  permitType: PermitType;
  status: PermitStatus; // raw stored status
  host: string;
  personnelType: 'civilian' | 'military' | null;
  startDate: string | null; // scheduled-only
  endDate: string | null; // scheduled-only
  createdAt: string;
}

export interface VisitorPermitsListPage {
  items: VisitorPermitListItem[];
  page: number;
  pageSize: number;
  total: number;
}

/** GET /permits — paginated, filtered visitor-permit directory (permit roles). */
export function getVisitorPermitsList(
  page: number,
  pageSize: number,
  status?: PermitStatus,
  permitType?: PermitType,
  q?: string,
): Promise<VisitorPermitsListPage> {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));
  if (status) params.set('status', status);
  if (permitType) params.set('permitType', permitType);
  if (q && q.trim()) params.set('q', q.trim());
  return apiGetAuth<VisitorPermitsListPage>(`/permits?${params.toString()}`);
}

// ── Vehicle permits ───────────────────────────────────────────────────────────
export type VehicleType = 'private' | 'public' | 'government';

export interface CreateVehiclePermitInput {
  plateNumber: string;
  vehicleType: VehicleType;
  color?: string;
  make?: string;
  model?: string;
  expiresAt?: string;
  // EXACTLY ONE owner — the backend enforces the "exactly one" rule.
  ownerEmployeeSelfId?: string;
  ownerVisitorPermitNumber?: string;
}

export interface CreateVehicleResponse {
  id: string;
  barcodeToken: string;
}

/** Full vehicle permit as returned by GET /vehicle-permits/:id (id is a UUID). */
export interface VehiclePermit {
  id: string;
  plateNumber: string;
  vehicleType: VehicleType | null;
  color: string | null;
  make: string | null;
  model: string | null;
  barcodeToken: string | null;
  status: string;
  expiresAt: string | null;
  employeeId: string | null; // internal owner-employee UUID (FK)
  visitorPermitId: string | null; // internal owner-permit UUID (FK)
  createdAt: string;
}

/** POST /vehicle-permits — issue a vehicle permit. Returns its id + signed token. */
export function createVehiclePermit(
  input: CreateVehiclePermitInput,
): Promise<CreateVehicleResponse> {
  return apiPostAuth<CreateVehicleResponse>('/vehicle-permits', input);
}

/** GET /vehicle-permits/:id — look up a vehicle permit by its UUID. */
export function getVehiclePermit(id: string): Promise<VehiclePermit> {
  return apiGetAuth<VehiclePermit>(
    `/vehicle-permits/${encodeURIComponent(id)}`,
  );
}

// ── Vehicle permits directory (admin list) ───────────────────────────────────
export type VehicleOwnerType = 'employee' | 'visitor';

/** One row of GET /vehicle-permits — SAFE fields only (no barcodeToken). */
export interface VehiclePermitListItem {
  id: string;
  plateNumber: string;
  vehicleType: VehicleType | null;
  status: string; // raw stored status
  color: string | null;
  make: string | null;
  model: string | null;
  ownerType: VehicleOwnerType;
  ownerName: string | null; // joined employee.fullName / permit.visitorName
  createdAt: string;
}

export interface VehiclePermitsListPage {
  items: VehiclePermitListItem[];
  page: number;
  pageSize: number;
  total: number;
}

/** GET /vehicle-permits — paginated, filtered directory (permit roles). */
export function getVehiclePermitsList(
  page: number,
  pageSize: number,
  status?: string,
  vehicleType?: VehicleType,
  q?: string,
): Promise<VehiclePermitsListPage> {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));
  if (status) params.set('status', status);
  if (vehicleType) params.set('vehicleType', vehicleType);
  if (q && q.trim()) params.set('q', q.trim());
  return apiGetAuth<VehiclePermitsListPage>(
    `/vehicle-permits?${params.toString()}`,
  );
}

// ── Reports (admin only) ──────────────────────────────────────────────────────
export interface DailyStats {
  totalScans: number;
  approved: number;
  denied: number;
  visitorEntries: number;
  vehicleEntries: number;
}

export interface GateLogRow {
  id: string;
  occurredAt: string; // ISO timestamp
  gateName: string | null;
  result: 'GREEN' | 'RED';
  reason: string | null;
  subjectType: 'employee' | 'permit' | 'vehicle' | null;
  subjectName: string | null; // name only — never a sensitive id
  subjectOwnerName: string | null; // vehicle rows: the owner's name
  guardName: string | null;
}

export interface GateLogPage {
  items: GateLogRow[];
  page: number;
  pageSize: number;
  total: number;
}

export interface GateLogQuery {
  from?: string;
  to?: string;
  gateName?: string;
  result?: 'GREEN' | 'RED';
  page?: number;
  pageSize?: number;
}

/** GET /reports/daily-stats — five aggregate counters for today. */
export function getDailyStats(): Promise<DailyStats> {
  return apiGetAuth<DailyStats>('/reports/daily-stats');
}

/** GET /reports/gate-log — filtered, paginated gate-movement log. */
export function getGateLog(query: GateLogQuery): Promise<GateLogPage> {
  const params = new URLSearchParams();
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.gateName) params.set('gateName', query.gateName);
  if (query.result) params.set('result', query.result);
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  const qs = params.toString();
  return apiGetAuth<GateLogPage>(`/reports/gate-log${qs ? `?${qs}` : ''}`);
}

// ── Admin users (super-admin management) ──────────────────────────────────────
// Roles a super_admin may create (per the backend activation hierarchy — NOT another
// super_admin, and never 'employee', which has no user row).
export type AdminRole =
  | 'branch_head'
  | 'supervisor'
  | 'guard'
  | 'permit_officer'
  | 'hr'
  | 'department_manager'
  | 'hr_head';

export interface CreateAdminUserInput {
  username: string;
  role: AdminRole;
  password: string;
  fullName?: string;
}

/** POST /accounts/users — create an INACTIVE admin user. Returns its new id so the
 *  UI can activate it without a separate lookup. */
export function createAdminUser(
  input: CreateAdminUserInput,
): Promise<{ success: true; id: string }> {
  return apiPostAuth<{ success: true; id: string }>('/accounts/users', input);
}

/** POST /accounts/users/:id/activate — activate an admin user by its internal UUID. */
export function activateAdminUser(userId: string): Promise<{ success: true }> {
  return apiPostAuth<{ success: true }>(
    `/accounts/users/${encodeURIComponent(userId)}/activate`,
    {},
  );
}

/** POST /accounts/users/:id/deactivate — disable an admin user (super_admin/branch_head). */
export function deactivateAdminUser(userId: string): Promise<{ success: true }> {
  return apiPostAuth<{ success: true }>(
    `/accounts/users/${encodeURIComponent(userId)}/deactivate`,
    {},
  );
}

// ── Admin users directory (super-admin list) ──────────────────────────────────
// The users table can hold a super_admin (the seeded account), so the list role is
// broader than AdminRole (which is only the roles a super_admin may CREATE).
export type UserAccountRole =
  | 'super_admin'
  | 'branch_head'
  | 'supervisor'
  | 'guard'
  | 'permit_officer'
  | 'hr'
  | 'department_manager'
  | 'hr_head';

/** One row of GET /accounts/users — SAFE fields only (never a password hash). */
export interface UserListItem {
  id: string;
  username: string;
  role: UserAccountRole;
  fullName: string | null;
  isAccountActivated: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface UsersListPage {
  items: UserListItem[];
  page: number;
  pageSize: number;
  total: number;
}

/** GET /accounts/users — paginated, filtered admin-user directory (super_admin only). */
export function getUsersList(
  page: number,
  pageSize: number,
  role?: UserAccountRole,
  q?: string,
): Promise<UsersListPage> {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));
  if (role) params.set('role', role);
  if (q && q.trim()) params.set('q', q.trim());
  return apiGetAuth<UsersListPage>(`/accounts/users?${params.toString()}`);
}

// ── Gates (administration gate management) ────────────────────────────────────
export type GateDirection = 'in' | 'out' | 'both';

/** One gate as returned by the /gates endpoints. The list returns a bare array of
 *  these (no pagination wrapper) — gates are few, so the backend returns them all. */
export interface GateListItem {
  id: string;
  name: string;
  direction: GateDirection;
  supportsVehicles: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A guard-facing gate option for the station picker (active gates only, simplified). */
export interface GuardGateOption {
  id: string;
  name: string;
  direction: GateDirection;
  isActive: boolean;
}

export interface CreateGateInput {
  name: string;
  direction: GateDirection;
  supportsVehicles: boolean;
  isActive?: boolean;
}

/** GET /gates — the full gate directory (leadership roles). A plain array, newest-first. */
export function getGatesList(): Promise<GateListItem[]> {
  return apiGetAuth<GateListItem[]>('/gates');
}

// ── Guard station (Phase 4): the gate a guard is posted at ────────────────────
/** List the active gates a guard may pick as their station. Hits the GUARD route
 *  (/gate/gates), NOT the admin /gates (which 403s for guards). */
export function getGuardGates(): Promise<GuardGateOption[]> {
  return apiGetAuth<GuardGateOption[]>('/gate/gates');
}

/** Read the guard's currently-pinned station, or null if none is set. */
export function getMyGate(): Promise<GuardGateOption | null> {
  return apiGetAuth<GuardGateOption | null>('/gate/my-gate');
}

/** Pin the guard's current station (stored server-side in their session). */
export function setMyGate(gateId: string): Promise<{ success: true }> {
  return apiPutAuth<{ success: true }>('/gate/my-gate', { gateId });
}

/** POST /gates — create a gate. Returns the created gate. */
export function createGate(input: CreateGateInput): Promise<GateListItem> {
  return apiPostAuth<GateListItem>('/gates', input);
}

/** PATCH /gates/:id — partially update a gate (rename / direction / vehicles /
 *  activate-deactivate via isActive). Returns the updated gate. */
export function updateGate(
  id: string,
  patch: Partial<{
    name: string;
    direction: GateDirection;
    supportsVehicles: boolean;
    isActive: boolean;
  }>,
): Promise<GateListItem> {
  return apiPatchAuth<GateListItem>(`/gates/${encodeURIComponent(id)}`, patch);
}

// ── Employee gate access (Phase 3-c) ──────────────────────────────────────────
/** One gate an employee is authorised to pass — a row of
 *  GET /accounts/employees/:selfId/gates. */
export interface EmployeeGateRow {
  gateId: string;
  name: string;
  direction: GateDirection;
  isActive: boolean;
  assignedAt: string; // ISO timestamp of when the grant was made
}

/** GET /accounts/employees/:selfId/gates — the gates this employee may pass
 *  (PROTECTED: super_admin / branch_head). */
export function getEmployeeGates(selfId: string): Promise<EmployeeGateRow[]> {
  return apiGetAuth<EmployeeGateRow[]>(
    `/accounts/employees/${encodeURIComponent(selfId)}/gates`,
  );
}

/** PUT /accounts/employees/:selfId/gates — REPLACE the employee's authorised-gate
 *  set with gateIds ([] clears all). Idempotent (super_admin / branch_head). */
export function assignEmployeeGates(
  selfId: string,
  gateIds: string[],
): Promise<{ success: true }> {
  return apiPutAuth<{ success: true }>(
    `/accounts/employees/${encodeURIComponent(selfId)}/gates`,
    { gateIds },
  );
}

// ── Employees directory (admin list) ─────────────────────────────────────────
export type EmployeeDisplayStatus = 'active' | 'banned' | 'inactive';
export type EmployeeRawStatus =
  | 'pending'
  | 'active'
  | 'suspended'
  | 'terminated';

/** One row of GET /accounts/employees — SAFE fields only (no military id/hash). */
export interface EmployeeListItem {
  selfId: string;
  fullName: string;
  personnelType: 'civilian' | 'military';
  displayStatus: EmployeeDisplayStatus; // مفعّل / محظور / غير مفعّل
  status: EmployeeRawStatus; // raw lifecycle status
  commandDepartment: string | null;
  branch: string | null;
  createdAt: string;
}

export interface EmployeesListPage {
  items: EmployeeListItem[];
  page: number;
  pageSize: number;
  total: number;
}

/** GET /accounts/employees — paginated, filtered directory (admin/hr roles). */
export function getEmployeesList(
  page: number,
  pageSize: number,
  status?: EmployeeDisplayStatus,
  q?: string,
): Promise<EmployeesListPage> {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));
  if (status) params.set('status', status);
  if (q && q.trim()) params.set('q', q.trim());
  return apiGetAuth<EmployeesListPage>(
    `/accounts/employees?${params.toString()}`,
  );
}

// ── Employee barcode export (Phase 3-b) ───────────────────────────────────────
/** One SAFE export row from GET /accounts/employees/export-barcodes — name + branch
 *  + barcode token. barcodeToken is null for a not-yet-activated employee. */
export interface EmployeeBarcodeExportRow {
  selfId: string;
  fullName: string;
  branch: string | null;
  barcodeToken: string | null;
}

/** GET /accounts/employees/export-barcodes — PROTECTED (super_admin / branch_head /
 *  supervisor / hr). Returns ALL employees matching the same status/name filters as
 *  the directory, each with their barcode token, for the client-side Excel export. */
export function exportEmployeesBarcodes(
  status?: string,
  q?: string,
): Promise<EmployeeBarcodeExportRow[]> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (q && q.trim()) params.set('q', q.trim());
  const qs = params.toString();
  return apiGetAuth<EmployeeBarcodeExportRow[]>(
    `/accounts/employees/export-barcodes${qs ? `?${qs}` : ''}`,
  );
}

// ── Bulk employee import + activation ─────────────────────────────────────────
export interface BulkEmployeeItem {
  selfId: string;
  fullName: string;
  personnelType: 'civilian' | 'military';
  phone: string;
  militaryId?: string;
  commandDepartment?: string;
  branch?: string;
  rank?: string;
  currentJobTitle?: string;
  priority?: string;
}

export interface BulkCreateReport {
  created: number;
  failed: { index: number; selfId: string | null; reason: string }[];
  createdItems: { selfId: string; fullName: string }[];
}

export interface BulkActivateReport {
  activated: number;
  failed: { selfId: string; reason: string }[];
}

/** POST /accounts/employees/bulk — create many employees; returns a per-row report. */
export function bulkCreateEmployees(
  items: BulkEmployeeItem[],
): Promise<BulkCreateReport> {
  return apiPostAuth<BulkCreateReport>('/accounts/employees/bulk', { items });
}

/** POST /accounts/employees/bulk-activate — activate many by self id; returns a report. */
export function bulkActivateEmployees(
  selfIds: string[],
): Promise<BulkActivateReport> {
  return apiPostAuth<BulkActivateReport>('/accounts/employees/bulk-activate', {
    selfIds,
  });
}

// ── Employee service exit (separate from the ban) ─────────────────────────────
/** The non-active (exit) service statuses; 'active' is restored via service-restore. */
export type ServiceExitStatus = 'transferred' | 'discharged' | 'contract_ended';

export interface ServiceExitInput {
  serviceStatus: ServiceExitStatus;
  exitDate: string; // YYYY-MM-DD (may be in the past; the backend rejects a future date)
  note?: string;
}

/** POST /accounts/employees/:selfId/service-exit — record an exit from service
 *  (super_admin/branch_head/hr). The backend checks the type match (discharged→military,
 *  contract_ended→civilian) and rejects a future exit date, returning a stable code. */
export function recordServiceExit(
  selfId: string,
  input: ServiceExitInput,
): Promise<{ success: true }> {
  return apiPostAuth<{ success: true }>(
    `/accounts/employees/${encodeURIComponent(selfId)}/service-exit`,
    input,
  );
}

/** POST /accounts/employees/:selfId/service-restore — return an employee to active service. */
export function restoreEmployeeService(
  selfId: string,
): Promise<{ success: true }> {
  return apiPostAuth<{ success: true }>(
    `/accounts/employees/${encodeURIComponent(selfId)}/service-restore`,
    {},
  );
}

/** Reads the `role` claim from a JWT WITHOUT verifying it — for display only. */
export function decodeTokenRole(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const data = JSON.parse(atob(b64 + pad)) as { role?: unknown };
    return typeof data.role === 'string' ? data.role : null;
  } catch {
    return null;
  }
}

/** Map an ApiError to a clear Arabic message for PROTECTED calls (session context). */
export function describeApiError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return 'تعذّر الاتصال بالخادم. تأكّد من تشغيل الخلفية.';
    if (err.status === 429)
      return 'محاولات كثيرة جدًّا — الرجاء المحاولة بعد قليل.';
    if (err.status === 401)
      return 'انتهت الجلسة أو التوكن غير صالح — يُرجى إعادة تسجيل الدخول.';
    if (err.status === 403) return 'لا تملك صلاحية الوصول إلى هذا المورد.';
    if (err.status === 400) return 'طلب غير صالح.';
    return 'تعذّر تنفيذ الطلب. حاول مرة أخرى.';
  }
  return 'حدث خطأ غير متوقّع.';
}
