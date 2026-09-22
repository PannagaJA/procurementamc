import { ReactNode, useEffect, useState } from "react";
import { useNavigate, useLocation } from '@tanstack/react-router';
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from '@/lib/auth';
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
} from "lucide-react";

interface LayoutProps {
  children: ReactNode;
  extraHeader?: ReactNode;
  hideGlobalNav?: boolean;
}

const Layout = ({ children, extraHeader, hideGlobalNav }: LayoutProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPrinciple, setIsPrinciple] = useState(false);
  const [isHod, setIsHod] = useState(false);
  const [isViewer, setIsViewer] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pendingPrincipalCount, setPendingPrincipalCount] = useState<number>(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  let authCtx: any = null;
  try {
    authCtx = useAuth();
  } catch (e) {
    // AuthProvider may not be mounted yet in some contexts
    authCtx = null;
  }

  useEffect(() => {
    // Check authentication
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session) {
        navigate({ to: "/auth" });
      } else {
        checkUserRoles(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
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
          .from('tickets')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending_principal');
        if (error) throw error;
        setPendingPrincipalCount(count || 0);
      } catch (e) {
        console.error('Failed to load pending principal count', e);
      }
    };

    if (isPrinciple) fetchPendingCount();
  }, [isPrinciple, location.pathname]);

  const checkUserRoles = async (userId: string) => {
    try {
      // Check admin role
      const { data: adminData, error: adminError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();

      if (adminError) {
        console.error("Error checking admin role:", adminError);
        setIsAdmin(false);
      } else {
        setIsAdmin(!!adminData);
      }

      // Check principle role
      const { data: principleData, error: principleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "principle")
        .maybeSingle();

      if (principleError) {
        console.error("Error checking principle role:", principleError);
        setIsPrinciple(false);
      } else {
        setIsPrinciple(!!principleData);
      }

      // Check HOD role
      const { data: hodData, error: hodError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'hod')
        .maybeSingle();

      if (hodError) {
        console.error('Error checking HOD role:', hodError);
        setIsHod(false);
      } else {
        setIsHod(!!hodData);
      }

      // Check Viewer role
      const { data: viewerData, error: viewerError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'viewer')
        .maybeSingle();

      if (viewerError) {
        console.error('Error checking viewer role:', viewerError);
        setIsViewer(false);
      } else {
        setIsViewer(!!viewerData);
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
    await supabase.auth.signOut();
    toast({
      title: "Logged out",
      description: "You have been successfully logged out.",
    });
    navigate({ to: "/auth" });
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Fixed top header */}
      <header className="fixed top-0 left-0 right-0 z-40 border-b bg-white/90 backdrop-blur-sm shadow-sm dark:bg-slate-900/90 dark:border-slate-700 h-20">
        <div className="container mx-auto px-4 sm:px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <img
              src="/amc.jpeg"
              alt="AMC Logo"
              className="h-10 w-14 sm:h-12 sm:w-16 rounded-lg object-contain shadow-md"
            />
            <div>
              <h1 className="text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100">AMC Inventory System</h1>
              <p className="text-[11px] sm:text-xs text-gray-600 dark:text-gray-400 font-medium">
                {(authCtx?.primaryRole === 'admin' && 'Administrator') || (authCtx?.primaryRole === 'principle' && 'Principal') || (authCtx?.primaryRole === 'hod' && 'HOD') || (authCtx?.primaryRole === 'librarian' && 'Librarian') || (authCtx?.primaryRole === 'viewer' && 'Viewer') || (isAdmin ? 'Administrator' : isPrinciple ? 'Principal' : 'User Access')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleLogout}
              className="transition-all duration-300 hover:scale-105 hover:shadow-md px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg border-red-300 text-red-600 hover:bg-red-50 flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm"
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
          <div className="bg-white dark:bg-slate-900 w-4/5 max-w-sm h-full shadow-2xl overflow-y-auto border-r border-slate-200 dark:border-slate-800 p-4">
            <nav className="py-2">
              <ul className="space-y-1">
                <li>
                  {(() => {
                    const role = authCtx?.primaryRole;
                    const target = role === 'hod' ? '/hod' : role === 'principle' ? '/principal' : role === 'librarian' ? '/librarian' : role === 'viewer' ? '/viewer' : '/';
                    const isActive = location.pathname === target || (target === '/' && location.pathname === '/');
                    return (
                      <button onClick={() => { navigate({ to: target }); setMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors ${isActive ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                        <Home className="w-4 h-4 shrink-0" />
                        <span className="truncate">Dashboard</span>
                      </button>
                    );
                  })()}
                </li>
                {isAdmin && (
                  <>
                    <li>
                      <button onClick={() => { navigate({ to: '/add' }); setMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors ${location.pathname === '/add' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                        <PlusSquare className="w-4 h-4 shrink-0" />
                        <span className="truncate">Add Item</span>
                      </button>
                    </li>
                    <li>
                      <button onClick={() => { navigate({ to: '/categories' }); setMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors ${location.pathname === '/categories' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                        <List className="w-4 h-4 shrink-0" />
                        <span className="truncate">Categories</span>
                      </button>
                    </li>
                    <li>
                      <button onClick={() => { navigate({ to: '/departments' }); setMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors ${location.pathname === '/departments' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                        <FileText className="w-4 h-4 shrink-0" />
                        <span className="truncate">Departments</span>
                      </button>
                    </li>
                    <li>
                      <button onClick={() => { navigate({ to: '/users' }); setMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors ${location.pathname === '/users' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                        <Users className="w-4 h-4 shrink-0" />
                        <span className="truncate">Users</span>
                      </button>
                    </li>
                    <li>
                      <button onClick={() => { navigate({ to: '/inventory' }); setMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors ${location.pathname === '/inventory' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                        <Box className="w-4 h-4 shrink-0" />
                        <span className="truncate">Inventory</span>
                      </button>
                    </li>
                    <li>
                      <button onClick={() => { navigate({ to: '/admin/tickets' }); setMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors ${location.pathname === '/admin/tickets' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                        <FileText className="w-4 h-4 shrink-0" />
                        <span className="truncate">Manage Tickets</span>
                      </button>
                    </li>
                  </>
                )}
                <li className="pt-3 pb-1 border-t border-slate-200 dark:border-slate-800">
                  <span className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Procurement (SOP)
                  </span>
                </li>
                <li>
                  <button onClick={() => { navigate({ to: '/procurement' }); setMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors ${location.pathname === '/procurement' ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 font-semibold border border-blue-200/60 dark:border-blue-800/40' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                    <Home className="w-4 h-4 shrink-0" />
                    <span className="truncate">Procurement Hub</span>
                  </button>
                </li>
                <li>
                  <button onClick={() => { navigate({ to: '/procurement/approvals' }); setMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors ${location.pathname === '/procurement/approvals' ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 font-semibold border border-purple-200/60 dark:border-purple-800/40' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                    <UserCheck className="w-4 h-4 shrink-0" />
                    <span className="truncate">My Approvals</span>
                  </button>
                </li>
                <li>
                  <button onClick={() => { navigate({ to: '/procurement/raise-pr' }); setMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors ${location.pathname === '/procurement/raise-pr' ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 font-semibold border border-blue-200/60 dark:border-blue-800/40' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                    <PlusSquare className="w-4 h-4 shrink-0" />
                    <span className="truncate">Requisitions (PR)</span>
                  </button>
                </li>
                <li>
                  <button onClick={() => { navigate({ to: '/procurement/rfqs' }); setMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors ${location.pathname === '/procurement/rfqs' ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 font-semibold border border-sky-200/60 dark:border-sky-800/40' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                    <FileText className="w-4 h-4 shrink-0" />
                    <span className="truncate">RFQs & Quotes</span>
                  </button>
                </li>
                <li>
                  <button onClick={() => { navigate({ to: '/procurement/cs' }); setMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors ${location.pathname === '/procurement/cs' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-semibold border border-emerald-200/60 dark:border-emerald-800/40' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                    <Scale className="w-4 h-4 shrink-0" />
                    <span className="truncate">Comparative (CS)</span>
                  </button>
                </li>
                <li>
                  <button onClick={() => { navigate({ to: '/procurement/orders' }); setMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors ${location.pathname === '/procurement/orders' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 font-semibold border border-indigo-200/60 dark:border-indigo-800/40' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                    <ShoppingBag className="w-4 h-4 shrink-0" />
                    <span className="truncate">Purchase Orders</span>
                  </button>
                </li>
                <li>
                  <button onClick={() => { navigate({ to: '/procurement/grns' }); setMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors ${location.pathname === '/procurement/grns' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-semibold border border-emerald-200/60 dark:border-emerald-800/40' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                    <Truck className="w-4 h-4 shrink-0" />
                    <span className="truncate">Goods Receipt (GRN)</span>
                  </button>
                </li>
                <li>
                  <button onClick={() => { navigate({ to: '/procurement/invoices' }); setMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors ${location.pathname === '/procurement/invoices' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-semibold border border-emerald-200/60 dark:border-emerald-800/40' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                    <Receipt className="w-4 h-4 shrink-0" />
                    <span className="truncate">Invoices & Match</span>
                  </button>
                </li>
                <li>
                  <button onClick={() => { navigate({ to: '/procurement/emergency' }); setMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors ${location.pathname === '/procurement/emergency' ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-semibold border border-amber-200/60 dark:border-amber-800/40' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                    <Zap className="w-4 h-4 shrink-0 text-amber-500" />
                    <span className="truncate">Emergency Procurement</span>
                  </button>
                </li>
                <li>
                  <button onClick={() => { navigate({ to: '/procurement/vendor-ratings' }); setMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors ${location.pathname === '/procurement/vendor-ratings' ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 font-semibold border border-purple-200/60 dark:border-purple-800/40' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                    <Award className="w-4 h-4 shrink-0" />
                    <span className="truncate">Vendor Ratings</span>
                  </button>
                </li>
                <li>
                  <button onClick={() => { navigate({ to: '/procurement/vendors' }); setMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors ${location.pathname === '/procurement/vendors' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold border border-slate-200 dark:border-slate-700' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                    <Users className="w-4 h-4 shrink-0" />
                    <span className="truncate">Vendor Master</span>
                  </button>
                </li>
                <li className="pt-2">
                  <button onClick={() => { navigate({ to: '/architecture' }); setMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors ${location.pathname === '/architecture' ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 font-semibold border border-blue-200/60 dark:border-blue-800/40' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                    <Workflow className="w-4 h-4 shrink-0 text-indigo-500" />
                    <span className="truncate">System Architecture</span>
                  </button>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      )}

      {/* Sidebar for md+ */}
      <aside className="hidden md:block md:fixed md:top-20 md:left-0 md:h-[calc(100vh-5rem)] md:w-64 lg:w-72 md:bg-white/90 md:backdrop-blur-md md:shadow-sm dark:md:bg-slate-900/90 dark:md:border-slate-700 md:border-r md:overflow-y-auto z-20">
        <nav className="px-3.5 py-6">
          <ul className="space-y-1">
            <li>
              {(() => {
                const role = authCtx?.primaryRole;
                const target = role === 'hod' ? '/hod' : role === 'principle' ? '/principal' : role === 'librarian' ? '/librarian' : role === 'viewer' ? '/viewer' : '/';
                const isActive = location.pathname === target || (target === '/' && location.pathname === '/');
                return (
                  <button onClick={() => navigate({ to: target })} className={`w-full flex items-center text-left gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors whitespace-nowrap ${isActive ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                    <Home className="w-4 h-4 shrink-0" />
                    <span className="truncate">Dashboard</span>
                  </button>
                );
              })()}
            </li>
            {isAdmin && (
              <>
                <li>
                  <button onClick={() => navigate({ to: '/add' })} className={`w-full flex items-center text-left gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors whitespace-nowrap ${location.pathname === '/add' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                    <PlusSquare className="w-4 h-4 shrink-0" />
                    <span className="truncate">Add Item</span>
                  </button>
                </li>
                <li>
                  <button onClick={() => navigate({ to: '/categories' })} className={`w-full flex items-center text-left gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors whitespace-nowrap ${location.pathname === '/categories' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                    <List className="w-4 h-4 shrink-0" />
                    <span className="truncate">Categories</span>
                  </button>
                </li>
                <li>
                  <button onClick={() => navigate({ to: '/departments' })} className={`w-full flex items-center text-left gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors whitespace-nowrap ${location.pathname === '/departments' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                    <FileText className="w-4 h-4 shrink-0" />
                    <span className="truncate">Departments</span>
                  </button>
                </li>
                <li>
                  <button onClick={() => navigate({ to: '/users' })} className={`w-full flex items-center text-left gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors whitespace-nowrap ${location.pathname === '/users' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                    <Users className="w-4 h-4 shrink-0" />
                    <span className="truncate">Users</span>
                  </button>
                </li>
                <li>
                  <button onClick={() => navigate({ to: '/request-quotation' })} className={`w-full flex items-center text-left gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors whitespace-nowrap ${location.pathname === '/request-quotation' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                    <ShoppingCart className="w-4 h-4 shrink-0" />
                    <span className="truncate">Request Quotation</span>
                  </button>
                </li>
                <li>
                  <button onClick={() => navigate({ to: '/inventory' })} className={`w-full flex items-center text-left gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors whitespace-nowrap ${location.pathname === '/inventory' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                    <Box className="w-4 h-4 shrink-0" />
                    <span className="truncate">Inventory</span>
                  </button>
                </li>
              </>
            )}

            {!isAdmin && (
              <>
                {isViewer ? (
                  <>
                    <li>
                      <button onClick={() => navigate({ to: '/viewer/inventory' })} className={`w-full flex items-center text-left gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors whitespace-nowrap ${location.pathname.startsWith('/viewer/inventory') ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                        <Box className="w-4 h-4 shrink-0" />
                        <span className="truncate">Inventory</span>
                      </button>
                    </li>
                    <li>
                      <button onClick={() => navigate({ to: '/viewer/quotations' })} className={`w-full flex items-center text-left gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors whitespace-nowrap ${location.pathname === '/viewer/quotations' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                        <ShoppingCart className="w-4 h-4 shrink-0" />
                        <span className="truncate">Quotations</span>
                      </button>
                    </li>
                  </>
                ) : (
                  <>
                    <li>
                      <button onClick={() => navigate({ to: '/raise-ticket' })} className={`w-full flex items-center text-left gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors whitespace-nowrap ${location.pathname === '/raise-ticket' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                        <Ticket className="w-4 h-4 shrink-0" />
                        <span className="truncate">Raise Ticket</span>
                      </button>
                    </li>
                    <li>
                      <button onClick={() => navigate({ to: '/procure-request' })} className={`w-full flex items-center text-left gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors whitespace-nowrap ${location.pathname === '/procure-request' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                        <FileText className="w-4 h-4 shrink-0" />
                        <span className="truncate">Procure Request</span>
                      </button>
                    </li>
                    <li>
                      <button onClick={() => navigate({ to: '/my-tickets' })} className={`w-full flex items-center text-left gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors whitespace-nowrap ${location.pathname === '/my-tickets' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                        <List className="w-4 h-4 shrink-0" />
                        <span className="truncate">My Tickets</span>
                      </button>
                    </li>
                  </>
                )}
              </>
            )}

            {isAdmin && (
              <li>
                <button onClick={() => navigate({ to: '/admin/tickets' })} className={`w-full flex items-center text-left gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors whitespace-nowrap ${location.pathname === '/admin/tickets' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                  <FileText className="w-4 h-4 shrink-0" />
                  <span className="truncate">Manage Tickets</span>
                </button>
              </li>
            )}
            {isPrinciple && (
              <li>
                <button onClick={() => navigate({ to: '/principal/approvals' })} className={`w-full flex items-center justify-between text-left gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors whitespace-nowrap ${location.pathname === '/principal/approvals' ? 'bg-slate-100 dark:bg-slate-800 font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                  <div className="flex items-center gap-3"><FileText className="w-4 h-4 shrink-0" /><span className="truncate">Approve Requests</span></div>
                  {pendingPrincipalCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full bg-red-100 text-red-800 text-xs font-semibold">{pendingPrincipalCount}</span>
                  )}
                </button>
              </li>
            )}
            {/* SOP Procurement Foundation Links */}
            <li className="pt-3 pb-1 border-t border-slate-200 dark:border-slate-800">
              <span className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Procurement (SOP)
              </span>
            </li>
            <li>
              <button
                onClick={() => navigate({ to: '/procurement' })}
                className={`w-full flex items-center text-left gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors whitespace-nowrap ${
                  location.pathname === '/procurement'
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 font-semibold border border-blue-200/60 dark:border-blue-800/40'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Home className="w-4 h-4 shrink-0" />
                <span className="truncate">Procurement Hub</span>
              </button>
            </li>
            <li>
              <button
                onClick={() => navigate({ to: '/procurement/approvals' })}
                className={`w-full flex items-center text-left gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors whitespace-nowrap ${
                  location.pathname === '/procurement/approvals'
                    ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 font-semibold border border-purple-200/60 dark:border-purple-800/40'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <UserCheck className="w-4 h-4 shrink-0" />
                <span className="truncate">My Approvals</span>
              </button>
            </li>
            <li>
              <button
                onClick={() => navigate({ to: '/procurement/raise-pr' })}
                className={`w-full flex items-center text-left gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors whitespace-nowrap ${
                  location.pathname === '/procurement/raise-pr'
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 font-semibold border border-blue-200/60 dark:border-blue-800/40'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <PlusSquare className="w-4 h-4 shrink-0" />
                <span className="truncate">Requisitions (PR)</span>
              </button>
            </li>
            <li>
              <button
                onClick={() => navigate({ to: '/procurement/rfqs' })}
                className={`w-full flex items-center text-left gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors whitespace-nowrap ${
                  location.pathname === '/procurement/rfqs'
                    ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 font-semibold border border-sky-200/60 dark:border-sky-800/40'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <FileText className="w-4 h-4 shrink-0" />
                <span className="truncate">RFQs & Quotes</span>
              </button>
            </li>
            <li>
              <button
                onClick={() => navigate({ to: '/procurement/cs' })}
                className={`w-full flex items-center text-left gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors whitespace-nowrap ${
                  location.pathname === '/procurement/cs'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-semibold border border-emerald-200/60 dark:border-emerald-800/40'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Scale className="w-4 h-4 shrink-0" />
                <span className="truncate">Comparative (CS)</span>
              </button>
            </li>
            <li>
              <button
                onClick={() => navigate({ to: '/procurement/orders' })}
                className={`w-full flex items-center text-left gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors whitespace-nowrap ${
                  location.pathname === '/procurement/orders'
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 font-semibold border border-indigo-200/60 dark:border-indigo-800/40'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <ShoppingBag className="w-4 h-4 shrink-0" />
                <span className="truncate">Purchase Orders</span>
              </button>
            </li>
            <li>
              <button
                onClick={() => navigate({ to: '/procurement/grns' })}
                className={`w-full flex items-center text-left gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors whitespace-nowrap ${
                  location.pathname === '/procurement/grns'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-semibold border border-emerald-200/60 dark:border-emerald-800/40'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Truck className="w-4 h-4 shrink-0" />
                <span className="truncate">Goods Receipt (GRN)</span>
              </button>
            </li>
            <li>
              <button
                onClick={() => navigate({ to: '/procurement/invoices' })}
                className={`w-full flex items-center text-left gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors whitespace-nowrap ${
                  location.pathname === '/procurement/invoices'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-semibold border border-emerald-200/60 dark:border-emerald-800/40'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Receipt className="w-4 h-4 shrink-0" />
                <span className="truncate">Invoices & Match</span>
              </button>
            </li>
            <li>
              <button
                onClick={() => navigate({ to: '/procurement/emergency' })}
                className={`w-full flex items-center text-left gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors whitespace-nowrap ${
                  location.pathname === '/procurement/emergency'
                    ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-semibold border border-amber-200/60 dark:border-amber-800/40'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Zap className="w-4 h-4 shrink-0 text-amber-500" />
                <span className="truncate">Emergency Procurement</span>
              </button>
            </li>
            <li>
              <button
                onClick={() => navigate({ to: '/procurement/vendor-ratings' })}
                className={`w-full flex items-center text-left gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors whitespace-nowrap ${
                  location.pathname === '/procurement/vendor-ratings'
                    ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 font-semibold border border-purple-200/60 dark:border-purple-800/40'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Award className="w-4 h-4 shrink-0" />
                <span className="truncate">Vendor Ratings</span>
              </button>
            </li>
            <li>
              <button
                onClick={() => navigate({ to: '/procurement/vendors' })}
                className={`w-full flex items-center text-left gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors whitespace-nowrap ${
                  location.pathname === '/procurement/vendors'
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold border border-slate-200 dark:border-slate-700'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Users className="w-4 h-4 shrink-0" />
                <span className="truncate">Vendor Master</span>
              </button>
            </li>
            <li className="pt-2">
              <button
                onClick={() => navigate({ to: '/architecture' })}
                className={`w-full flex items-center text-left gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors whitespace-nowrap ${
                  location.pathname === '/architecture'
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 font-semibold border border-blue-200/60 dark:border-blue-800/40'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Workflow className="w-4 h-4 shrink-0 text-indigo-500" />
                <span className="truncate">System Architecture</span>
              </button>
            </li>
          </ul>
        </nav>
      </aside>

      {/* Main content wrapper positioned to the right of fixed sidebar */}
      <div className="pt-20 md:pl-64 lg:pl-72 min-h-screen flex flex-col transition-all duration-300">
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 animate-in fade-in-0 duration-500">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
