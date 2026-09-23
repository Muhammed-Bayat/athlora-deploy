// Shared by disposable-database integration suites; DROP ... CASCADE drops FKs,
// not dependent tables, so every additive meet table must be explicitly removed.
export const MEET_TEST_TABLES = [
  'meet_domain_audit', 'session_results', 'session_timeline_entries', 'session_entrants',
  'relay_members', 'meet_entrants', 'discipline_sessions', 'discipline_definitions',
];
