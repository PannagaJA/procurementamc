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
        <div className="container mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img
              src="/amc.jpeg"
              alt="AMC Logo"
              className="h-12 w-16 rounded-lg object-contain shadow-md"
            />
            <div>
              <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">AMC Inventory System</h1>
              <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                {(authCtx?.primaryRole === 'admin' && 'Administrator') || (authCtx?.primaryRole === 'principle' && 'Principal') || (authCtx?.primaryRole === 'hod' && 'HOD') || (authCtx?.primaryRole === 'librarian' && 'Librarian') || (authCtx?.primaryRole === 'viewer' && 'Viewer') || (isAdmin ? 'Administrator' : isPrinciple ? 'Principal' : 'User Access')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleLogout}
              className="transition-all duration-300 hover:scale-105 hover:shadow-md px-3 py-2 rounded-lg border-red-300 text-red-600 hover:bg-red-50 flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Sidebar for md+ */}
      <aside className="hidden md:block md:fixed md:top-20 md:left-0 md:h-[calc(100vh-5rem)] md:w-64 md:bg-white/80 md:backdrop-blur-sm md:shadow-sm dark:md:bg-slate-900/80 dark:md:border-slate-700 md:border-r md:overflow-y-auto">
        <nav className="px-4 py-6">
          <ul className="space-y-2">
            <li>
              {(() => {
                const role = authCtx?.primaryRole;
                const target = role === 'hod' ? '/hod' : role === 'principle' ? '/principal' : role === 'librarian' ? '/librarian' : role === 'viewer' ? '/viewer' : '/';
                const isActive = location.pathname === target || (target === '/' && location.pathname === '/');
                return (
                  <button onClick={() => navigate({ to: target })} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 ${isActive ? 'bg-gray-100 dark:bg-slate-800 font-medium' : ''}`}>
                    <Home className="w-4 h-4" />
                    Dashboard
                  </button>
                );
              })()}
            </li>
            {isAdmin && (
              <>
                <li>
                  <button onClick={() => navigate({ to: '/add' })} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 ${location.pathname === '/add' ? 'bg-gray-100 dark:bg-slate-800 font-medium' : ''}`}>
                    <PlusSquare className="w-4 h-4" />
                    Add Item
                  </button>
                </li>
                <li>
                  <button onClick={() => navigate({ to: '/categories' })} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 ${location.pathname === '/categories' ? 'bg-gray-100 dark:bg-slate-800 font-medium' : ''}`}>
                    <List className="w-4 h-4" />
                    Categories
                  </button>
                </li>
                <li>
                  <button onClick={() => navigate({ to: '/departments' })} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 ${location.pathname === '/departments' ? 'bg-gray-100 dark:bg-slate-800 font-medium' : ''}`}>
                    <FileText className="w-4 h-4" />
                    Departments
                  </button>
                </li>
                <li>
                  <button onClick={() => navigate({ to: '/users' })} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 ${location.pathname === '/users' ? 'bg-gray-100 dark:bg-slate-800 font-medium' : ''}`}>
                    <Users className="w-4 h-4" />
                    Users
                  </button>
                </li>
                <li>
                  <button onClick={() => navigate({ to: '/request-quotation' })} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 ${location.pathname === '/request-quotation' ? 'bg-gray-100 dark:bg-slate-800 font-medium' : ''}`}>
                    <ShoppingCart className="w-4 h-4" />
                    Request Quotation
                  </button>
                </li>
                <li>
                  <button onClick={() => navigate({ to: '/inventory' })} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 ${location.pathname === '/inventory' ? 'bg-gray-100 dark:bg-slate-800 font-medium' : ''}`}>
                    <Box className="w-4 h-4" />
                    Inventory
                  </button>
                </li>
              </>
            )}

            {!isAdmin && (
              <>
                {isViewer ? (
                  <>
                    <li>
                      <button onClick={() => navigate({ to: '/viewer/inventory' })} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 ${location.pathname.startsWith('/viewer/inventory') ? 'bg-gray-100 dark:bg-slate-800 font-medium' : ''}`}>
                        <Box className="w-4 h-4" />
                        Inventory
                      </button>
                    </li>
                    <li>
                      <button onClick={() => navigate({ to: '/viewer/quotations' })} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 ${location.pathname === '/viewer/quotations' ? 'bg-gray-100 dark:bg-slate-800 font-medium' : ''}`}>
                        <ShoppingCart className="w-4 h-4" />
                        Quotations
                      </button>
                    </li>
                  </>
                ) : (
                  <>
                    <li>
                      <button onClick={() => navigate({ to: '/raise-ticket' })} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 ${location.pathname === '/raise-ticket' ? 'bg-gray-100 dark:bg-slate-800 font-medium' : ''}`}>
                        <Ticket className="w-4 h-4" />
                        Raise Ticket
                      </button>
                    </li>
                    <li>
                      <button onClick={() => navigate({ to: '/procure-request' })} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 ${location.pathname === '/procure-request' ? 'bg-gray-100 dark:bg-slate-800 font-medium' : ''}`}>
                        <FileText className="w-4 h-4" />
                        Procure Request
                      </button>
                    </li>
                    <li>
                      <button onClick={() => navigate({ to: '/my-tickets' })} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 ${location.pathname === '/my-tickets' ? 'bg-gray-100 dark:bg-slate-800 font-medium' : ''}`}>
                        <List className="w-4 h-4" />
                        My Tickets
                      </button>
                    </li>
                  </>
                )}
              </>
            )}

            {isAdmin && (
              <li>
                <button onClick={() => navigate({ to: '/admin/tickets' })} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 ${location.pathname === '/admin/tickets' ? 'bg-gray-100 dark:bg-slate-800 font-medium' : ''}`}>
                  <FileText className="w-4 h-4" />
                  Manage Tickets
                </button>
              </li>
            )}
            {isPrinciple && (
              <li>
                <button onClick={() => navigate({ to: '/principal/approvals' })} className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 ${location.pathname === '/principal/approvals' ? 'bg-gray-100 dark:bg-slate-800 font-medium' : ''}`}>
                  <div className="flex items-center gap-3"><FileText className="w-4 h-4" />Approve Requests</div>
                  {pendingPrincipalCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full bg-red-100 text-red-800 text-sm font-medium">{pendingPrincipalCount}</span>
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
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 ${
                  location.pathname === '/procurement' ? 'bg-gray-100 dark:bg-slate-800 font-medium text-blue-600 dark:text-blue-400' : ''
                }`}
              >
                <Home className="w-4 h-4" />
                Procurement Hub
              </button>
            </li>
            <li>
              <button
                onClick={() => navigate({ to: '/procurement/approvals' })}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 ${
                  location.pathname === '/procurement/approvals' ? 'bg-gray-100 dark:bg-slate-800 font-medium text-purple-600 dark:text-purple-400' : ''
                }`}
              >
                <UserCheck className="w-4 h-4" />
                My Approvals
              </button>
            </li>
            <li>
              <button
                onClick={() => navigate({ to: '/procurement/raise-pr' })}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 ${
                  location.pathname === '/procurement/raise-pr' ? 'bg-gray-100 dark:bg-slate-800 font-medium text-blue-600 dark:text-blue-400' : ''
                }`}
              >
                <PlusSquare className="w-4 h-4" />
                Requisitions (PR)
              </button>
            </li>
            <li>
              <button
                onClick={() => navigate({ to: '/procurement/rfqs' })}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 ${
                  location.pathname === '/procurement/rfqs' ? 'bg-gray-100 dark:bg-slate-800 font-medium text-sky-600 dark:text-sky-400' : ''
                }`}
              >
                <FileText className="w-4 h-4" />
                RFQs & Quotes
              </button>
            </li>
            <li>
              <button
                onClick={() => navigate({ to: '/procurement/cs' })}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 ${
                  location.pathname === '/procurement/cs' ? 'bg-gray-100 dark:bg-slate-800 font-medium text-emerald-600 dark:text-emerald-400' : ''
                }`}
              >
                <Scale className="w-4 h-4" />
                Comparative (CS)
              </button>
            </li>
            <li>
              <button
                onClick={() => navigate({ to: '/procurement/orders' })}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 ${
                  location.pathname === '/procurement/orders' ? 'bg-gray-100 dark:bg-slate-800 font-medium text-indigo-600 dark:text-indigo-400' : ''
                }`}
              >
                <ShoppingBag className="w-4 h-4" />
                Purchase Orders
              </button>
            </li>
            <li>
              <button
                onClick={() => navigate({ to: '/procurement/grns' })}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 ${
                  location.pathname === '/procurement/grns' ? 'bg-gray-100 dark:bg-slate-800 font-medium text-emerald-600 dark:text-emerald-400' : ''
                }`}
              >
                <Truck className="w-4 h-4" />
                Goods Receipt (GRN)
              </button>
            </li>
            <li>
              <button
                onClick={() => navigate({ to: '/procurement/invoices' })}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 ${
                  location.pathname === '/procurement/invoices' ? 'bg-gray-100 dark:bg-slate-800 font-medium text-emerald-600 dark:text-emerald-400' : ''
                }`}
              >
                <Receipt className="w-4 h-4" />
                Invoices & Match
              </button>
            </li>
            <li>
              <button
                onClick={() => navigate({ to: '/procurement/emergency' })}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 ${
                  location.pathname === '/procurement/emergency' ? 'bg-gray-100 dark:bg-slate-800 font-medium text-amber-600 dark:text-amber-400' : ''
                }`}
              >
                <Zap className="w-4 h-4" />
                Emergency (§9)
              </button>
            </li>
            <li>
              <button
                onClick={() => navigate({ to: '/procurement/vendor-ratings' })}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 ${
                  location.pathname === '/procurement/vendor-ratings' ? 'bg-gray-100 dark:bg-slate-800 font-medium text-purple-600 dark:text-purple-400' : ''
                }`}
              >
                <Award className="w-4 h-4" />
                Vendor Ratings
              </button>
            </li>
            <li>
              <button
                onClick={() => navigate({ to: '/procurement/vendors' })}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 ${
                  location.pathname === '/procurement/vendors' ? 'bg-gray-100 dark:bg-slate-800 font-medium text-slate-700 dark:text-slate-300' : ''
                }`}
              >
                <Users className="w-4 h-4" />
                Vendor Master
              </button>
            </li>
          </ul>
        </nav>
      </aside>

      {/* Main content area with padding for header and sidebar */}
      <main className="container mx-auto px-6 pt-24 pb-12 md:pl-[18rem] animate-in fade-in-0 duration-700">
        {children}
      </main>
    </div>
  );
};

export default Layout;
