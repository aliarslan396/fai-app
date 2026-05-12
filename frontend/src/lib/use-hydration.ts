import { useEffect, useState } from "react"
import { useAuthStore } from "./auth-store"

export function useHasHydrated() {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const unsubFinish = useAuthStore.persist.onFinishHydration(() => {
      setHydrated(true)
    })
    setHydrated(useAuthStore.persist.hasHydrated())
    return () => {
      unsubFinish()
    }
  }, [])

  return hydrated
}
