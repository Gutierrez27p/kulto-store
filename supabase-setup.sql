-- Run this once in Supabase: Project -> SQL Editor -> New query -> paste -> Run.
-- It creates the single table Kulto uses to store the catalog, orders and settings.

create table if not exists kulto_kv (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

-- Row Level Security: this makes the table reachable with the public "anon" key,
-- which is what the website uses in the browser. There is no login system yet,
-- so anyone who has your site's anon key (visible in the browser) could in theory
-- write to this table directly, not just through the site. For a store that's
-- just starting out this is a reasonable trade-off, but if Kulto grows, the next
-- security step is to add Supabase Auth and restrict writes to a logged-in admin.
alter table kulto_kv enable row level security;

-- Envueltas en "do $$ ... exception when duplicate_object" para que sea
-- seguro correr este script más de una vez (por ejemplo si ya lo habías
-- corrido antes): si una regla ya existe, la saltea en vez de tirar error.
do $$ begin
  create policy "public read" on kulto_kv
    for select using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "public write" on kulto_kv
    for insert with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "public update" on kulto_kv
    for update using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "public delete" on kulto_kv
    for delete using (true);
exception when duplicate_object then null;
end $$;

-- Storage: guarda las fotos como archivos en vez de como texto gigante
-- adentro de kulto_kv, que es lo que mantiene la web rápida sin importar
-- cuántas fotos subas. Crea el bucket y le da los mismos permisos públicos
-- que la tabla de arriba (mismo trade-off: cualquiera con la anon key podría
-- subir o borrar archivos ahí directamente, no solo a través del sitio).
-- Seguro de correr aunque ya hayas creado el bucket a mano desde el panel
-- (Storage -> New bucket): si ya existe lo deja como está, y si alguno de
-- estos permisos ya existe, lo salta en vez de fallar.
insert into storage.buckets (id, name, public)
values ('kulto-photos', 'kulto-photos', true)
on conflict (id) do update set public = true;

do $$ begin
  create policy "public read photos" on storage.objects
    for select using (bucket_id = 'kulto-photos');
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "public upload photos" on storage.objects
    for insert with check (bucket_id = 'kulto-photos');
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "public update photos" on storage.objects
    for update using (bucket_id = 'kulto-photos');
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "public delete photos" on storage.objects
    for delete using (bucket_id = 'kulto-photos');
exception when duplicate_object then null;
end $$;
