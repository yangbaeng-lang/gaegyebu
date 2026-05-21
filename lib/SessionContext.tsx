'use client'
import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'

type SessionContextType = {
  refreshKey: number
  decimalPlaces: number
  switchSession: (id: number) => Promise<void>
  refreshDecimalPlaces: () => void
}

const SessionContext = createContext<SessionContextType>({
  refreshKey: 0,
  decimalPlaces: 0,
  switchSession: async () => {},
  refreshDecimalPlaces: () => {},
})

export function SessionProvider({ children }: { children: ReactNode }) {
  const [treeKey, setTreeKey] = useState(0)
  const [decimalPlaces, setDecimalPlaces] = useState(0)

  const fetchDecimalPlaces = useCallback(() => {
    fetch('/api/sessions', { cache: 'no-store' })
      .then(r => r.json())
      .then(({ sessions, current }: { sessions: { id: number; decimalPlaces: number }[]; current: number }) => {
        const session = sessions.find(s => s.id === current)
        setDecimalPlaces(session?.decimalPlaces ?? 0)
      })
      .catch(() => {})
  }, [])

  useEffect(() => { fetchDecimalPlaces() }, [fetchDecimalPlaces, treeKey])

  const switchSession = useCallback(async (id: number) => {
    await fetch(`/api/sessions/${id}`, { method: 'POST' })
    sessionStorage.setItem('sectionSwitch', '1')
    setTreeKey(k => k + 1)
  }, [])

  return (
    <SessionContext.Provider value={{ refreshKey: treeKey, decimalPlaces, switchSession, refreshDecimalPlaces: fetchDecimalPlaces }}>
      <div key={treeKey} style={{ display: 'contents' }}>
        {children}
      </div>
    </SessionContext.Provider>
  )
}

export const useSession = () => useContext(SessionContext)
