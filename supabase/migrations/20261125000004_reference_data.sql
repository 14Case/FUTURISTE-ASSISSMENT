-- =============================================================================
-- FUTURISTE ASSESSMENT — Données de référence (GÉNÉRÉ — ne pas éditer à la main)
-- Source : src/lib/scoring/default-catalog.ts — commande : npm run db:generate-seed
-- =============================================================================
-- Contient uniquement de la configuration réelle fournie par le club :
-- domaines, catégories, saison, tests, protocoles, barèmes initiaux (v1) et la
-- session du 28/11/2026. AUCUN joueur, AUCUN score.
-- Les mesures chronométrées / distances / volumes n'ont PAS de seuils :
-- ils doivent être configurés par l'administrateur (module Barèmes).
-- =============================================================================

insert into public.assessment_domains (code, label, max_points, sort_order, description) values
  ('athletic', 'Compétences athlétiques', 40, 1, 'Vitesse, agilité, coordination, réaction, explosivité.'),
  ('technical', 'Compétences techniques', 30, 2, 'Passes, contrôle orienté, conduite et dribble, finition.'),
  ('physical', 'Capacités physiques', 10, 3, 'Endurance à effort contrôlé.'),
  ('game_intelligence', 'Intelligence de jeu', 15, 4, 'Compréhension et lecture du jeu en mini-matchs.'),
  ('team_spirit', 'Esprit d''équipe', 5, 5, 'Attitude collective observée durant l''ensemble des tests.')
on conflict (code) do nothing;

insert into public.assessment_categories (code, label, min_age, max_age, sort_order) values
  ('U6-U9', 'U6–U9', 6, 9, 1),
  ('U10-U13', 'U10–U13', 10, 13, 2),
  ('U14-U16', 'U14–U16', 14, 16, 3)
on conflict (code) do nothing;

insert into public.seasons (label, start_date, end_date)
values ('2026-2027', '2026-09-01', '2027-08-31')
on conflict (label) do nothing;

