-- Pannello admin più veloce (richiesta di Daniele, 2026-11-23).
--
-- Le regole di accesso (RLS) chiamavano public.is_admin(), public.is_staff(),
-- public.socio_corrente_id() e auth.uid() così come sono: Postgres le rifaceva
-- per ogni riga letta, e ognuna è una piccola query sulla tabella staff o soci.
-- Su un elenco soci (scheda + tessere + punti di migliaia di persone) erano
-- decine di migliaia di query in più a ogni pagina.
--
-- Scritte come (select public.is_admin()) Postgres le calcola una volta sola per
-- query: il risultato è lo stesso, chi vede cosa non cambia. È il consiglio della
-- guida di Supabase sulle prestazioni delle regole.
--
-- Il blocco riscrive tutte le regole di public e storage che usano queste
-- funzioni. Si può rilanciare: le chiamate già racchiuse in (select ...) restano
-- come sono.

do $$
declare
  r record;
  v_qual text;
  v_check text;
  -- Una chiamata non ancora racchiusa in ( SELECT ... ).
  v_modello constant text := '(?<!SELECT )((public|auth)\.(is_admin|is_staff|is_personale|socio_corrente_id|livello_corrente_ordine|uid)\(\))';
  v_sql text;
  n int := 0;
begin
  -- Con search_path vuoto Postgres scrive i nomi completi (public.is_admin()),
  -- così il testo della regola si può rimettere tale e quale.
  perform set_config('search_path', '', true);
  for r in
    select c.oid as tabella, n.nspname as schema, c.relname as nome_tabella, p.polname,
           pg_get_expr(p.polqual, p.polrelid) as qual,
           pg_get_expr(p.polwithcheck, p.polrelid) as with_check
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'storage')
  loop
    v_qual := regexp_replace(r.qual, v_modello, '(select \1)', 'g');
    v_check := regexp_replace(r.with_check, v_modello, '(select \1)', 'g');
    if v_qual is distinct from r.qual or v_check is distinct from r.with_check then
      v_sql := format('alter policy %I on %I.%I', r.polname, r.schema, r.nome_tabella);
      if r.qual is not null then v_sql := v_sql || format(' using (%s)', v_qual); end if;
      if r.with_check is not null then v_sql := v_sql || format(' with check (%s)', v_check); end if;
      begin
        execute v_sql;
        n := n + 1;
      exception when insufficient_privilege then
        -- Le regole di storage appartengono a Supabase: se non si possono toccare
        -- restano come sono (contano poco per la velocità del pannello).
        raise notice 'Regola % su %.% lasciata com''era: %', r.polname, r.schema, r.nome_tabella, sqlerrm;
      end;
    end if;
  end loop;
  raise notice 'Regole aggiornate: %', n;
end;
$$;
