import { useCallback, useState } from 'react'

// Deliberately keeps its pre-rebrand name: this key already holds every existing
// user's visited-topics set, and renaming it would read back empty once, silently
// un-marking every topic they've opened. It is never shown to the user.
const KEY = 'math_trainer_visited_topics'

function loadVisited(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

export function useVisitedTopics() {
  const [visited, setVisited] = useState<Set<string>>(loadVisited)

  const markVisited = useCallback((topicId: string) => {
    setVisited((prev) => {
      if (prev.has(topicId)) return prev
      const next = new Set(prev)
      next.add(topicId)
      localStorage.setItem(KEY, JSON.stringify([...next]))
      return next
    })
  }, [])

  return { visited, markVisited }
}
