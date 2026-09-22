-- Track workouts: optional sessions, skip, one log per planned workout

alter table planned_workouts
  add column optional boolean not null default false,
  add column status text not null default 'planned',
  add column skipped_at timestamptz;

alter table planned_workouts
  add constraint planned_workouts_status_check
  check (status in ('planned', 'skipped'));

create unique index completed_workouts_planned_unique
  on completed_workouts (planned_workout_id)
  where planned_workout_id is not null;
