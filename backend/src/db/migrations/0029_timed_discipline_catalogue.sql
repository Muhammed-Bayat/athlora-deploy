-- Timed discipline catalogue entries for sprint, middle distance, long distance, hurdles, steeplechase, and race walk.
INSERT INTO discipline_definitions (code, version, kind, unit, direction, default_rules, precision, presentation, source)
VALUES
  ('200m', 1, 'track', 'seconds', 'lower', '{"aggregation":"timed","entrantType":"individual","distance":200}', 2, '{"label":"200m","unitLabel":"s"}', '0029_timed_catalogue'),
  ('400m', 1, 'track', 'seconds', 'lower', '{"aggregation":"timed","entrantType":"individual","distance":400}', 2, '{"label":"400m","unitLabel":"s"}', '0029_timed_catalogue'),
  ('800m', 1, 'track', 'seconds', 'lower', '{"aggregation":"timed","entrantType":"individual","distance":800}', 2, '{"label":"800m","unitLabel":"s"}', '0029_timed_catalogue'),
  ('1500m', 1, 'track', 'seconds', 'lower', '{"aggregation":"timed","entrantType":"individual","distance":1500},', 2, '{"label":"1500m","unitLabel":"s"}', '0029_timed_catalogue'),
  ('5000m', 1, 'track', 'seconds', 'lower', '{"aggregation":"timed","entrantType":"individual","distance":5000}', 1, '{"label":"5000m","unitLabel":"s"}', '0029_timed_catalogue'),
  ('10000m', 1, 'track', 'seconds', 'lower', '{"aggregation":"timed","entrantType":"individual","distance":10000}', 1, '{"label":"10000m","unitLabel":"s"}', '0029_timed_catalogue'),
  ('110mh', 1, 'track', 'seconds', 'lower', '{"aggregation":"timed","entrantType":"individual","distance":110,"hurdleHeight":1.067,"hurdleCount":10}', 2, '{"label":"110m Hurdles","unitLabel":"s"}', '0029_timed_catalogue'),
  ('100mh', 1, 'track', 'seconds', 'lower', '{"aggregation":"timed","entrantType":"individual","distance":100,"hurdleHeight":0.838,"hurdleCount":10}', 2, '{"label":"100m Hurdles","unitLabel":"s"}', '0029_timed_catalogue'),
  ('400mh', 1, 'track', 'seconds', 'lower', '{"aggregation":"timed","entrantType":"individual","distance":400,"hurdleHeight":0.914,"hurdleCount":10}', 2, '{"label":"400m Hurdles","unitLabel":"s"}', '0029_timed_catalogue'),
  ('3000msc', 1, 'track', 'seconds', 'lower', '{"aggregation":"timed","entrantType":"individual","distance":3000,"steeplechase":true}', 2, '{"label":"3000m Steeplechase","unitLabel":"s"}', '0029_timed_catalogue'),
  ('5000mw', 1, 'track', 'seconds', 'lower', '{"aggregation":"timed","entrantType":"individual","distance":5000,"raceWalk":true}', 1, '{"label":"5000m Race Walk","unitLabel":"s"}', '0029_timed_catalogue');
