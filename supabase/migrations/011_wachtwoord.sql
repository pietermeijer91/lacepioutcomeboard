-- 011: bord afschermen met een wachtwoord
-- Daarna kan alleen het gedeelde account (ingelogd via het wachtwoordscherm) de data lezen en wijzigen.
-- Een bezoeker zonder wachtwoord (rol anon) ziet niets meer, ook niet via de API.
--
-- VOLGORDE:
-- 1. Maak eerst het gedeelde account aan: Supabase > Authentication > Users > Add user > Create new user
--    E-mail: lacebord@example.com   Wachtwoord: LACE1234   Vink "Auto Confirm User" aan.
-- 2. Zorg dat de nieuwe versie van het bord live staat (met het wachtwoordscherm).
-- 3. Draai dan dit script. Veilig om opnieuw te draaien.

do $$
declare t text;
begin
  foreach t in array array['outcomes','milestones','settings','tasks','ogsm'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from anon', t);
      execute format('grant select, insert, update, delete on public.%I to authenticated', t);
      execute format('drop policy if exists "open bord %s" on public.%I', t, t);
      execute format('drop policy if exists "team %s" on public.%I', t, t);
      execute format('create policy "team %s" on public.%I for all to authenticated using (true) with check (true)', t, t);
    end if;
  end loop;
end $$;
