-- Database Schema for Tienda de Mascotas Del Bono (web-tdm-delbono)

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- -------------------------------------------------------------
-- TABLES CREATION
-- -------------------------------------------------------------

-- 1. Business Settings
create table if not exists public.business_settings (
    id uuid primary key default gen_random_uuid(),
    business_name text not null default 'Tienda de Mascotas Del Bono',
    logo_url text,
    primary_color text not null default '#d97706',
    secondary_color text not null default '#0f766e',
    address text not null default 'Av. Del Bono 123, San Juan',
    phone text not null default '+54 264 4567890',
    email text not null default 'contacto@tdmdelbono.com',
    whatsapp text not null default '+54 264 4567890',
    facebook text,
    instagram text,
    updated_at timestamp with time zone default now()
);

-- 2. Clients (No client login, unique email keys database)
create table if not exists public.clients (
    id uuid primary key default gen_random_uuid(),
    email text not null,
    first_name text not null,
    last_name text not null,
    phone text unique not null,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- 3. Categories
create table if not exists public.categories (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    description text,
    active boolean not null default true,
    created_at timestamp with time zone default now()
);

-- 4. Services
create table if not exists public.services (
    id uuid primary key default gen_random_uuid(),
    category_id uuid references public.categories(id) on delete cascade not null,
    name text not null,
    description text,
    image_url text,
    estimated_duration_minutes integer not null default 60,
    active boolean not null default true,
    -- Weekly Availability toggles
    enabled_monday boolean not null default true,
    enabled_tuesday boolean not null default true,
    enabled_wednesday boolean not null default true,
    enabled_thursday boolean not null default true,
    enabled_friday boolean not null default true,
    enabled_saturday boolean not null default true,
    enabled_sunday boolean not null default false,
    max_concurrent_bookings integer not null default 1,
    requires_deposit boolean not null default false,
    deposit_amount decimal(10, 2) not null default 0.00,
    price decimal(10, 2) not null default 0.00,
    allow_reschedule boolean not null default true,
    reschedule_limit_hours integer not null default 12,
    created_at timestamp with time zone default now()
);

-- 5. Service Hours (Multiple slots/work shifts per service and weekday)
create table if not exists public.service_hours (
    id uuid primary key default gen_random_uuid(),
    service_id uuid references public.services(id) on delete cascade not null,
    day_of_week integer not null check (day_of_week between 0 and 6), -- 0=Sunday, 1=Monday, etc.
    start_time time not null,
    end_time time not null,
    check (start_time < end_time)
);

-- 6. Holidays and Blocks (Global and specific dates/times blocks)
create table if not exists public.holidays_blocks (
    id uuid primary key default gen_random_uuid(),
    date date not null,
    start_time time, -- Null indicates all-day block
    end_time time,   -- Null indicates all-day block
    reason text not null,
    created_at timestamp with time zone default now(),
    check ((start_time is null and end_time is null) or (start_time is not null and end_time is not null and start_time < end_time))
);

-- 7. Bookings
create table if not exists public.bookings (
    id uuid primary key default gen_random_uuid(),
    client_id uuid references public.clients(id) on delete cascade not null,
    service_id uuid references public.services(id) on delete restrict not null,
    booking_date date not null,
    booking_time time not null,
    duration integer not null, -- duration in minutes
    deposit_amount decimal(10, 2) not null default 0.00,
    local_amount_paid decimal(10, 2) not null default 0.00,
    payment_id text, -- Mercado Pago payment ID
    status text not null default 'PENDING_PAYMENT' check (status in ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'RESCHEDULED', 'COMPLETED', 'NO_SHOW')),
    notes text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    quantity integer not null default 1,
    reminder_sent boolean not null default false
);

-- -------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
-- -------------------------------------------------------------

-- Enable RLS on all tables
alter table public.business_settings enable row level security;
alter table public.clients enable row level security;
alter table public.categories enable row level security;
alter table public.services enable row level security;
alter table public.service_hours enable row level security;
alter table public.holidays_blocks enable row level security;
alter table public.bookings enable row level security;

-- 1. Business Settings RLS
create policy "Allow public read access to business settings"
    on public.business_settings for select using (true);

create policy "Allow admin write access to business settings"
    on public.business_settings for all using (auth.role() = 'authenticated');

-- 2. Clients RLS
create policy "Allow public lookup by phone or insert clients"
    on public.clients for select using (true); -- Public can lookup client phone to autocomplete

create policy "Allow public client creation"
    on public.clients for insert with check (true);

create policy "Allow admin full access to clients"
    on public.clients for all using (auth.role() = 'authenticated');

-- 3. Categories RLS
create policy "Allow public read access to categories"
    on public.categories for select using (true);

create policy "Allow admin write access to categories"
    on public.categories for all using (auth.role() = 'authenticated');

-- 4. Services RLS
create policy "Allow public read access to services"
    on public.services for select using (true);

create policy "Allow admin write access to services"
    on public.services for all using (auth.role() = 'authenticated');

