'use client'
import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

type SessionContextType = {
  refreshKey: number
  switchSession: (id: number) => Promise<void>
}

const SessionContext = createContext<SessionContextType>({
  refreshKey: 0,
  switchSession: async () => {},
})

export function SessionProvider({ children }: { children: ReactNode }) {
  const [treeKey, setTreeKey] = useState(0)

  const switchSession = useCallback(async (id: number) => {
    await fetch(`/api/sessions/${id}`, { method: 'POST' })
    sessionStorage.setItem('sectionSwitch', '1')
    setTreeKey(k => k + 1)
  }, [])

  return (
    <SessionContext.Provider value={{ refreshKey: treeKey, switchSession }}>
      <div key={treeKey} style={{ display: 'contents' }}>
        {children}
      </div>
    </SessionContext.Provider>
  )
}

export const useSession = () => useContext(SessionContext)
