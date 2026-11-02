/**
 * Status page — service status + incident lifecycle.
 *
 * Tracks the operational status of 7 service components and the
 * lifecycle of incidents that affect them. The status page is the
 * public-facing "is BillLens up?" view.
 *
 * Components (7):
 *   1. mobile_app            — the React Native / Expo app.
 *   2. web_app               — the web dashboard.
 *   3. api                   — the Supabase + edge functions API.
 *   4. database              — the PostgreSQL database.
 *   5. ocr_service           — the third-party OCR provider.
 *   6. push_notifications    — APNs + FCM.
 *   7. email_delivery        — the transactional email provider.
 *
 * Component statuses (5):
 *   - operational        — the component is fully functional.
 *   - degraded_performance — the component is slow but usable.
 *   - partial_outage     — the component is partially unavailable.
 *   - major_outage       — the component is fully unavailable.
 *   - maintenance        — the component is under planned maintenance.
 *
 * Incident lifecycle: identified → investigating → monitoring →
 *   resolved → postmortem.
 *
 * See `docs/customer-support-operations.md`.
 */

// ---------------------------------------------------------------------------
// Components (7)
// ---------------------------------------------------------------------------

export type ServiceComponent =
  | 'mobile_app'
  | 'web_app'
  | 'api'
  | 'database'
  | 'ocr_service'
  | 'push_notifications'
  | 'email_delivery';

export const SERVICE_COMPONENTS: readonly ServiceComponent[] = [
  'mobile_app',
  'web_app',
  'api',
  'database',
  'ocr_service',
  'push_notifications',
  'email_delivery',
] as const;

