// Vul hier de gegevens van je Supabase-project in (Project Settings > API).
// De anon key is bedoeld om openbaar in de browser te staan; de toegang wordt
// afgeschermd door het wachtwoord (gedeeld account) en de policies in supabase/schema.sql.
window.LACE_CONFIG = {
  supabaseUrl: 'https://xvommvxbexcwewrpmylp.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2b21tdnhiZXhjd2V3cnBteWxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQwMDAxMjUsImV4cCI6MjEwOTU3NjEyNX0.wBlpqWWkwBkcRnZ_9ly9i3Q8rVds2aJXqY-ZCfaVm88',
  // Wachtwoord: het bord logt in met dit gedeelde account (aanmaken in Supabase > Authentication > Users).
  // Het accountwachtwoord is het teamwachtwoord + passwordSuffix (Supabase eist minimaal 6 tekens).
  boardEmail: 'lacebord@example.com',
  passwordSuffix: '-bord'
};
