import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

export interface User {
  id: number
  name: string
  email: string
  phone?: string
  status: string
  two_factor_enabled: boolean
  master_role?: string
  roles?: Array<{ name: string }>
  permissions?: Array<{ name: string }>
}

export interface TenantContext {
  id: string
  name: string
  slug: string
  logo_url?: string | null
  primary_color?: string
  status?: string
  trial_days_left?: number | null
  trial_ends_at?: string | null
  trial_expired?: boolean
  user_limit?: number
}

export type AuthContext = "master" | "tenant"

interface AuthState {
  user: User | null
  token: string | null
  context: AuthContext | null
  tenant: TenantContext | null
  isAuthenticated: boolean
  isLoading: boolean
  mfaRequired: boolean
  challengeToken: string | null

  setAuth: (token: string, user: User, context: AuthContext, tenant?: TenantContext | null) => void
  setMfaChallenge: (challengeToken: string) => void
  clearAuth: () => void
  fetchMe: () => Promise<void>
  hasRole: (role: string) => boolean
  hasPermission: (permission: string) => boolean
  isSuperAdmin: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      context: null,
      tenant: null,
      isAuthenticated: false,
      isLoading: false,
      mfaRequired: false,
      challengeToken: null,

      setAuth: (token, user, context, tenant) => {
        set({
          token,
          user,
          context,
          tenant: tenant ?? null,
          isAuthenticated: true,
          mfaRequired: false,
          challengeToken: null,
        })
      },

      setMfaChallenge: (challengeToken) => {
        set({
          mfaRequired: true,
          challengeToken,
          isAuthenticated: false,
        })
      },

      clearAuth: () => {
        set({
          token: null,
          user: null,
          context: null,
          tenant: null,
          isAuthenticated: false,
          mfaRequired: false,
          challengeToken: null,
        })
      },

      fetchMe: async () => {
        if (get().isLoading) return
        set({ isLoading: true })
        try {
          const { default: api } = await import("./api")
          const ctx = get().context
          const endpoint = ctx === "master" ? "/master/auth/me" : "/auth/me"
          const { data } = await api.get(endpoint)
          set({
            user: data.user,
            context: data.context,
            tenant: data.tenant ?? null,
            isAuthenticated: true,
          })
        } catch {
          set({ user: null, isAuthenticated: false, context: null, tenant: null })
        } finally {
          set({ isLoading: false })
        }
      },

      hasRole: (role) => {
        const user = get().user
        return user?.roles?.some((r) => r.name === role) ?? false
      },

      hasPermission: (permission) => {
        const user = get().user
        return user?.permissions?.some((p) => p.name === permission) ?? false
      },

      isSuperAdmin: () => {
        const { user, context } = get()
        return context === "master" && user?.master_role === "super_admin"
      },
    }),
    {
      name: "fai-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        context: state.context,
        tenant: state.tenant,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
