-- triHard: Triathlon Training Planner Schema
-- ============================================

-- Custom enum types
create type experience_level as enum ('beginner', 'intermediate', 'advanced');
create type race_distance as enum ('sprint', 'olympic', 'half_iron', 'ironman', 'custom');
create type discipline as enum ('swim', 'bike', 'run', 'strength');
create type training_phase as enum ('base', 'build', 'peak', 'taper');
create type plan_status as enum ('active', 'completed', 'archived');

create type swim_workout as enum (
  'technique', 'endurance', 'threshold', 'speed', 'race_sim', 'recovery', 'open_water'
);
create type bike_workout as enum (
  'endurance', 'sweet_spot', 'threshold', 'vo2max', 'cadence_force', 'recovery', 'race_sim'
);
create type run_workout as enum (
  'easy', 'long', 'tempo', 'threshold', 'vo2max', 'fartlek', 'recovery', 'race_pace'
);
create type strength_workout as enum (
  'full_body', 'upper', 'lower', 'core', 'mobility'
);
create type brick_workout as enum (
  'short_transition', 'threshold_brick', 'endurance_brick', 'race_sim_brick'
);

-- ============================================
-- PROFILES
-- ============================================
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  experience_level experience_level not null default 'intermediate',
  strava_athlete_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;
create policy "Users can read own profile"
  on profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);
create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$ language plpgsql security definer
set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================
-- RACE GOALS
-- ============================================
create table race_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  distance_type race_distance not null,
  race_date date not null,

  -- distances in meters
  swim_distance_m integer not null default 0,
  bike_distance_m integer not null default 0,
  run_distance_m integer not null default 0,

  -- target times in seconds
  target_swim_time integer,
  target_t1_time integer,
  target_bike_time integer,
  target_t2_time integer,
  target_run_time integer,

  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_race_goals_user on race_goals(user_id);

alter table race_goals enable row level security;
create policy "Users can manage own race goals"
  on race_goals for all using (auth.uid() = user_id);

-- ============================================
-- WEEKLY TEMPLATES
-- Defines the recurring weekly structure
-- ============================================
create table weekly_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  race_goal_id uuid not null references race_goals(id) on delete cascade,

  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0=Mon, 6=Sun
  discipline discipline not null,

  -- Only one of these should be set, based on discipline
  -- Stored as text to accommodate different workout type enums
  workout_type text not null,

  sort_order smallint not null default 0, -- for multiple workouts on same day
  created_at timestamptz not null default now(),

  unique (race_goal_id, day_of_week, sort_order)
);

create index idx_weekly_templates_goal on weekly_templates(race_goal_id);

alter table weekly_templates enable row level security;
create policy "Users can manage own templates"
  on weekly_templates for all using (auth.uid() = user_id);

-- ============================================
-- TRAINING PLANS
-- Generated plan with phase boundaries
-- ============================================
create table training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  race_goal_id uuid not null references race_goals(id) on delete cascade,

  start_date date not null,
  end_date date not null,
  total_weeks smallint not null,

  base_weeks smallint not null,
  build_weeks smallint not null,
  peak_weeks smallint not null,
  taper_weeks smallint not null,

  weekly_hours_target numeric(4,1) not null, -- average target hours/week

  status plan_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_training_plans_user on training_plans(user_id);

alter table training_plans enable row level security;
create policy "Users can manage own plans"
  on training_plans for all using (auth.uid() = user_id);

-- ============================================
-- PLANNED WORKOUTS
-- Individual workouts generated from template + plan
-- ============================================
create table planned_workouts (
  id uuid primary key default gen_random_uuid(),
  training_plan_id uuid not null references training_plans(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,

  date date not null,
  week_number smallint not null,
  phase training_phase not null,

  discipline discipline not null,
  workout_type text not null,

  planned_duration_min smallint, -- planned duration in minutes
  planned_distance_m integer,   -- planned distance in meters
  intensity_zone smallint check (intensity_zone between 1 and 3),

  description text, -- e.g. "4×5min at threshold pace, 2min recovery jog"
  is_recovery_week boolean not null default false,

  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create index idx_planned_workouts_plan on planned_workouts(training_plan_id);
create index idx_planned_workouts_date on planned_workouts(user_id, date);

alter table planned_workouts enable row level security;
create policy "Users can manage own planned workouts"
  on planned_workouts for all using (auth.uid() = user_id);

-- ============================================
-- COMPLETED WORKOUTS
-- Actual workout logs, linked to planned
-- ============================================
create table completed_workouts (
  id uuid primary key default gen_random_uuid(),
  planned_workout_id uuid references planned_workouts(id) on delete set null,
  user_id uuid not null references profiles(id) on delete cascade,

  date date not null,
  discipline discipline not null,
  workout_type text not null,

  actual_duration_min smallint,
  actual_distance_m integer,
  avg_heart_rate smallint,
  perceived_effort smallint check (perceived_effort between 1 and 10), -- RPE

  notes text,
  strava_activity_id bigint, -- for auto-matching

  created_at timestamptz not null default now()
);

create index idx_completed_workouts_user on completed_workouts(user_id, date);
create index idx_completed_workouts_planned on completed_workouts(planned_workout_id);
create index idx_completed_workouts_strava on completed_workouts(strava_activity_id)
  where strava_activity_id is not null;

alter table completed_workouts enable row level security;
create policy "Users can manage own completed workouts"
  on completed_workouts for all using (auth.uid() = user_id);

-- ============================================
-- HELPER: updated_at trigger
-- ============================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on profiles
  for each row execute function update_updated_at();
create trigger set_updated_at before update on race_goals
  for each row execute function update_updated_at();
create trigger set_updated_at before update on training_plans
  for each row execute function update_updated_at();

-- ============================================
-- REFERENCE: Default race distances (meters)
-- sprint:    750 / 20000 / 5000
-- olympic:  1500 / 40000 / 10000
-- half_iron: 1900 / 90000 / 21100
-- ironman:   3800 / 180000 / 42200
-- ============================================
