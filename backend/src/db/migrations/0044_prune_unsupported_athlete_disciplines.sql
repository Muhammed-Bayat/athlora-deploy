-- Prune athlete discipline preferences for retired catalogue codes (e.g. 4x400m,
-- hammer throw). discipline_definitions rows stay for historical foreign keys;
-- current Athlora surfaces expose only the supported catalogue.
DELETE FROM athlete_preferred_disciplines preferences
 USING discipline_definitions definitions
 WHERE definitions.id = preferences.discipline_definition_id
   AND definitions.code NOT IN (
     '100m', '200m', '400m', '800m', '1500m', '100mh', '400mh',
     '4x100m', 'high_jump', 'long_jump', 'triple_jump',
     'javelin', 'discus', 'shot_put'
   );
