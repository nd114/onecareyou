-- Delete duplicate medications for any patient, keeping the earliest of each (user_id, name, dosage)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY user_id, name, dosage ORDER BY created_at ASC) AS rn
  FROM public.medications
)
DELETE FROM public.medications
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);