/**
 * A subpath of its own, apart from the package's main entry, so that it loads
 * with what uses it and never with Studio's first screen.
 */
export { auditRegion, type AuditReport } from './audit';
export { readStyles } from './cascade';
export type { Candidate, Explanation, MatchedRule, Styles } from './cascade';
export { elementPath } from './element-path';
export { frameInPage } from './paint';
export { ruleLines } from './rule-lines';
