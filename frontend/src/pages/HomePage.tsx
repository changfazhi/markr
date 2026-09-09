import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Topic } from '../types/api'
import { useTopics } from '../hooks/useTopics'
import { useVisitedTopics } from '../hooks/useVisitedTopics'
import { useTopicsProgress } from '../hooks/useTopicsProgress'
import { useAuth } from '../contexts/AuthContext'
import { RoadmapGraph } from '../components/topic/RoadmapGraph'
import { TopicDrawer } from '../components/topic/TopicDrawer'
import { Spinner } from '../components/ui/Spinner'
import { ErrorMessage } from '../components/ui/ErrorMessage'

const BRICOLAGE = "'Bricolage Grotesque', sans-serif"

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-[#aab0d6]">
      <span className="w-[10px] h-[10px] rounded-full" style={{ background: color }} />
      {label}
    </div>
  )
}

export function HomePage() {
  const { topics, loading, error } = useTopics()
  const { markVisited } = useVisitedTopics()
  const progress = useTopicsProgress()
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null)
  const [checkoutToast, setCheckoutToast] = useState<string | null>(null)
  const [pendingSuccess, setPendingSuccess] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, refreshTier } = useAuth()

  // Detect ?checkout=success on mount and clean the URL immediately.
  // Don't read `user` here — Firebase auth is async and may still be null.
  useEffect(() => {
    const status = searchParams.get('checkout')
    if (!status) return
    setSearchParams(prev => { prev.delete('checkout'); return prev }, { replace: true })
    if (status === 'success') setPendingSuccess(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Once user is available and we have a pending success, poll the Firebase
  // server until the webhook-granted upgrade lands. Stripe delivers the
  // checkout.session.completed webhook asynchronously, so the redirect often
  // arrives before the user row is updated — a single refresh would read the
  // pre-payment tier and leave the user looking free.
  useEffect(() => {
    if (!pendingSuccess || !user) return
    setPendingSuccess(false)
    let cancelled = false

    const poll = async () => {
      setCheckoutToast('Payment received — activating Premium…')
      for (let attempt = 0; attempt < 10; attempt++) {
        const freshTier = await refreshTier().catch(() => null)
        if (cancelled) return
        if (freshTier === 'paid') {
          setCheckoutToast('Welcome to Premium! Your features are now unlocked.')
          setTimeout(() => { if (!cancelled) setCheckoutToast(null) }, 5000)
          return
        }
        await new Promise((r) => setTimeout(r, 2000))
        if (cancelled) return
      }
      setCheckoutToast('Payment received, but activation is taking longer than usual. Reload the page in a moment.')
      setTimeout(() => { if (!cancelled) setCheckoutToast(null) }, 8000)
    }

    void poll()
    return () => { cancelled = true }
  }, [pendingSuccess, user]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleTopicClick(topic: Topic) {
    markVisited(topic.id)
    setSelectedTopic(topic)
  }

  return (
    <div className="flex flex-col h-full bg-[#0b0e20]">
      {checkoutToast && (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 px-5 py-3 rounded-xl text-sm font-semibold text-white shadow-xl"
          style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}
        >
          {checkoutToast}
        </div>
      )}
      {/* Title bar */}
      {/* Title bar — trimmed hard on phones so the fitted map below isn't left a letterbox */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4 sm:pt-9 pb-3 sm:pb-5 w-full shrink-0">
        <div className="text-[11px] sm:text-[13px] font-bold uppercase tracking-[0.1em] text-[#a5abe0]">
          Your roadmap
        </div>
        <h1
          className="mt-1.5 sm:mt-3 text-2xl sm:text-4xl font-extrabold tracking-tight text-white"
          style={{ fontFamily: BRICOLAGE }}
        >
          <Link to="/" className="hover:text-[#c7cbff] transition-colors">
            Mark<span className="text-[#7c83ff]">r</span>
          </Link>
        </h1>
        <p className="hidden sm:block mt-3 text-[#aab0d6] max-w-2xl">
          A clear path through the whole syllabus. Follow the nodes, unlock topics as you go,
          and watch the map fill in.
        </p>
        <div className="mt-2.5 sm:mt-5 flex flex-wrap items-center gap-x-4 sm:gap-x-6 gap-y-2">
          <LegendDot color="#38bdf8" label="Pure Mathematics" />
          <LegendDot color="#34d399" label="Statistics" />
          <LegendDot color="#3a4170" label="Up next" />
        </div>
      </div>

      {/* Roadmap — fills all remaining height, no scrollbars */}
      <div className="relative flex-1 min-h-0">
        {/* Soft fade blends the dark header into the grid/glow canvas */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20"
          style={{ background: 'linear-gradient(to bottom, #0b0e20, transparent)' }}
        />
        {loading && (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        )}
        {error && <ErrorMessage message={error} />}
        {!loading && !error && (
          <RoadmapGraph
            topics={topics}
            progress={progress}
            onTopicClick={handleTopicClick}
          />
        )}
      </div>

      <TopicDrawer
        topic={selectedTopic}
        onClose={() => setSelectedTopic(null)}
      />
    </div>
  )
}