insert into public.club_settings (id, parent_message_template, current_season_id)
values (1, 'Bonjour,

FUTURISTE ACADÉMIE FC vous transmet le rapport individuel d''évaluation de votre enfant, réalisé lors du Test d''Aptitude de la saison {saison}.

Ce rapport présente ses résultats athlétiques, techniques, physiques, de compréhension du jeu et d''esprit d''équipe, ainsi que les principaux axes de progression identifiés.

Nous vous remercions pour votre confiance et votre engagement dans le développement sportif de votre enfant.

FUTURISTE ACADÉMIE FC
Former, développer et révéler les talents.', (select id from public.seasons where label = '2026-2027'))
on conflict (id) do nothing;

insert into public.assessment_tests (code, name, domain, max_points, description, instructions, sort_order) values
  ('A1', 'Sprint', 'athletic', 10, 'Vitesse de course linéaire sur distance adaptée à l''âge.', 'Départ arrêté derrière la ligne, sans élan. Chronométrer du premier mouvement au franchissement de la ligne d''arrivée. 2 tentatives, récupération complète entre les essais. Le meilleur temps est retenu.', 1),
  ('A2', 'Agilité', 'athletic', 10, 'Parcours en zigzag entre cônes : vitesse et changements de direction.', 'Parcours en zigzag. 2 tentatives, meilleur temps retenu. Observer la qualité des appuis et des changements de direction (abaissement du centre de gravité, orientation du corps, relance).', 2),
  ('A3', 'Coordination', 'athletic', 8, 'Échelle de coordination : vitesse d''exécution, précision et fluidité.', 'Exercice d''échelle de coordination défini pour la session (pas simples, pas latéraux, entrées-sorties…). Chronométrer l''exécution et observer la précision des appuis (aucun barreau touché), la fluidité et la coordination bras-jambes.', 3),
  ('A4', 'Réaction', 'athletic', 6, 'Réaction à un signal et déplacement vers la direction indiquée.', 'Au signal (visuel ou sonore), le joueur se déplace vers la direction indiquée. 4 essais. Noter la rapidité de réaction et compter le nombre d''essais où la bonne direction est prise et le déplacement correctement réalisé.', 4),
  ('A5', 'Explosivité', 'athletic', 6, 'Saut en longueur sans élan.', 'Pieds joints derrière la ligne, sans élan. Mesurer du bord de la ligne au talon le plus proche à la réception. 2 tentatives, meilleure distance retenue. Observer l''impulsion des bras, l''extension et la stabilité de la réception.', 5),
  ('T1', 'Passes', 'technical', 8, 'Précision et qualité de transmission sur 10 passes.', '10 passes vers une cible (porte de cônes ou partenaire), 5 par pied lorsque le niveau le permet. Compter les passes réussies dans la cible. Observer la surface de contact, le dosage et la tension de la passe.', 6),
  ('T2', 'Contrôle orienté', 'technical', 6, 'Qualité du contrôle et orientation de la première touche.', '8 répétitions : réception d''un ballon transmis et contrôle orienté vers une porte indiquée. Observer la qualité de l''amorti et l''orientation / la vitesse de la première touche.', 7),
  ('T3', 'Conduite et dribble', 'technical', 8, 'Slalom balle au pied : vitesse et maîtrise.', 'Slalom entre les cônes balle au pied, aller-retour selon le protocole. 2 tentatives, meilleur temps retenu. Observer la maîtrise, la précision, l''équilibre et l''utilisation des deux pieds.', 8),
  ('T4', 'Finition', 'technical', 8, 'Précision et qualité de frappe sur 8 tirs.', '8 tirs vers le but (zones cibles selon le protocole de la session). Compter les tirs cadrés dans la cible. Observer la qualité de frappe : pied d''appui, surface de contact, équilibre et puissance contrôlée.', 9),
  ('P1', 'Endurance', 'physical', 10, 'Navettes à effort contrôlé sur durée adaptée à l''âge.', 'Allers-retours entre deux lignes à allure contrôlée pendant la durée prévue. Compter le nombre de longueurs (navettes) réalisées. Observer le maintien du rythme et la qualité de déplacement. Arrêter immédiatement en cas de signe de malaise.', 10),
  ('I1', 'Mini-matchs', 'game_intelligence', 15, 'Observation de la compréhension du jeu en situation réduite.', 'Mini-matchs au format adapté. Chaque encadreur observe un groupe restreint de joueurs. Noter chaque critère selon la grille et ajouter un commentaire factuel.', 11),
  ('E1', 'Esprit d''équipe', 'team_spirit', 5, 'Observation durant l''ensemble des tests, en particulier les mini-matchs. Ne pas confondre communication verbale et esprit d''équipe.', 'Évaluer des comportements observés, pas la personnalité ni l''aisance verbale. Un joueur discret peut faire preuve d''un excellent esprit d''équipe.', 12)
on conflict (code) do nothing;

insert into public.test_age_rules (test_id, category_id, protocol, protocol_text)
select t.id, c.id, v.protocol, v.protocol_text
from (values
  ('A1', 'U6-U9', $json${"distance_m":10,"attempts":2}$json$::jsonb, '10 m — 2 tentatives — meilleur temps'),
  ('A1', 'U10-U13', $json${"distance_m":20,"attempts":2}$json$::jsonb, '20 m — 2 tentatives — meilleur temps'),
  ('A1', 'U14-U16', $json${"distance_m":30,"attempts":2}$json$::jsonb, '30 m — 2 tentatives — meilleur temps'),
  ('A2', 'U6-U9', $json${"cones":4,"spacing_m":"3–4","attempts":2}$json$::jsonb, '4 cônes — 3 à 4 m entre les cônes — 2 tentatives'),
  ('A2', 'U10-U13', $json${"cones":5,"spacing_m":5,"attempts":2}$json$::jsonb, '5 cônes — 5 m — 2 tentatives'),
  ('A2', 'U14-U16', $json${"cones":5,"spacing_m":5,"attempts":2}$json$::jsonb, '5 cônes — 5 m — 2 tentatives'),
  ('A3', 'U6-U9', $json${"exercise":"Échelle — 1 appui par case","attempts":2}$json$::jsonb, 'Échelle de coordination — exercice simple — 2 tentatives'),
  ('A3', 'U10-U13', $json${"exercise":"Échelle — 2 appuis par case + latéral","attempts":2}$json$::jsonb, 'Échelle de coordination — exercice intermédiaire — 2 tentatives'),
  ('A3', 'U14-U16', $json${"exercise":"Échelle — entrées/sorties","attempts":2}$json$::jsonb, 'Échelle de coordination — exercice avancé — 2 tentatives'),
  ('A4', 'U6-U9', $json${"distance_m":3,"trials":4}$json$::jsonb, 'Déplacement de 3 m — 4 essais'),
  ('A4', 'U10-U13', $json${"distance_m":5,"trials":4}$json$::jsonb, 'Déplacement de 5 m — 4 essais'),
  ('A4', 'U14-U16', $json${"distance_m":"5–7","trials":4}$json$::jsonb, 'Déplacement de 5 à 7 m — 4 essais'),
  ('A5', 'U6-U9', $json${"attempts":2}$json$::jsonb, 'Saut sans élan — 2 tentatives — meilleure distance'),
  ('A5', 'U10-U13', $json${"attempts":2}$json$::jsonb, 'Saut sans élan — 2 tentatives — meilleure distance'),
  ('A5', 'U14-U16', $json${"attempts":2}$json$::jsonb, 'Saut sans élan — 2 tentatives — meilleure distance'),
  ('T1', 'U6-U9', $json${"passes":10,"distance_m":"4–5","per_foot":"si adapté"}$json$::jsonb, '10 passes — 4 à 5 m — 5 par pied si adapté'),
  ('T1', 'U10-U13', $json${"passes":10,"distance_m":"6–8","per_foot":5}$json$::jsonb, '10 passes — 6 à 8 m — 5 par pied'),
  ('T1', 'U14-U16', $json${"passes":10,"distance_m":"8–10","per_foot":5}$json$::jsonb, '10 passes — 8 à 10 m — 5 par pied'),
  ('T2', 'U6-U9', $json${"repetitions":8}$json$::jsonb, '8 répétitions — ballon à la main ou au sol'),
  ('T2', 'U10-U13', $json${"repetitions":8}$json$::jsonb, '8 répétitions — passe au sol'),
  ('T2', 'U14-U16', $json${"repetitions":8}$json$::jsonb, '8 répétitions — passe au sol et aérienne'),
  ('T3', 'U6-U9', $json${"cones":5,"spacing_m":2.5,"attempts":2}$json$::jsonb, '5 cônes — 2,5 m — 2 tentatives'),
  ('T3', 'U10-U13', $json${"cones":6,"spacing_m":3,"attempts":2}$json$::jsonb, '6 cônes — 3 m — 2 tentatives'),
  ('T3', 'U14-U16', $json${"cones":6,"spacing_m":3,"attempts":2}$json$::jsonb, '6 cônes — 3 m — 2 tentatives'),
  ('T4', 'U6-U9', $json${"shots":8,"distance_m":"5–7"}$json$::jsonb, '8 tirs — 5 à 7 m'),
  ('T4', 'U10-U13', $json${"shots":8,"distance_m":"8–10"}$json$::jsonb, '8 tirs — 8 à 10 m'),
  ('T4', 'U14-U16', $json${"shots":8,"distance_m":"10–14"}$json$::jsonb, '8 tirs — 10 à 14 m'),
  ('P1', 'U6-U9', $json${"line_distance_m":10,"duration_min":3}$json$::jsonb, '10 m entre les lignes — 3 minutes'),
  ('P1', 'U10-U13', $json${"line_distance_m":15,"duration_min":4}$json$::jsonb, '15 m entre les lignes — 4 minutes'),
  ('P1', 'U14-U16', $json${"line_distance_m":20,"duration_min":5}$json$::jsonb, '20 m entre les lignes — 5 minutes'),
  ('I1', 'U6-U9', $json${"format":"3c3 ou 4c4","matches":2,"duration_min":5}$json$::jsonb, '3 contre 3 ou 4 contre 4 — 2 matchs de 5 min'),
  ('I1', 'U10-U13', $json${"format":"4c4 ou 5c5","matches":2,"duration_min":7}$json$::jsonb, '4 contre 4 ou 5 contre 5 — 2 matchs de 7 min'),
  ('I1', 'U14-U16', $json${"format":"5c5 ou 6c6","matches":2,"duration_min":8}$json$::jsonb, '5 contre 5 ou 6 contre 6 — 2 matchs de 8 min'),
  ('E1', 'U6-U9', $json${"observation":"Ensemble des ateliers + mini-matchs"}$json$::jsonb, 'Observation continue'),
  ('E1', 'U10-U13', $json${"observation":"Ensemble des ateliers + mini-matchs"}$json$::jsonb, 'Observation continue'),
  ('E1', 'U14-U16', $json${"observation":"Ensemble des ateliers + mini-matchs"}$json$::jsonb, 'Observation continue')
) as v(test_code, category_code, protocol, protocol_text)
join public.assessment_tests t on t.code = v.test_code
join public.assessment_categories c on c.code = v.category_code
on conflict (test_id, category_id) do nothing;

insert into public.rubric_versions (test_id, category_id, sex, version, status, effective_from, config, notes)
select t.id, null, null, 1, 'active', '2026-11-01', v.config, v.notes
from (values
  ('A1', $json${"schema_version":1,"calculation_note":"Meilleur temps retenu. Seuils à définir par catégorie dans le module Barèmes.","components":[{"key":"time","label":"Temps de sprint","kind":"measured","max_points":10,"measure_type":"time","unit":"s","direction":"lower_better","attempts":2,"aggregation":"best","min_value":1,"max_value":15,"scoring":{"mode":"none"},"penalty":null}]}$json$::jsonb, 'Barème initial v1 (toutes catégories). Meilleur temps retenu. Seuils à définir par catégorie dans le module Barèmes.'),
  ('A2', $json${"schema_version":1,"components":[{"key":"time","label":"Temps du parcours","kind":"measured","max_points":6,"measure_type":"time","unit":"s","direction":"lower_better","attempts":2,"aggregation":"best","min_value":2,"max_value":60,"scoring":{"mode":"none"},"penalty":null},{"key":"direction_quality","label":"Qualité des changements de direction","kind":"qualitative","max_points":4,"levels":[{"value":0,"label":"Insuffisant","description":"Perd l'équilibre ou s'arrête à chaque changement de direction."},{"value":1,"label":"Fragile","description":"Changements lents, appuis instables, trajectoires larges."},{"value":2,"label":"En acquisition","description":"Changements corrects mais irréguliers ; relance parfois lente."},{"value":3,"label":"Acquis","description":"Appuis stables, centre de gravité abaissé, relance efficace."},{"value":4,"label":"Maîtrisé","description":"Changements rapides, fluides et contrôlés sur tout le parcours."}]}]}$json$::jsonb, 'Barème initial v1 (toutes catégories). '),
  ('A3', $json${"schema_version":1,"components":[{"key":"time","label":"Vitesse d'exécution (temps)","kind":"measured","max_points":4,"measure_type":"time","unit":"s","direction":"lower_better","attempts":2,"aggregation":"best","min_value":1,"max_value":60,"scoring":{"mode":"none"},"penalty":null},{"key":"precision","label":"Précision, fluidité et coordination","kind":"qualitative","max_points":4,"levels":[{"value":0,"label":"Insuffisant","description":"Ne parvient pas à suivre la séquence d'appuis."},{"value":1,"label":"Fragile","description":"Nombreux barreaux touchés, rythme haché."},{"value":2,"label":"En acquisition","description":"Séquence respectée avec quelques erreurs d'appui."},{"value":3,"label":"Acquis","description":"Appuis précis, rythme régulier, bonne coordination bras-jambes."},{"value":4,"label":"Maîtrisé","description":"Exécution précise, fluide et rythmée du début à la fin."}]}]}$json$::jsonb, 'Barème initial v1 (toutes catégories). '),
  ('A4', $json${"schema_version":1,"calculation_note":"Précision : conversion proportionnelle (essais réussis / 4 × 3 pts), arrondie au demi-point.","components":[{"key":"reaction","label":"Réaction au signal","kind":"qualitative","max_points":3,"levels":[{"value":0,"label":"Insuffisant","description":"Réaction très tardive ou absente."},{"value":1,"label":"En acquisition","description":"Réaction lente ou hésitante sur la plupart des essais."},{"value":2,"label":"Acquis","description":"Réaction rapide sur la majorité des essais."},{"value":3,"label":"Maîtrisé","description":"Réaction immédiate et constante sur tous les essais."}]},{"key":"precision","label":"Précision du déplacement (essais réussis)","kind":"measured","max_points":3,"measure_type":"successes","unit":"réussites","direction":"higher_better","attempts":1,"aggregation":"best","min_value":0,"max_value":4,"out_of":4,"scoring":{"mode":"linear","best":4,"worst":0,"round_to":0.5},"penalty":null}]}$json$::jsonb, 'Barème initial v1 (toutes catégories). Précision : conversion proportionnelle (essais réussis / 4 × 3 pts), arrondie au demi-point.'),
  ('A5', $json${"schema_version":1,"components":[{"key":"distance","label":"Distance du saut","kind":"measured","max_points":4,"measure_type":"distance","unit":"m","direction":"higher_better","attempts":2,"aggregation":"best","min_value":0.2,"max_value":3.5,"scoring":{"mode":"none"},"penalty":null},{"key":"technique","label":"Technique et réception","kind":"qualitative","max_points":2,"levels":[{"value":0,"label":"Insuffisant","description":"Impulsion désordonnée, réception déséquilibrée (chute, mains au sol)."},{"value":1,"label":"En acquisition","description":"Impulsion correcte mais réception instable."},{"value":2,"label":"Acquis","description":"Impulsion coordonnée bras-jambes et réception stable, genoux fléchis."}]}]}$json$::jsonb, 'Barème initial v1 (toutes catégories). '),
  ('T1', $json${"schema_version":1,"calculation_note":"Précision : conversion proportionnelle (passes réussies / 10 × 5 pts), arrondie au demi-point.","components":[{"key":"precision","label":"Précision (passes réussies)","kind":"measured","max_points":5,"measure_type":"successes","unit":"réussites","direction":"higher_better","attempts":1,"aggregation":"best","min_value":0,"max_value":10,"out_of":10,"scoring":{"mode":"linear","best":10,"worst":0,"round_to":0.5},"penalty":null},{"key":"quality","label":"Qualité technique et transmission","kind":"qualitative","max_points":3,"levels":[{"value":0,"label":"Insuffisant","description":"Surface de contact inadaptée, ballon non maîtrisé."},{"value":1,"label":"En acquisition","description":"Gestuelle correcte avec un seul pied ; dosage irrégulier."},{"value":2,"label":"Acquis","description":"Bonne surface de contact, passes bien dosées, pied faible utilisé."},{"value":3,"label":"Maîtrisé","description":"Passes tendues, précises et bien dosées des deux pieds."}]}]}$json$::jsonb, 'Barème initial v1 (toutes catégories). Précision : conversion proportionnelle (passes réussies / 10 × 5 pts), arrondie au demi-point.'),
  ('T2', $json${"schema_version":1,"components":[{"key":"control_quality","label":"Qualité du contrôle","kind":"qualitative","max_points":4,"levels":[{"value":0,"label":"Insuffisant","description":"Le ballon échappe au joueur sur la plupart des répétitions."},{"value":1,"label":"Fragile","description":"Contrôle souvent trop long ou non amorti."},{"value":2,"label":"En acquisition","description":"Contrôle correct sur environ la moitié des répétitions."},{"value":3,"label":"Acquis","description":"Contrôle propre et amorti sur la majorité des répétitions."},{"value":4,"label":"Maîtrisé","description":"Contrôle propre, amorti et sûr sur toutes les répétitions."}]},{"key":"orientation","label":"Orientation et vitesse de la première touche","kind":"qualitative","max_points":2,"levels":[{"value":0,"label":"Insuffisant","description":"Contrôle statique, sans orientation."},{"value":1,"label":"En acquisition","description":"Orientation présente mais lente ou imprécise."},{"value":2,"label":"Acquis","description":"Première touche orientée, rapide et enchaînée."}]}]}$json$::jsonb, 'Barème initial v1 (toutes catégories). '),
  ('T3', $json${"schema_version":1,"components":[{"key":"time","label":"Temps du slalom","kind":"measured","max_points":4,"measure_type":"time","unit":"s","direction":"lower_better","attempts":2,"aggregation":"best","min_value":2,"max_value":90,"scoring":{"mode":"none"},"penalty":null},{"key":"mastery","label":"Maîtrise, précision, équilibre et utilisation des pieds","kind":"qualitative","max_points":4,"levels":[{"value":0,"label":"Insuffisant","description":"Perd le ballon à plusieurs reprises."},{"value":1,"label":"Fragile","description":"Ballon souvent éloigné, cônes touchés, un seul pied."},{"value":2,"label":"En acquisition","description":"Conduite correcte, quelques pertes de contrôle."},{"value":3,"label":"Acquis","description":"Ballon proche, bon équilibre, utilisation des deux pieds."},{"value":4,"label":"Maîtrisé","description":"Conduite rapide, précise et équilibrée avec les deux pieds."}]}]}$json$::jsonb, 'Barème initial v1 (toutes catégories). '),
  ('T4', $json${"schema_version":1,"calculation_note":"Précision : conversion proportionnelle (tirs réussis / 8 × 5 pts), arrondie au demi-point.","components":[{"key":"precision","label":"Précision (tirs réussis)","kind":"measured","max_points":5,"measure_type":"successes","unit":"réussites","direction":"higher_better","attempts":1,"aggregation":"best","min_value":0,"max_value":8,"out_of":8,"scoring":{"mode":"linear","best":8,"worst":0,"round_to":0.5},"penalty":null},{"key":"strike_quality","label":"Qualité de frappe et exécution","kind":"qualitative","max_points":3,"levels":[{"value":0,"label":"Insuffisant","description":"Frappe désordonnée, pied d'appui mal placé."},{"value":1,"label":"En acquisition","description":"Frappe correcte mais manque de contrôle ou de puissance."},{"value":2,"label":"Acquis","description":"Bonne frappe, équilibrée, surface de contact adaptée."},{"value":3,"label":"Maîtrisé","description":"Frappe maîtrisée, puissante et précise, exécution rapide."}]}]}$json$::jsonb, 'Barème initial v1 (toutes catégories). Précision : conversion proportionnelle (tirs réussis / 8 × 5 pts), arrondie au demi-point.'),
  ('P1', $json${"schema_version":1,"components":[{"key":"volume","label":"Volume de déplacement (navettes)","kind":"measured","max_points":6,"measure_type":"repetitions","unit":"navettes","direction":"higher_better","attempts":1,"aggregation":"best","min_value":0,"max_value":300,"scoring":{"mode":"none"},"penalty":null},{"key":"rhythm","label":"Maintien du rythme","kind":"qualitative","max_points":2,"levels":[{"value":0,"label":"Insuffisant","description":"Rythme très irrégulier, arrêts fréquents."},{"value":1,"label":"En acquisition","description":"Baisse de rythme nette en fin d'effort."},{"value":2,"label":"Acquis","description":"Rythme régulier maintenu jusqu'à la fin."}]},{"key":"movement_quality","label":"Qualité de déplacement","kind":"qualitative","max_points":2,"levels":[{"value":0,"label":"Insuffisant","description":"Foulée désorganisée, demi-tours non maîtrisés."},{"value":1,"label":"En acquisition","description":"Foulée correcte, demi-tours perfectibles."},{"value":2,"label":"Acquis","description":"Foulée économique et demi-tours efficaces."}]}]}$json$::jsonb, 'Barème initial v1 (toutes catégories). '),
  ('I1', $json${"schema_version":1,"components":[{"key":"information","label":"Prise d'information","kind":"qualitative","max_points":3,"levels":[{"value":0,"label":"Insuffisant","description":"Joue tête baissée, ne regarde pas autour de lui."},{"value":1,"label":"En acquisition","description":"Lève parfois la tête, surtout sans ballon."},{"value":2,"label":"Acquis","description":"Observe régulièrement avant de recevoir le ballon."},{"value":3,"label":"Maîtrisé","description":"Prend l'information en permanence, avant et pendant l'action."}]},{"key":"decision","label":"Prise de décision","kind":"qualitative","max_points":3,"levels":[{"value":0,"label":"Insuffisant","description":"Choix souvent inadaptés (perte de balle systématique)."},{"value":1,"label":"En acquisition","description":"Choix simples, parfois inadaptés à la situation."},{"value":2,"label":"Acquis","description":"Choix majoritairement pertinents (passer, conduire, tirer)."},{"value":3,"label":"Maîtrisé","description":"Choix rapides et pertinents, y compris sous pression."}]},{"key":"positioning","label":"Placement et déplacement","kind":"qualitative","max_points":3,"levels":[{"value":0,"label":"Insuffisant","description":"Reste statique ou suit le ballon en grappe."},{"value":1,"label":"En acquisition","description":"Se déplace mais occupe mal l'espace."},{"value":2,"label":"Acquis","description":"Se démarque et occupe l'espace de façon cohérente."},{"value":3,"label":"Maîtrisé","description":"Placement intelligent, crée et exploite les espaces."}]},{"key":"understanding","label":"Compréhension offensive et défensive","kind":"qualitative","max_points":3,"levels":[{"value":0,"label":"Insuffisant","description":"Ne distingue pas les phases d'attaque et de défense."},{"value":1,"label":"En acquisition","description":"Participe surtout à une seule phase de jeu."},{"value":2,"label":"Acquis","description":"Participe aux deux phases et réagit à la perte du ballon."},{"value":3,"label":"Maîtrisé","description":"Comprend les transitions et adapte son rôle en permanence."}]},{"key":"anticipation","label":"Anticipation","kind":"qualitative","max_points":3,"levels":[{"value":0,"label":"Insuffisant","description":"Réagit toujours après l'action."},{"value":1,"label":"En acquisition","description":"Anticipe rarement les trajectoires ou intentions."},{"value":2,"label":"Acquis","description":"Anticipe régulièrement passes et déplacements."},{"value":3,"label":"Maîtrisé","description":"Lit le jeu en avance, intercepte et se projette."}]}]}$json$::jsonb, 'Barème initial v1 (toutes catégories). '),
  ('E1', $json${"schema_version":1,"components":[{"key":"support","label":"Encourage et aide ses partenaires","kind":"qualitative","max_points":1,"levels":[{"value":0,"label":"Non observé","description":"Comportement non observé."},{"value":0.5,"label":"Parfois","description":"Aide ou encourage ponctuellement."},{"value":1,"label":"Régulièrement","description":"Aide et encourage ses partenaires de façon régulière."}]},{"key":"respect","label":"Respecte les consignes et les personnes","kind":"qualitative","max_points":1,"levels":[{"value":0,"label":"Non observé","description":"Consignes ou personnes non respectées."},{"value":0.5,"label":"Parfois","description":"Respect partiel, rappels nécessaires."},{"value":1,"label":"Régulièrement","description":"Respecte constamment consignes, encadreurs et partenaires."}]},{"key":"resilience","label":"Accepte les erreurs et garde une attitude positive","kind":"qualitative","max_points":1,"levels":[{"value":0,"label":"Non observé","description":"Se décourage ou s'énerve face à l'erreur."},{"value":0.5,"label":"Parfois","description":"Attitude variable selon les situations."},{"value":1,"label":"Régulièrement","description":"Reste positif face à ses erreurs et à celles des autres."}]},{"key":"cooperation","label":"Coopère et partage le ballon","kind":"qualitative","max_points":1,"levels":[{"value":0,"label":"Non observé","description":"Garde le ballon, joue seul."},{"value":0.5,"label":"Parfois","description":"Partage le ballon de façon irrégulière."},{"value":1,"label":"Régulièrement","description":"Coopère et partage le ballon naturellement."}]},{"key":"fair_play","label":"Discipline et fair-play","kind":"qualitative","max_points":1,"levels":[{"value":0,"label":"Non observé","description":"Gestes ou comportements antisportifs observés."},{"value":0.5,"label":"Parfois","description":"Quelques écarts de discipline."},{"value":1,"label":"Régulièrement","description":"Discipliné et fair-play en toutes circonstances."}]}]}$json$::jsonb, 'Barème initial v1 (toutes catégories). ')
) as v(test_code, config, notes)
join public.assessment_tests t on t.code = v.test_code
on conflict on constraint rubric_versions_unique_version do nothing;

-- Session réelle du 28 novembre 2026 (créée en brouillon).
with s as (
  insert into public.assessment_sessions (name, description, session_date, start_time, location, season_id, status)
  select 'Test d''aptitude FUTURISTE ACADÉMIE FC - Saison 2026-2027', 'Test d''aptitude de début de saison pour les catégories U6-U9, U10-U13 et U14-U16.', '2026-11-28',
         '09:30', 'École Publique de Japoma, Douala, Cameroun',
         (select id from public.seasons where label = '2026-2027'), 'draft'
  where not exists (select 1 from public.assessment_sessions where name = 'Test d''aptitude FUTURISTE ACADÉMIE FC - Saison 2026-2027')
  returning id
), cats as (
  insert into public.session_categories (session_id, category_id)
  select s.id, c.id from s cross join public.assessment_categories c
  returning session_id
)
insert into public.session_tests (session_id, test_id, sort_order)
select s.id, t.id, t.sort_order from s cross join public.assessment_tests t;
