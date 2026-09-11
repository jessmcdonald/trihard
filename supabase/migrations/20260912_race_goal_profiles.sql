-- Swim venue, bike/run terrain profiles for race goals

create type swim_venue as enum ('lake', 'ocean', 'river', 'indoor');
create type terrain_profile as enum ('flat', 'rolling', 'hilly');

alter table race_goals
  add column swim_venue swim_venue,
  add column bike_terrain terrain_profile,
  add column bike_elevation_gain_m integer, -- total elevation gain in meters
  add column run_terrain terrain_profile;
