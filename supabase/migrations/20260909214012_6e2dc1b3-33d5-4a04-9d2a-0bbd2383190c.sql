DROP POLICY IF EXISTS "Patients read their own vitals" ON public.vitals;
CREATE POLICY "Patients read their own vitals"
  ON public.vitals FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Patients read their own schedule entries" ON public.schedule_entries;
CREATE POLICY "Patients read their own schedule entries"
  ON public.schedule_entries FOR SELECT TO authenticated
  USING (auth.uid() = user_id);