"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Package,
  FileText,
  Stamp,
  Users,
  AlertTriangle,
  Wrench,
  BarChart3,
  Settings,
  Building2,
  Activity,
  CreditCard,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useAuthStore } from "@/lib/auth-store"
import { resolveAssetUrl } from "@/lib/tenant"

const tenantNav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Parts", href: "/parts", icon: Package, permission: "parts.view" },
  { label: "Customers", href: "/customers", icon: Building2, permission: "customers.view" },
  { label: "Inspection Plans", href: "/plans", icon: FileText, permission: "plans.view" },
  { label: "Inspections", href: "/inspections", icon: Stamp, permission: "inspections.view" },
  { label: "NCR / CAPA", href: "/ncr", icon: AlertTriangle, permission: "ncr.view" },
  { label: "Gauges", href: "/gauges", icon: Wrench, permission: "gauges.view" },
  { label: "Reports", href: "/reports", icon: BarChart3, permission: "reports.view" },
]

const tenantAdminNav = [
  { label: "Users", href: "/admin/users", icon: Users, permission: "users.view" },
  { label: "Activity Log", href: "/admin/audit", icon: Activity, permission: "users.view" },
  { label: "Settings", href: "/admin/settings", icon: Settings, permission: "tenant.settings" },
]

const masterNav = [
  { label: "Tenants", href: "/master/tenants", icon: Building2 },
  { label: "Activity", href: "/master/activity", icon: Activity },
  { label: "Billing", href: "/master/billing", icon: CreditCard },
  { label: "Settings", href: "/master/settings", icon: Settings },
]

export function AppSidebar() {
  const pathname = usePathname()
  const { user, context, tenant, hasPermission } = useAuthStore()

  const isMaster = context === "master"
  const nav = isMaster ? masterNav : tenantNav.filter((item) => !item.permission || hasPermission(item.permission))
  const adminNav = isMaster ? [] : tenantAdminNav.filter((item) => !item.permission || hasPermission(item.permission))

  return (
    <aside className="hidden w-64 shrink-0 border-r bg-sidebar text-sidebar-foreground md:flex md:flex-col">
      <div className="flex h-14 items-center border-b px-6">
        <Link href={isMaster ? "/master/tenants" : "/dashboard"} className="flex items-center gap-2 font-semibold">
          {!isMaster && tenant?.logo_url ? (
            <img
              src={resolveAssetUrl(tenant.logo_url) ?? ""}
              alt={tenant.name}
              className="h-7 w-7 rounded-md object-contain"
            />
          ) : (
            <div
              className="flex h-7 w-7 items-center justify-center rounded-md text-sm font-bold text-white"
              style={{
                backgroundColor: !isMaster && tenant?.primary_color ? tenant.primary_color : undefined,
              }}
            >
              {isMaster ? "F" : (tenant?.name?.[0] || "F").toUpperCase()}
            </div>
          )}
          <span className="truncate">{isMaster ? "FAI Master" : tenant?.name || "FAI"}</span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        <div className="mb-3 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {isMaster ? "Platform" : "Workspace"}
        </div>
        {nav.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}

        {adminNav.length > 0 && (
          <>
            <div className="mb-3 mt-6 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Admin
            </div>
            {adminNav.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
          </>
        )}
      </nav>

      <div className="border-t p-4">
        <div className="text-xs text-muted-foreground">Signed in as</div>
        <div className="mt-1 truncate text-sm font-medium">{user?.name}</div>
        <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
        {isMaster && (
          <div className="mt-2 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            Super Admin
          </div>
        )}
      </div>
    </aside>
  )
}
