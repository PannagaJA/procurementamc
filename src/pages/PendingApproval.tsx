import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Clock, LogOut } from "lucide-react";

const PendingApproval = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkUserStatus();
  }, []);

  const checkUserStatus = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        navigate({ to: "/auth" });
        return;
      }

      setUser(session.user);

      // Check if user has any role
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (roleData) {
        // User is approved, redirect to dashboard
        navigate({ to: "/" });
        return;
      }

      setChecking(false);
    } catch (error) {
      console.error("Error checking user status:", error);
      setChecking(false);
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

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p>Checking approval status...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <img
              src="/amc.jpeg"
              alt="AMC Logo"
              className="h-16 w-20 rounded-lg object-contain mr-3"
            />
            <div className="text-center">
              <h1 className="text-2xl font-bold">AMC</h1>
              <p className="text-sm text-muted-foreground">Inventory System</p>
            </div>
          </div>
          <CardTitle className="text-2xl text-center flex items-center justify-center gap-2">
            <Clock className="h-6 w-6" />
            Pending Approval
          </CardTitle>
          <CardDescription className="text-center">
            Your account is pending administrator approval. You will be able to access the system
            once an administrator reviews and approves your registration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <h3 className="font-medium mb-2">What happens next?</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• An administrator will review your registration</li>
                <li>• You will receive access once approved</li>
                <li>• Check back later or contact your administrator</li>
              </ul>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => window.location.reload()} className="flex-1">
                Check Again
              </Button>
              <Button variant="outline" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PendingApproval;
