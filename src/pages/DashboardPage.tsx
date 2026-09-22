import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { RaceGoal } from '@/lib/database.types'

export default function DashboardPage() {
  const { profile, user, signOut } = useAuth()
  const navigate = useNavigate()
  const [activeGoal, setActiveGoal] = useState<RaceGoal | null>(null)
  const [hasTemplate, setHasTemplate] = useState(false)
  const [hasSavedPlan, setHasSavedPlan] = useState(false)
  const [loadingGoal, setLoadingGoal] = useState(true)

  useEffect(() => {
    if (!user) return

    async function load() {
      const { data: goals } = await supabase
        .from('race_goals')
        .select('*')
        .eq('user_id', user!.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)

      const goal = goals?.[0] as RaceGoal | undefined ?? null
      setActiveGoal(goal)

      if (goal) {
        const { count } = await supabase
          .from('weekly_templates')
          .select('id', { count: 'exact', head: true })
          .eq('race_goal_id', goal.id)
          .eq('user_id', user!.id)

        setHasTemplate((count ?? 0) > 0)

        // Same lookup as the calendar — a head-count query can return null
        // even when a saved plan row exists.
        const { data: plans } = await supabase
          .from('training_plans')
          .select('id')
          .eq('race_goal_id', goal.id)
          .eq('user_id', user!.id)
          .order('created_at', { ascending: false })
          .limit(1)

        setHasSavedPlan((plans?.length ?? 0) > 0)
      }

      setLoadingGoal(false)
    }

    load()
  }, [user])

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  const hasGoal = !!activeGoal

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">
          tri<span className="text-indigo-500">Hard</span>
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">
            {profile?.display_name || user?.email}
          </span>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold mb-2">Dashboard</h2>

        {activeGoal && (
          <p className="text-sm text-gray-400 mb-6">
            Training for <span className="text-white font-medium">{activeGoal.name}</span>
            {' · '}
            {new Date(activeGoal.race_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        )}

        {!loadingGoal && !activeGoal && (
          <p className="text-sm text-gray-500 mb-6">Set a race goal to get started</p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Race Goal */}
          <button
            onClick={() => navigate('/race-goal')}
            className="rounded-xl bg-gray-900 border border-gray-800 p-6 text-left hover:border-indigo-500 transition-colors"
          >
            <h3 className="text-lg font-semibold mb-1">🏊‍♂️ {hasGoal ? 'Edit' : 'Set'} Race Goal</h3>
            <p className="text-sm text-gray-400">
              {hasGoal ? `${activeGoal.name} — tap to change` : 'Pick your race distance, date, and target times'}
            </p>
          </button>

          {/* Weekly Template */}
          {hasGoal ? (
            <button
              onClick={() => navigate(`/weekly-template?goal=${activeGoal.id}`)}
              className="rounded-xl bg-gray-900 border border-gray-800 p-6 text-left hover:border-indigo-500 transition-colors"
            >
              <h3 className="text-lg font-semibold mb-1">📅 Weekly Template</h3>
              <p className="text-sm text-gray-400">
                {hasTemplate ? 'Edit your weekly structure' : 'Build your recurring weekly workout structure'}
              </p>
            </button>
          ) : (
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-6 opacity-50">
              <h3 className="text-lg font-semibold mb-1">📅 Weekly Template</h3>
              <p className="text-sm text-gray-400">Set a race goal first</p>
            </div>
          )}

          {/* Training Calendar */}
          {hasGoal && hasTemplate ? (
            <button
              onClick={() => navigate(`/training-calendar?goal=${activeGoal.id}`)}
              className="rounded-xl bg-gray-900 border border-gray-800 p-6 text-left hover:border-indigo-500 transition-colors"
            >
              <h3 className="text-lg font-semibold mb-1">📊 Training Calendar</h3>
              <p className="text-sm text-gray-400">
                Generate your periodized training plan
              </p>
            </button>
          ) : (
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-6 opacity-50">
              <h3 className="text-lg font-semibold mb-1">📊 Training Calendar</h3>
              <p className="text-sm text-gray-400">
                {!hasGoal ? 'Set a race goal first' : 'Build a weekly template first'}
              </p>
            </div>
          )}

          {hasGoal && hasSavedPlan ? (
            <button
              onClick={() => navigate(`/track?goal=${activeGoal.id}`)}
              className="rounded-xl bg-gray-900 border border-gray-800 p-6 text-left hover:border-indigo-500 transition-colors"
            >
              <h3 className="text-lg font-semibold mb-1">✅ Track Workouts</h3>
              <p className="text-sm text-gray-400">
                Log actuals and see your execution score
              </p>
            </button>
          ) : (
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-6 opacity-50">
              <h3 className="text-lg font-semibold mb-1">✅ Track Workouts</h3>
              <p className="text-sm text-gray-400">
                {!hasGoal ? 'Set a race goal first' : !hasTemplate ? 'Build a weekly template first' : 'Save a training plan first'}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
