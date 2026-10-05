-- Project Desk / Supabase schema
-- Exécute ce SQL dans Supabase > SQL Editor.

create table if not exists public.workspace_pages (
  id text primary key,
  title text not null,
  content text not null default '',
  updated_at bigint not null,
  updated_by text not null default 'Workspace',
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_tasks (
  id text primary key,
  title text not null,
  done boolean not null default false,
  updated_at bigint not null,
  updated_by text not null default 'Workspace',
  created_at timestamptz not null default now()
);

-- Les API de l'application utilisent KEY uniquement côté serveur.
-- Garde KEY secret dans Vercel et utilise la clé secrète/service de Supabase.
alter table public.workspace_pages enable row level security;
alter table public.workspace_tasks enable row level security;

create index if not exists workspace_pages_updated_idx
  on public.workspace_pages (updated_at desc);

create index if not exists workspace_tasks_created_idx
  on public.workspace_tasks (created_at desc);
