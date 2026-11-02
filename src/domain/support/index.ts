/**
 * Barrel for the support domain module.
 */

export {
  DEFAULT_TICKET_VERSION,
  TICKET_BODY_MAX_LENGTH,
  TICKET_SUBJECT_MAX_LENGTH,
  TICKET_CHANNELS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TRANSITIONS,
  assignTicket,
  canTransitionTicket,
  createTicket,
  isTicketChannel,
  isTicketPriority,
  isTicketStatus,
  recordCsat,
  transitionTicket,
  type SupportTicket,
  type SupportTicketInput,
  type TicketChannel,
  type TicketPriority,
  type TicketStatus,
} from './ticket-model';

export {
  DEFAULT_AT_RISK_FRACTION,
  MS_PER_HOUR,
  SLA_POLICY_LIST,
  SLA_POLICIES,
  computeSlaCompliance,
  computeSlaStatus,
  getSlaPolicy,
  type SlaComplianceSummary,
  type SlaPolicy,
  type SlaStatus,
  type SlaStatusResult,
} from './sla-policy';

export {
  ALWAYS_SENSITIVE_TYPES,
  AUDIT_REQUIRED_TYPES,
  SENSITIVE_DATA_TYPES,
  evaluateDataAccess,
  evaluateDataAccessBatch,
  isAlwaysSensitiveType,
  isSensitiveDataType,
  requiresAuditTrail,
  validateDataAccessRequest,
  type DataAccessBatchResult,
  type DataAccessDecision,
  type DataAccessRequest,
  type SensitiveDataType,
} from './data-access-guard';

export {
  accessCountByDataType,
  createAuditEntry,
  getAccessHistory,
  getAdminAccessHistory,
  type CreateAuditEntryInput,
  type DataAccessAuditEntry,
} from './audit-trail';

export {
  ARTICLE_BODY_MAX_LENGTH,
  ARTICLE_MAX_TAG_LENGTH,
  ARTICLE_MAX_TAGS,
  ARTICLE_STATUSES,
  ARTICLE_TITLE_MAX_LENGTH,
  canTransitionArticle,
  createArticle,
  helpfulnessRatio,
  isArticleStatus,
  listArticlesByCategory,
  markArticleHelpful,
  markArticleUnhelpful,
  searchArticles,
  transitionArticle,
  type ArticleSearchResult,
  type ArticleStatus,
  type KnowledgeArticle,
  type KnowledgeArticleInput,
} from './knowledge-base';

export {
  COMPONENT_STATUSES,
  INCIDENT_STATUSES,
  SERVICE_COMPONENTS,
  buildStatusPageSnapshot,
  canTransitionIncident,
  computeOverallStatus,
  createComponentState,
  createIncident,
  isComponentStatus,
  isIncidentStatus,
  isIssueStatus,
  isServiceComponent,
  transitionIncident,
  type ComponentState,
  type ComponentStatus,
  type IncidentStatus,
  type IncidentUpdate,
  type ServiceComponent,
  type StatusIncident,
  type StatusIncidentInput,
  type StatusPageSnapshot,
} from './status-page';

export {
  computeSupportAnalytics,
  isCsatResponseRateLow,
  topTrendingCategories,
  type SupportAnalyticsReport,
  type TicketSummary,
  type TrendingCategory,
} from './support-analytics';
