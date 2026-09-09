import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { User } from '@supabase/supabase-js';
import { PlusCircle, ListOrdered, Clock, CheckCircle } from 'lucide-react';

interface Ticket {
  id: string;
  ticket_number: string;
  issue_category: string;
  issue_description: string;
  priority: string; // Using string instead of literal union
  status: string; // Using string instead of literal union
  created_at: string;
}

const UserDashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [recentTickets, setRecentTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    resolved: 0,
    inProgress: 0
  });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const initDashboard = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        
        if (error || !user) {
          toast({
            title: "Error",
            description: "Please log in to access the dashboard",
            variant: "destructive",
          });
          navigate({ to: '/auth' });
          return;
        }

        setUser(user);

        // Check if user has admin role
        const { data: roleData, error: roleError } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .maybeSingle();

        const isAdminUser = !!roleData;
        setIsAdmin(isAdminUser);

        // If user is admin, redirect to main dashboard
        if (isAdminUser) {
          navigate({ to: '/' });
          return;
        }

        // Viewers now use the main dashboard, redirect them too
        navigate({ to: '/' });
        return;
      } catch (error: any) {
        console.error('Error initializing dashboard:', error);
        toast({
          title: "Error",
          description: error.message || "Failed to initialize dashboard",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    initDashboard();
  }, [navigate, toast]);

  const fetchUserTickets = async (userId: string) => {
    try {
      // Fetch user's tickets
      const { data: tickets, error }: { data: any[] | null; error: any } = await supabase
        .from('tickets')
        .select('id, ticket_number, issue_category, issue_description, priority, status, created_at')
        .eq('created_by', userId)
        .order('created_at', { ascending: false })
        .limit(5);

      // Check if the error is due to missing table
      if (error && error.code === 'PGRST205') {
        // Table doesn't exist yet, set default empty state
        setRecentTickets([]);
        setStats({
          total: 0,
          pending: 0,
          inProgress: 0,
          resolved: 0
        });
        return;
      }
      
      if (error) throw error;

      setRecentTickets(tickets || []);

      // Calculate stats
      const total = tickets?.length || 0;
      const pending = tickets?.filter(t => t.status === 'pending').length || 0;
      const inProgress = tickets?.filter(t => t.status === 'in-progress').length || 0;
      const resolved = tickets?.filter(t => ['resolved', 'completed'].includes(t.status)).length || 0;

      setStats({
        total,
        pending,
        inProgress,
        resolved
      });
    } catch (error: any) {
      console.error('Error fetching tickets:', error);
      // Check if it's the missing table error
      if (error.code === 'PGRST205') {
        setRecentTickets([]);
        setStats({
          total: 0,
          pending: 0,
          inProgress: 0,
          resolved: 0
        });
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to load tickets",
          variant: "destructive",
        });
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'in-progress':
        return 'bg-blue-100 text-blue-800';
      case 'waiting-for-user':
        return 'bg-orange-100 text-orange-800';
      case 'resolved':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low':
        return 'bg-green-100 text-green-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'high':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">User Dashboard</h1>
        <p className="text-muted-foreground">Manage your tickets and track their status</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Tickets</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <ListOrdered className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">In Progress</p>
                <p className="text-2xl font-bold text-blue-600">{stats.inProgress}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Resolved</p>
                <p className="text-2xl font-bold text-green-600">{stats.resolved}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <Button 
                onClick={() => navigate({ to: '/raise-ticket' })} 
                className="flex items-center gap-2"
              >
                <PlusCircle className="h-4 w-4" />
                Raise Ticket
              </Button>
              <Button 
                variant="outline" 
                onClick={() => navigate({ to: '/my-tickets' })}
                className="flex items-center gap-2"
              >
                <ListOrdered className="h-4 w-4" />
                View All Tickets
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Tickets */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Recent Tickets</CardTitle>
            <Button variant="outline" onClick={() => navigate({ to: '/my-tickets' })}>
              View All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {recentTickets.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">You haven't raised any tickets yet.</p>
              <Button 
                className="mt-4" 
                onClick={() => navigate({ to: '/raise-ticket' })}
              >
                Raise Your First Ticket
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {recentTickets.map(ticket => (
                <div 
                  key={ticket.id} 
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => navigate({ to: `/my-tickets` })}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold">#{ticket.ticket_number}</h3>
                      <Badge className={getPriorityColor(ticket.priority)}>
                        {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                      {ticket.issue_description}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={getStatusColor(ticket.status)}>
                      {ticket.status.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {new Date(ticket.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UserDashboard;