import { ApprovalNotificationBell } from "@/components/ApprovalNotificationBell";
import { ReactNode, useEffect, useState } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth, getRoleDashboardPath } from "@/lib/auth";
import { procurementAccess } from "@/lib/procurementAccess";
import type { User } from "@supabase/supabase-js";
import {
  Home,
  PlusSquare,
  List,
  Users,
  FileText,
  ShoppingCart,
  Box,
  Ticket,
  LogOut,
  Scale,
  ShoppingBag,
  UserCheck,
  Truck,
  Receipt,
  Zap,
  Award,
  Menu,
  X,
  Workflow,
  Wallet,
  type LucideIcon
} from "lucide-react";

interface LayoutProps {
  children: ReactNode;
  extraHeader?: ReactNode;
  hideGlobalNav?: boolean;
}

const Layout = ({ children, extraHeader, hideGlobalNav }: LayoutProps) => {
  let authCtx: any = null;
  try {
    authCtx = useAuth();
  } catch (e) {
    // AuthProvider may not be mounted yet in some contexts
    authCtx = null;
  }

  const [user, setUser] = useState<User | null>(() => authCtx?.user || null);
  const [isAdmin, setIsAdmin] = useState(() => Boolean(authCtx?.hasRole("admin")));
  const [isPrinciple, setIsPrinciple] = useState(() =>
    Boolean(authCtx?.hasRole("principal") || authCtx?.hasRole("principle")),
  );
  const [isHod, setIsHod] = useState(() => Boolean(authCtx?.hasRole("hod")));
  const [isViewer, setIsViewer] = useState(() => Boolean(authCtx?.hasRole("viewer")));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pendingPrincipalCount, setPendingPrincipalCount] = useState<number>(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  // Fast sync from AuthContext cached in memory/localStorage (0ms delay)
  useEffect(() => {
    if (authCtx?.roles && authCtx.roles.length > 0) {
      setIsAdmin(authCtx.hasRole("admin"));
      setIsPrinciple(authCtx.hasRole("principal") || authCtx.hasRole("principle"));
      setIsHod(authCtx.hasRole("hod"));
      setIsViewer(authCtx.hasRole("viewer"));
      if (authCtx.user) setUser(authCtx.user);
    }
  }, [authCtx?.roles, authCtx?.user]);

  useEffect(() => {
    // Check authentication
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      // A failed token refresh (offline, laptop waking up) returns an error, not a logout:
      // stay put — the client retries and onAuthStateChange reports the outcome.
      if (error && !session) return;
      setUser(session?.user ?? null);
      if (!session) {
        navigate({ to: "/auth" });
      } else {
        checkUserRoles(session.user.id);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // A null session on other events (e.g. INITIAL_SESSION after a failed refresh while
      // offline) isn't a logout; the first-load check above handles "never signed in".
      if (!session && event !== "SIGNED_OUT") return;
      setUser(session?.user ?? null);
      if (!session) {
        navigate({ to: "/auth" });
      } else {
        checkUserRoles(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    // If principal, fetch pending principal approvals count
    const fetchPendingCount = async () => {
      try {
        const { data, error, count } = await supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending_principal");
        if (error) throw error;
        setPendingPrincipalCount(count || 0);
      } catch (e) {
        console.error("Failed to load pending principal count", e);
      }
    };

    if (isPrinciple) fetchPendingCount();
  }, [isPrinciple, location.pathname]);

  const checkUserRoles = async (userId: string) => {
    // If AuthContext already has cached/loaded roles, sync with 0 network calls
    if (authCtx?.roles && authCtx.roles.length > 0) {
      setIsAdmin(authCtx.hasRole("admin"));
      setIsPrinciple(authCtx.hasRole("principal") || authCtx.hasRole("principle"));
      setIsHod(authCtx.hasRole("hod"));
      setIsViewer(authCtx.hasRole("viewer"));
      return;
    }

    try {
      // Single query fetching all user roles at once instead of 4 sequential queries
      const { data: roleRows, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (error) {
        console.error("Error checking user roles:", error);
      } else if (roleRows) {
        const rolesList = roleRows.map((r: any) => r.role);
        setIsAdmin(rolesList.includes("admin"));
        setIsPrinciple(rolesList.includes("principal") || rolesList.includes("principle"));
        setIsHod(rolesList.includes("hod"));
        setIsViewer(rolesList.includes("viewer"));
      }
    } catch (error) {
      console.error("Error in checkUserRoles:", error);
      setIsAdmin(false);
      setIsPrinciple(false);
      setIsHod(false);
      setIsViewer(false);
    }
  };

  const handleLogout = async () => {
    // Only this browser: shared accounts stay signed in elsewhere.
    await supabase.auth.signOut({ scope: "local" });
    toast({
      title: "Logged out",
      description: "You have been successfully logged out.",
    });
    navigate({ to: "/auth" });
  };

  const isRole = (role: string) => {
    if (role === "admin" && isAdmin) return true;
    if ((role === "principal" || role === "principle") && isPrinciple) return true;
    if (role === "hod" && isHod) return true;
    if (role === "viewer" && isViewer) return true;
    return authCtx?.hasRole ? authCtx.hasRole(role) : false;
  };

  const hasAny = (roles: string[]) => roles.some((r) => isRole(r));

  // General / Campus permissions
  const canSeeAdminItems = isAdmin || isRole("admin");
  const canSeeViewerItems = isViewer || isRole("viewer");
  const canSeeHodInventory = isHod || isRole("hod");
  const canSeeInventory =
    canSeeAdminItems || isRole("stores") || isPrinciple || isRole("principal");
  const canSeePrincipalApprovals = isPrinciple || isRole("principal") || canSeeAdminItems;
  const proc = procurementAccess(isRole);
  // Campus tickets are for people who use campus facilities; pure procurement desks
  // (finance, procurement, EVP, committee) don't raise them.
  const canRaiseTickets = Boolean(
    user &&
    (canSeeAdminItems ||
      hasAny([
        "hod",
        "principal",
        "faculty",
        "requester",
        "user",
        "staff",
        "librarian",
        "stores",
      ]) ||
      (!canSeeViewerItems && !proc.any)),
  );

  type NavItem = {
    label: string;
    path: string;
    icon: LucideIcon;
    iconClass?: string;
    prefix?: boolean;
    badge?: number;
  };
  const BASE_ACTIVE = "bg-[#0B1437] text-white font-semibold shadow-xs rounded-xl";
  const TINT = {
    blue: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 font-semibold border border-blue-200/60 dark:border-blue-800/40",
    purple:
      "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 font-semibold border border-purple-200/60 dark:border-purple-800/40",
    sky: "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 font-semibold border border-sky-200/60 dark:border-sky-800/40",
    emerald:
      "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-semibold border border-emerald-200/60 dark:border-emerald-800/40",
    indigo:
      "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 font-semibold border border-indigo-200/60 dark:border-indigo-800/40",
    amber:
      "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-semibold border border-amber-200/60 dark:border-amber-800/40",
    slate:
      "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold border border-slate-200 dark:border-slate-700",
  };
  const show = <T,>(cond: boolean, items: T[]) => (cond ? items : []);

  const dashboardPath = getRoleDashboardPath(authCtx?.primaryRole ?? null);
  const campusNav: NavItem[] = [
    { label: "Dashboard", path: dashboardPath, icon: Home },
    ...show(canSeeAdminItems, [
      { label: "Add Item", path: "/add", icon: PlusSquare },
      { label: "Categories", path: "/categories", icon: List },
      { label: "Departments", path: "/departments", icon: FileText },
      { label: "Users", path: "/users", icon: Users },
      { label: "Manage Tickets", path: "/admin/tickets", icon: FileText },
    ]),
    ...show(canSeeHodInventory, [
      { label: "Dept Inventory", path: "/hod/inventory", icon: Box, prefix: true },
    ]),
    ...show(canSeeInventory, [{ label: "Inventory", path: "/inventory", icon: Box }]),
    ...show(canSeeViewerItems, [
      { label: "Inventory", path: "/viewer/inventory", icon: Box, prefix: true },
      { label: "Quotations", path: "/viewer/quotations", icon: ShoppingCart },
    ]),
    ...show(canRaiseTickets, [
      { label: "Raise Ticket", path: "/raise-ticket", icon: Ticket },
      { label: "My Tickets", path: "/my-tickets", icon: List },
    ]),
    ...show(canSeePrincipalApprovals, [
      {
        label: "Approve Tickets",
        path: "/principal/approvals",
        icon: FileText,
        badge: pendingPrincipalCount,
      },
    ]),
  ];
  // How the system works — for every signed-in user, pinned to the bottom of the sidebar.
  const architectureItem: NavItem = {
    label: "System Architecture",
    path: "/architecture",
    icon: Workflow,
    iconClass: "text-indigo-500",
  };
  const procurementNav: NavItem[] = [
    ...show(proc.hub, [
      { label: "Procurement Hub", path: "/procurement", icon: Home },
    ]),
    ...show(proc.approvals, [
      {
        label: "My Approvals",
        path: "/procurement/approvals",
        icon: UserCheck,
      },
    ]),
    ...show(proc.budgets, [
      {
        label: "Annual Budgets",
        path: "/procurement/budgets",
        icon: Wallet,
      },
    ]),
    ...show(proc.pr, [
      {
        label: "Requisitions (PR)",
        path: "/procurement/raise-pr",
        icon: PlusSquare,
      },
    ]),
    ...show(proc.rfqs, [
      { label: "RFQs & Quotes", path: "/procurement/rfqs", icon: FileText },
    ]),
    ...show(proc.cs, [
      {
        label: "Comparative (CS)",
        path: "/procurement/cs",
        icon: Scale,
      },
    ]),
    ...show(proc.pos, [
      {
        label: "Purchase Orders",
        path: "/procurement/orders",
        icon: ShoppingBag,
      },
    ]),
    ...show(proc.grns, [
      {
        label: "Goods Receipt (GRN)",
        path: "/procurement/grns",
        icon: Truck,
      },
    ]),
    ...show(proc.invoices, [
      {
        label: "Invoices & Match",
        path: "/procurement/invoices",
        icon: Receipt,
      },
    ]),
    ...show(proc.emergency, [
      {
        label: "Emergency Procurement",
        path: "/procurement/emergency",
        icon: Zap,
        iconClass: "text-amber-500",
      },
    ]),
    ...show(proc.vendorRatings, [
      {
        label: "Vendor Ratings",
        path: "/procurement/vendor-ratings",
        icon: Award,
      },
    ]),
    ...show(proc.vendors, [
      {
        label: "Vendor Master",
        path: "/procurement/vendors",
        icon: Users,
      },
    ]),
    // Never two buttons for one page: the Dashboard already covers its own target.
  ].filter((item) => item.path !== dashboardPath);

  const isActive = (item: NavItem) =>
    item.prefix ? location.pathname.startsWith(item.path) : location.pathname === item.path;

  const renderNav = (mobile: boolean, footer = false) => {
    const button = (item: NavItem) => (
      <li key={item.path}>
        <button
          onClick={() => {
            navigate({ to: item.path });
            if (mobile) setMobileMenuOpen(false);
          }}
          aria-current={isActive(item) ? "page" : undefined}
          className={`w-full flex items-center justify-between text-left gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${mobile ? "text-sm" : "text-[13.5px] whitespace-nowrap"} ${
            isActive(item)
              ? BASE_ACTIVE
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <span className="flex items-center gap-3 min-w-0">
            <item.icon className={`w-4 h-4 shrink-0 ${isActive(item) ? "text-white" : (item.iconClass ?? "")}`} />
            <span className="truncate">{item.label}</span>
          </span>
          {!!item.badge && (
            <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 text-xs font-semibold">
              {item.badge}
            </span>
          )}
        </button>
      </li>
    );
    if (footer) return <ul>{button(architectureItem)}</ul>;
    return (
      <ul className="space-y-1">
        {campusNav.map(button)}
        {procurementNav.length > 0 && (
          <>
            <li className="pt-3 pb-1 border-t border-slate-200 dark:border-slate-800">
              <span className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Procurement
              </span>
            </li>
            {procurementNav.map(button)}
          </>
        )}
      </ul>
    );
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50/80 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Fixed top header */}
      <header className="fixed top-0 left-0 right-0 z-40 border-b bg-white/90 backdrop-blur-sm shadow-sm dark:bg-slate-900/90 dark:border-slate-700 h-20">
        <div className="w-full px-3 sm:px-6 lg:px-8 xl:px-10 h-full flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <img
              src="/amc.jpeg"
              alt="AMC Logo"
              className="h-9 w-12 sm:h-12 sm:w-16 rounded-lg object-contain shadow-md shrink-0"
            />
            <div className="min-w-0">
              <h1 className="text-sm sm:text-lg font-bold text-gray-800 dark:text-gray-100 truncate">
                AMC Inventory System
              </h1>
              <p className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 font-medium truncate">
                {authCtx?.loading && !authCtx?.primaryRole ? (
                  <span className="inline-block w-24 h-3 bg-muted/60 animate-pulse rounded" />
                ) : (
                  (authCtx?.primaryRole === "admin" && "Administrator") ||
                  (authCtx?.primaryRole === "principle" && "Principal") ||
                  (authCtx?.primaryRole === "principal" && "Principal") ||
                  (authCtx?.primaryRole === "evp" && "Executive Vice President") ||
                  (authCtx?.primaryRole === "director_admin_finance" &&
                    "Director (Admin & Finance)") ||
                  (authCtx?.primaryRole === "purchase_committee" && "Purchase Committee") ||
                  (authCtx?.primaryRole === "procurement_officer" && "Procurement Officer") ||
                  (authCtx?.primaryRole === "procurement_executive" && "Procurement Executive") ||
                  (authCtx?.primaryRole === "stores" && "Central Stores & Gate") ||
                  (authCtx?.primaryRole === "finance" && "Finance & Accounts") ||
                  (authCtx?.primaryRole === "hod" && "Head of Department (HOD)") ||
                  (authCtx?.primaryRole === "librarian" && "Librarian") ||
                  (authCtx?.primaryRole === "viewer" && "Viewer / Auditor") ||
                  (authCtx?.primaryRole === "faculty" && "Faculty Requisitioner") ||
                  (authCtx?.primaryRole === "user" && "Faculty / Academic Requisitioner") ||
                  (isAdmin ? "Administrator" : isPrinciple ? "Principal" : "Faculty / Staff Access")
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <ApprovalNotificationBell />
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="transition-all duration-300 hover:scale-105 hover:shadow-xs px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border border-rose-200 bg-rose-50/60 text-rose-700 hover:bg-rose-100 hover:text-rose-900 font-semibold flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm"
            >
              <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer (xs to md) */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-30 pt-20 bg-slate-900/60 backdrop-blur-sm animate-in fade-in-0 duration-200">
          <div className="bg-white dark:bg-slate-900 w-4/5 max-w-sm h-full shadow-2xl border-r border-slate-200 dark:border-slate-800 flex flex-col">
            <nav className="flex-1 overflow-y-auto p-4 py-6">{renderNav(true)}</nav>
            <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 p-3">
              {renderNav(true, true)}
            </div>
          </div>
        </div>
      )}

      {/* Sidebar for md+ */}
      <aside className="hidden md:flex md:flex-col md:fixed md:top-20 md:left-0 md:h-[calc(100vh-5rem)] md:w-64 lg:w-72 md:bg-white/90 md:backdrop-blur-md md:shadow-sm dark:md:bg-slate-900/90 dark:md:border-slate-700 md:border-r z-20">
        <nav className="flex-1 overflow-y-auto px-3.5 py-6">{renderNav(false)}</nav>
        {/* Pinned to the bottom-left for every role */}
        <div className="shrink-0 border-t border-slate-200 dark:border-slate-700 px-3.5 py-3">
          {renderNav(false, true)}
        </div>
      </aside>

      {/* Main content wrapper positioned to the right of fixed sidebar */}
      <div className="pt-20 md:pl-64 lg:pl-72 min-h-screen flex flex-col transition-all duration-300">
        <main className="flex-1 w-full max-w-full px-3 sm:px-6 lg:px-8 xl:px-10 py-5 sm:py-8 animate-in fade-in-0 duration-500 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