export function isServiceComponent(value: unknown): value is ServiceComponent {
  return (
    typeof value === 'string' &&
    (SERVICE_COMPONENTS as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Component statuses (5)
// ---------------------------------------------------------------------------

export type ComponentStatus =
  | 'operational'
  | 'degraded_performance'
  | 'partial_outage'
  | 'major_outage'
  | 'maintenance';

export const COMPONENT_STATUSES: readonly ComponentStatus[] = [
  'operational',
  'degraded_performance',
  'partial_outage',
  'major_outage',
  'maintenance',
] as const;

export function isComponentStatus(value: unknown): value is ComponentStatus {
  return (
    typeof value === 'string' &&
    (COMPONENT_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Whether a status represents an active issue (i.e. not `operational`
 * or `maintenance`).
 */
export function isIssueStatus(status: ComponentStatus): boolean {
  return (
    status === 'degraded_performance' ||
    status === 'partial_outage' ||
    status === 'major_outage'
  );
}

// ---------------------------------------------------------------------------
// Component state
// ---------------------------------------------------------------------------

export interface ComponentState {
  readonly component: ServiceComponent;
  readonly status: ComponentStatus;
  readonly updatedAt: string;
}

export function createComponentState(
  component: ServiceComponent,
  status: ComponentStatus,
  updatedAt: string,
): ComponentState {
  if (!isServiceComponent(component)) {
    throw new Error(`Unknown service component: ${component}`);
  }
  if (!isComponentStatus(status)) {
    throw new Error(`Unknown component status: ${status}`);
  }
  if (Number.isNaN(Date.parse(updatedAt))) {
    throw new Error('updatedAt must be a valid ISO date-time');
  }
  return Object.freeze({ component, status, updatedAt });
}

// ---------------------------------------------------------------------------
// Incident lifecycle
// ---------------------------------------------------------------------------

export type IncidentStatus =
  | 'identified'
  | 'investigating'
  | 'monitoring'
  | 'resolved'
  | 'postmortem';

export const INCIDENT_STATUSES: readonly IncidentStatus[] = [
  'identified',
  'investigating',
  'monitoring',
  'resolved',
  'postmortem',
] as const;

export function isIncidentStatus(value: unknown): value is IncidentStatus {
  return (
    typeof value === 'string' &&
    (INCIDENT_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Allowed incident status transitions.
 *
 *   identified → investigating | resolved
 *   investigating → monitoring | resolved
 *   monitoring → resolved | investigating
 *   resolved → postmortem
 *   postmortem → (terminal)
 */
const INCIDENT_TRANSITIONS: Readonly<Record<IncidentStatus, readonly IncidentStatus[]>> = Object.freeze({
  identified: ['investigating', 'resolved'],
  investigating: ['monitoring', 'resolved'],
  monitoring: ['resolved', 'investigating'],
  resolved: ['postmortem'],
  postmortem: [],
});

export function canTransitionIncident(from: IncidentStatus, to: IncidentStatus): boolean {
  const allowed = INCIDENT_TRANSITIONS[from];
  return allowed !== undefined && (allowed as readonly string[]).includes(to);
}

// ---------------------------------------------------------------------------
// Incident entity
// ---------------------------------------------------------------------------

export interface StatusIncident {
  /** Stable identifier (UUID). */
  readonly id: string;
  /** Human-readable title (no PII). */
  readonly title: string;
  /** Detailed description (no PII). */
  readonly description: string;
  /** Affected components. */
  readonly affectedComponents: readonly ServiceComponent[];
  /** Current lifecycle status. */
  readonly status: IncidentStatus;
  /** Severity (1=minor, 2=major, 3=critical). */
  readonly severity: 1 | 2 | 3;
  /** ISO date-time the incident was identified. */
  readonly identifiedAt: string;
  /** ISO date-time the incident was resolved, or null. */
  readonly resolvedAt: string | null;
  /** Updates timeline (each entry: timestamp + message). */
  readonly updates: readonly IncidentUpdate[];
}

export interface IncidentUpdate {
  /** ISO date-time of the update. */
  readonly at: string;
  /** Author (admin ID or 'system'). */
  readonly author: string;
  /** Update message (no PII). */
  readonly message: string;
  /** Status at the time of the update. */
  readonly status: IncidentStatus;
}

export interface StatusIncidentInput {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly affectedComponents: readonly ServiceComponent[];
  readonly status?: IncidentStatus;
  readonly severity: 1 | 2 | 3;
  readonly identifiedAt: string;
  readonly resolvedAt?: string | null;
  readonly updates?: readonly IncidentUpdate[];
}

export function createIncident(input: StatusIncidentInput): StatusIncident {
  if (input.id.trim().length === 0) throw new Error('Incident id must not be empty');
  if (input.title.trim().length === 0) throw new Error('Incident title must not be empty');
  if (input.description.trim().length === 0) {
    throw new Error('Incident description must not be empty');
  }
  if (input.affectedComponents.length === 0) {
    throw new Error('Incident must affect at least one component');
  }
  for (const c of input.affectedComponents) {
    if (!isServiceComponent(c)) {
      throw new Error(`Unknown service component: ${c}`);
    }
  }
  if (!isIncidentStatus(input.status ?? 'identified')) {
    throw new Error(`Unknown incident status: ${input.status ?? 'identified'}`);
  }
  if (input.severity !== 1 && input.severity !== 2 && input.severity !== 3) {
    throw new Error(`Severity must be 1, 2, or 3, got ${input.severity}`);
  }
  if (Number.isNaN(Date.parse(input.identifiedAt))) {
    throw new Error('identifiedAt must be a valid ISO date-time');
  }
  return Object.freeze({
    id: input.id,
    title: input.title,
    description: input.description,
    affectedComponents: Object.freeze([...input.affectedComponents]),
    status: input.status ?? 'identified',
    severity: input.severity,
    identifiedAt: input.identifiedAt,
    resolvedAt: input.resolvedAt ?? null,
    updates: Object.freeze([...(input.updates ?? [])]),
  });
}

/**
 * Transition an incident to a new status. Appends an update entry to
 * the timeline. When transitioning to `resolved`, sets `resolvedAt`.
 */
export function transitionIncident(
  incident: StatusIncident,
  to: IncidentStatus,
  message: string,
  author: string,
  nowIso: string,
): StatusIncident {
  if (!canTransitionIncident(incident.status, to)) {
    throw new Error(`Illegal incident transition: ${incident.status} → ${to}`);
  }
  if (message.trim().length === 0) {
    throw new Error('Incident update message must not be empty');
  }
  if (author.trim().length === 0) {
    throw new Error('Incident update author must not be empty');
  }
  if (Number.isNaN(Date.parse(nowIso))) {
    throw new Error('nowIso must be a valid ISO date-time');
  }
  const update: IncidentUpdate = Object.freeze({
    at: nowIso,
    author,
    message,
    status: to,
  });
  return Object.freeze({
    ...incident,
    status: to,
    resolvedAt: to === 'resolved' ? nowIso : incident.resolvedAt,
    updates: Object.freeze([...incident.updates, update]),
  });
}

// ---------------------------------------------------------------------------
// Status page snapshot
// ---------------------------------------------------------------------------

export interface StatusPageSnapshot {
  readonly generatedAt: string;
  readonly components: readonly ComponentState[];
  readonly activeIncidents: readonly StatusIncident[];
  readonly overallStatus: 'operational' | 'partial_outage' | 'major_outage';
}

/**
 * Compute the overall status of the system from the component states
 * + active incidents.
 *
 *   - `major_outage` — any component is in `major_outage` OR there is
 *     an active incident with severity 3.
 *   - `partial_outage` — any component is in `partial_outage` or
 *     `degraded_performance`, OR there is an active incident with
 *     severity 1 or 2.
 *   - `operational` — all components are `operational` (or under
 *     planned `maintenance`) and there are no active incidents.
 */
export function computeOverallStatus(
  components: readonly ComponentState[],
  activeIncidents: readonly StatusIncident[],
): 'operational' | 'partial_outage' | 'major_outage' {
  for (const c of components) {
    if (c.status === 'major_outage') return 'major_outage';
  }
  for (const inc of activeIncidents) {
    if (inc.severity === 3) return 'major_outage';
  }
  for (const c of components) {
    if (c.status === 'partial_outage' || c.status === 'degraded_performance') {
      return 'partial_outage';
    }
  }
  for (const inc of activeIncidents) {
    if (inc.severity === 1 || inc.severity === 2) return 'partial_outage';
  }
  return 'operational';
}

/**
 * Build a status page snapshot. `activeIncidents` are filtered to
 * those that are not yet `resolved` or `postmortem`.
 */
export function buildStatusPageSnapshot(
  components: readonly ComponentState[],
  incidents: readonly StatusIncident[],
  nowIso: string,
): StatusPageSnapshot {
  if (Number.isNaN(Date.parse(nowIso))) {
    throw new Error('nowIso must be a valid ISO date-time');
  }
  const active = incidents.filter(
    (i) => i.status !== 'resolved' && i.status !== 'postmortem',
  );
  const overallStatus = computeOverallStatus(components, active);
  return Object.freeze({
    generatedAt: nowIso,
    components: Object.freeze([...components]),
    activeIncidents: Object.freeze([...active]),
    overallStatus,
  });
}
