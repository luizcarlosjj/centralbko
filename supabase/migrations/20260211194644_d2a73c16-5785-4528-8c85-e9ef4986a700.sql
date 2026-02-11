
-- 1. Enum de roles
create type public.app_role as enum ('supervisor', 'analyst');

-- 2. Tabela de perfis
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade not null,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 3. Tabela de roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

-- 4. Função has_role (security definer)
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- 5. Tabela de tickets
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  base_name text not null,
  requester_name text not null,
  priority text not null check (priority in ('baixa', 'media', 'alta', 'urgente')),
  type text not null check (type in ('setup_questionario', 'cliente', 'ajuste', 'outro')),
  description text not null,
  status text not null default 'nao_iniciado' check (status in ('nao_iniciado', 'em_andamento', 'pausado', 'finalizado')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  total_execution_seconds integer not null default 0,
  total_paused_seconds integer not null default 0,
  assigned_analyst_id uuid references auth.users(id)
);

alter table public.tickets enable row level security;

-- 6. Tabela de logs de status
create table public.ticket_status_logs (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.tickets(id) on delete cascade not null,
  changed_by uuid references auth.users(id) not null,
  old_status text not null,
  new_status text not null,
  changed_at timestamptz not null default now()
);

alter table public.ticket_status_logs enable row level security;

-- 7. Trigger para criar perfil automaticamente
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 8. RLS Policies

-- Profiles: todos autenticados podem ler, usuário edita o próprio
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select to authenticated using (true);

create policy "Users can update own profile"
  on public.profiles for update to authenticated using (id = auth.uid());

-- User roles: apenas leitura do próprio role
create policy "Users can read own role"
  on public.user_roles for select to authenticated using (user_id = auth.uid());

-- Tickets: público pode inserir
create policy "Public can insert tickets"
  on public.tickets for insert to anon with check (true);

create policy "Authenticated can insert tickets"
  on public.tickets for insert to authenticated with check (true);

-- Tickets: analista vê seus chamados + não atribuídos
create policy "Analyst can view own and unassigned tickets"
  on public.tickets for select to authenticated
  using (
    public.has_role(auth.uid(), 'supervisor')
    or assigned_analyst_id = auth.uid()
    or assigned_analyst_id is null
  );

-- Tickets: analista atualiza seus chamados
create policy "Analyst can update own tickets"
  on public.tickets for update to authenticated
  using (
    public.has_role(auth.uid(), 'supervisor')
    or assigned_analyst_id = auth.uid()
    or (assigned_analyst_id is null and status = 'nao_iniciado')
  );

-- Ticket status logs: autenticados podem inserir e ler
create policy "Authenticated can insert status logs"
  on public.ticket_status_logs for insert to authenticated
  with check (changed_by = auth.uid());

create policy "Authenticated can view status logs"
  on public.ticket_status_logs for select to authenticated using (true);

-- Enable realtime for tickets
alter publication supabase_realtime add table public.tickets;
