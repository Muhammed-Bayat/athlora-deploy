-- Measured field events: Long jump, triple jump, shot put, discus, javelin, and hammer.
INSERT INTO discipline_definitions (code, version, kind, unit, direction, default_rules, precision, presentation, source)
VALUES
  ('triple_jump', 1, 'field', 'metres', 'higher', '{"aggregation":"best","entrantType":"individual","attempts":6}', 2, '{"label":"Triple jump","unitLabel":"m"}', '0030_measured_field'),
  ('shot_put', 1, 'field', 'metres', 'higher', '{"aggregation":"best","entrantType":"individual","attempts":6}', 2, '{"label":"Shot put","unitLabel":"m"}', '0030_measured_field'),
  ('discus', 1, 'field', 'metres', 'higher', '{"aggregation":"best","entrantType":"individual","attempts":6}', 2, '{"label":"Discus throw","unitLabel":"m"}', '0030_measured_field'),
  ('javelin', 1, 'field', 'metres', 'higher', '{"aggregation":"best","entrantType":"individual","attempts":6}', 2, '{"label":"Javelin throw","unitLabel":"m"}', '0030_measured_field'),
  ('hammer', 1, 'field', 'metres', 'higher', '{"aggregation":"best","entrantType":"individual","attempts":6}', 2, '{"label":"Hammer throw","unitLabel":"m"}', '0030_measured_field');
