-- Demo conversation for visual checks (CI only).
WITH u AS (SELECT id FROM jarvis.users ORDER BY created_at LIMIT 1),
c AS (
  INSERT INTO jarvis.conversations (id, user_id, title, last_message_at)
  SELECT '11111111-1111-4111-8111-111111111111', id, 'תזכורת ותכנון ערב', now() FROM u
  RETURNING id, user_id
)
INSERT INTO jarvis.messages (user_id, conversation_id, role, content, input_mode, kind, meta, created_at)
SELECT c.user_id, c.id, v.role, v.content, v.mode, v.kind, v.meta::jsonb, now() - (v.ago || ' minutes')::interval
FROM c, (VALUES
  ('user', 'תזכיר לי היום ב־20:00 להתקשר לאמא, ותפתח לי ניווט לים בבת גלים', 'text', 'chat', '{}', 9),
  ('assistant', E'קבעתי לך תזכורת להיום ב־20:00 להתקשר לאמא.\n\nוהנה הניווט לחוף בת גלים — לחיצה אחת והוא נפתח ב־Waze.', 'text', 'chat',
   '{"chips":[{"icon":"bell","text":"להתקשר לאמא · היום ב־20:00"}],"actions":[{"type":"open_url","url":"https://waze.com/ul?q=bat%20galim&navigate=yes","label":"ניווט לחוף בת גלים · Waze","icon":"map"}],"steps":[{"id":"a-1","kind":"tool","label":"יוצר תזכורת","state":"done","detail":"create_reminder · 38ms"},{"id":"a-2","kind":"tool","label":"פותח ניווט","state":"done","detail":"open_maps · 2ms"}]}', 8),
  ('user', 'אני רוצה לבנות הרגל של קריאה 20 דקות כל ערב', 'voice', 'chat', '{}', 6),
  ('assistant', E'מעולה, יצאנו לדרך. **כל ערב ב־21:00** אזכיר לך לקרוא 20 דקות, ואם כבר קראת — לא אציק.\n\nכמה דברים שעוזרים להרגל להחזיק:\n- להשאיר את הספר על הכרית כבר בבוקר\n- לקבוע שהקריאה באה לפני הטלפון\n- לספר לי כשסיימת — אני סופר את הרצף', 'text', 'chat',
   '{"chips":[{"icon":"repeat","text":"לקרוא 20 דקות · כל יום ב־21:00"}],"steps":[{"id":"b-1","kind":"tool","label":"בונה את ההרגל","state":"done","detail":"create_habit · 51ms"}]}', 5),
  ('assistant', '⏰ להתקשר לאמא', 'system', 'reminder', '{"reminderId":"x"}', 1)
) AS v(role, content, mode, kind, meta, ago);