-- 5. Service Hours RLS
create policy "Allow public read access to service hours"
    on public.service_hours for select using (true);

create policy "Allow admin write access to service hours"
    on public.service_hours for all using (auth.role() = 'authenticated');

-- 6. Holidays and Blocks RLS
create policy "Allow public read access to holiday blocks"
    on public.holidays_blocks for select using (true);

create policy "Allow admin write access to holiday blocks"
    on public.holidays_blocks for all using (auth.role() = 'authenticated');

-- 7. Bookings RLS
create policy "Allow public inserts of bookings"
    on public.bookings for insert with check (true);

create policy "Allow public select of bookings by client"
    on public.bookings for select using (true); -- Public needs to retrieve slots to generate availability

create policy "Allow public updates of bookings for reschedule/cancellation"
    on public.bookings for update using (true); -- Clients can reschedule / cancel within limits

create policy "Allow admin full access to bookings"
    on public.bookings for all using (auth.role() = 'authenticated');


-- -------------------------------------------------------------
-- SEED INITIAL DATA
-- -------------------------------------------------------------

-- Seed default Business Settings
insert into public.business_settings (business_name, primary_color, secondary_color, address, phone, email, whatsapp, instagram)
values ('Tienda de Mascotas Del Bono', '#d97706', '#0f766e', 'Av. Del Bono 123, San Juan', '+54 264 4567890', 'contacto@tdmdelbono.com', '+54 264 4567890', '@tdmdelbono')
on conflict do nothing;

-- Seed categories
insert into public.categories (id, name, description, active) values
('c8e03e5c-0974-4b5f-a3cf-e87f22a573e8', 'Baño', 'Servicios de higiene y baño general para mascotas', true),
('707d0f98-b80c-4395-8857-418080f58fe9', 'Peluquería', 'Servicios de corte, peinado y estética canina', true),
('f6bbd677-d64e-4f36-a1ff-80c1ad2e76f5', 'Tratamientos', 'Cuidados especializados (oídos, uñas, dental, etc.)', true)
on conflict do nothing;

-- Seed services
insert into public.services (id, category_id, name, description, estimated_duration_minutes, active, enabled_sunday, max_concurrent_bookings, requires_deposit, deposit_amount, allow_reschedule, reschedule_limit_hours) values
-- Category: Baño
('5a4a58eb-0797-4008-8e6c-ffb5e28ffbc2', 'c8e03e5c-0974-4b5f-a3cf-e87f22a573e8', 'Baño Standard', 'Baño higiénico con shampoo hipoalergénico, secado y cepillado simple.', 45, true, false, 2, true, 500.00, true, 12),
('6a4a58eb-0797-4008-8e6c-ffb5e28ffbc3', 'c8e03e5c-0974-4b5f-a3cf-e87f22a573e8', 'Baño Medicado', 'Baño con shampoo terapéutico prescrito por veterinario para problemas dermatológicos.', 60, true, false, 2, true, 700.00, true, 12),

-- Category: Peluquería
('7a4a58eb-0797-4008-8e6c-ffb5e28ffbc4', '707d0f98-b80c-4395-8857-418080f58fe9', 'Corte y Baño Canino', 'Corte de raza o a elección del cliente, incluye baño higiénico, corte de uñas y limpieza de oídos.', 90, true, false, 1, true, 1000.00, true, 12),
('8a4a58eb-0797-4008-8e6c-ffb5e28ffbc5', '707d0f98-b80c-4395-8857-418080f58fe9', 'Corte Higiénico', 'Despeje de almohadillas, zona genital y perianal. Ideal para mantenimiento rápido.', 30, true, false, 2, false, 0.00, true, 6),

-- Category: Tratamientos
('9a4a58eb-0797-4008-8e6c-ffb5e28ffbc6', 'f6bbd677-d64e-4f36-a1ff-80c1ad2e76f5', 'Corte de Uñas', 'Corte y limado de uñas express para perros y gatos.', 15, true, false, 3, false, 0.00, true, 6),
('0a4a58eb-0797-4008-8e6c-ffb5e28ffbc7', 'f6bbd677-d64e-4f36-a1ff-80c1ad2e76f5', 'Limpieza Dental Express', 'Cepillado dental y aplicación de spray antisarro para mejorar el aliento.', 20, true, false, 3, false, 0.00, true, 6)
on conflict do nothing;

-- Seed default schedules (Monday to Saturday: 09:00 - 13:00, 16:00 - 20:00) for all services
-- Using a simple script template. In supabase editor you can run this or insert directly.
-- Let's populate service_hours for day 1..6 (Monday to Saturday)
-- Day_of_week: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
insert into public.service_hours (service_id, day_of_week, start_time, end_time)
select s.id, d, '09:00:00'::time, '13:00:00'::time from public.services s cross join unnest(array[1,2,3,4,5,6]) d
union all
select s.id, d, '16:00:00'::time, '20:00:00'::time from public.services s cross join unnest(array[1,2,3,4,5,6]) d;
