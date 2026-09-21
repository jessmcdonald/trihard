// Auto-generated types will replace this file once connected to Supabase.
// Run: supabase gen types typescript --linked > src/lib/database.types.ts
//
// For now, manually defined to match our migration.

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced'
export type RaceDistance = 'sprint' | 'olympic' | 'half_iron' | 'ironman' | 'custom'
export type Discipline = 'swim' | 'bike' | 'run' | 'strength'
export type TrainingPhase = 'base' | 'build' | 'peak' | 'taper'
export type PlanStatus = 'active' | 'completed' | 'archived'

export type SwimWorkout = 'technique' | 'endurance' | 'threshold' | 'speed' | 'race_sim' | 'recovery' | 'open_water'
export type BikeWorkout = 'endurance' | 'sweet_spot' | 'threshold' | 'vo2max' | 'cadence_force' | 'recovery' | 'race_sim'
export type RunWorkout = 'easy' | 'long' | 'tempo' | 'threshold' | 'vo2max' | 'fartlek' | 'recovery' | 'race_pace'
export type StrengthWorkout = 'full_body' | 'upper' | 'lower' | 'core' | 'mobility'
export type BrickWorkout = 'short_transition' | 'threshold_brick' | 'endurance_brick' | 'race_sim_brick'

export type SwimVenue = 'lake' | 'ocean' | 'river' | 'indoor'
export type TerrainProfile = 'flat' | 'rolling' | 'hilly'

export type WorkoutType = SwimWorkout | BikeWorkout | RunWorkout | StrengthWorkout | BrickWorkout

export type Profile = {
  id: string
  display_name: string
  experience_level: ExperienceLevel
  strava_athlete_id: number | null
  created_at: string
  updated_at: string
}

export type RaceGoal = {
  id: string
  user_id: string
  name: string
  distance_type: RaceDistance
  race_date: string
  swim_distance_m: number
  bike_distance_m: number
  run_distance_m: number
  target_swim_time: number | null
  target_t1_time: number | null
  target_bike_time: number | null
  target_t2_time: number | null
  target_run_time: number | null
  swim_venue: SwimVenue | null
  bike_terrain: TerrainProfile | null
  bike_elevation_gain_m: number | null
  run_terrain: TerrainProfile | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type WeeklyTemplate = {
  id: string
  user_id: string
  race_goal_id: string
  day_of_week: number
  discipline: Discipline
  workout_type: string
  sort_order: number
  created_at: string
}

export type TrainingPlan = {
  id: string
  user_id: string
  race_goal_id: string
  start_date: string
  end_date: string
  total_weeks: number
  base_weeks: number
  build_weeks: number
  peak_weeks: number
  taper_weeks: number
  weekly_hours_target: number
  status: PlanStatus
  created_at: string
  updated_at: string
}

export type PlannedWorkout = {
  id: string
  training_plan_id: string
  user_id: string
  date: string
  week_number: number
  phase: TrainingPhase
  discipline: Discipline
  workout_type: string
  planned_duration_min: number | null
  planned_distance_m: number | null
  intensity_zone: number | null
  description: string | null
  is_recovery_week: boolean
  sort_order: number
  created_at: string
}

export type CompletedWorkout = {
  id: string
  planned_workout_id: string | null
  user_id: string
  date: string
  discipline: Discipline
  workout_type: string
  actual_duration_min: number | null
  actual_distance_m: number | null
  avg_heart_rate: number | null
  perceived_effort: number | null
  notes: string | null
  strava_activity_id: number | null
  created_at: string
}

// Supabase Database type (placeholder until auto-generated)
export type Database = {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile> & { id: string }; Update: Partial<Profile>; Relationships: [] }
      race_goals: { Row: RaceGoal; Insert: Omit<RaceGoal, 'id' | 'created_at' | 'updated_at'>; Update: Partial<RaceGoal>; Relationships: [] }
      weekly_templates: { Row: WeeklyTemplate; Insert: Omit<WeeklyTemplate, 'id' | 'created_at'>; Update: Partial<WeeklyTemplate>; Relationships: [] }
      training_plans: { Row: TrainingPlan; Insert: Omit<TrainingPlan, 'id' | 'created_at' | 'updated_at'>; Update: Partial<TrainingPlan>; Relationships: [] }
      planned_workouts: { Row: PlannedWorkout; Insert: Omit<PlannedWorkout, 'id' | 'created_at'>; Update: Partial<PlannedWorkout>; Relationships: [] }
      completed_workouts: { Row: CompletedWorkout; Insert: Omit<CompletedWorkout, 'id' | 'created_at'>; Update: Partial<CompletedWorkout>; Relationships: [] }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      experience_level: ExperienceLevel
      race_distance: RaceDistance
      discipline: Discipline
      training_phase: TrainingPhase
      plan_status: PlanStatus
    }
  }
}
