import { useState, useEffect } from "react";
import { useNavigate } from '@tanstack/react-router';
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SystemReadmeModal } from "@/components/SystemReadmeModal";
import { BookOpen, ShieldCheck } from "lucide-react";

const authSchema = z.object({
  email: z.string().email("Invalid email address").max(255, "Email must be less than 255 characters"),
  password: z.string().min(6, "Password must be at least 6 characters").max(100, "Password must be less than 100 characters"),
  fullName: z.string().min(2, "Name must be at least 2 characters").max(100, "Name must be less than 100 characters").optional(),
});

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [readmeOpen, setReadmeOpen] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState<'enterEmail' | 'enterOtp' | 'setPassword'>('enterEmail');

  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Safe edge-function caller: try supabase.functions.invoke, fall back to direct fetch
  const callEdgeFunction = async (name: string, body: any) => {
    try {
      if ((supabase as any).functions && typeof (supabase as any).functions.invoke === 'function') {
        const res = await (supabase as any).functions.invoke(name, { body });
        return res;
      }
    } catch (err) {
      // swallow and try fetch fallback
      console.warn('supabase.functions.invoke failed, falling back to fetch', err);
    }

    // Fallback to direct fetch to Supabase Functions endpoint
    try {
      const base = String(import.meta.env.VITE_SUPABASE_URL || '');
      const apiKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '');
      if (!base) throw new Error('Supabase URL not configured');
      const url = `${base.replace(/\/$/, '')}/functions/v1/${name}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let parsed: any = { data: null };
      try { parsed = JSON.parse(text); } catch (e) { parsed = { text }; }
      if (!res.ok) {
        return { error: new Error(parsed?.message || `Function ${name} returned ${res.status}`), data: parsed };
      }
      return { data: parsed };
    } catch (err) {
      return { error: err };
    }
  };

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate({ to: "/" });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        navigate({ to: "/" });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate input
      const validation = authSchema.safeParse({
        email,
        password,
        fullName: isLogin ? undefined : fullName,
      });

      if (!validation.success) {
        toast({
          variant: "destructive",
          title: "Validation Error",
          description: validation.error.errors[0].message,
        });
        setLoading(false);
        return;
      }

      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          if (error.message.includes("Invalid login credentials")) {
            toast({
              variant: "destructive",
              title: "Login Failed",
              description: "Invalid email or password. Please try again.",
            });
          } else {
            toast({
              variant: "destructive",
              title: "Login Failed",
              description: error.message,
            });
          }
        } else {
          toast({
            title: "Welcome back!",
            description: "Successfully logged in.",
          });
        }
      } else {
        const redirectUrl = `${window.location.origin}/`;
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl,
            data: {
              full_name: fullName,
            },
          },
        });

        if (error) {
          if (error.message.includes("already registered")) {
            toast({
              variant: "destructive",
              title: "Signup Failed",
              description: "This email is already registered. Please login instead.",
            });
          } else {
            toast({
              variant: "destructive",
              title: "Signup Failed",
              description: error.message,
            });
          }
        } else {
          // Try to create a default 'viewer' role for the newly created user.
          try {
            const userId = data?.user?.id;
            let idToUse = userId;

            // If signUp didn't return a user id, try to fetch the current user.
            if (!idToUse) {
              const { data: userData } = await supabase.auth.getUser();
              idToUse = userData?.user?.id;
            }

            if (idToUse) {
              const { error: roleError } = await supabase
                .from("user_roles")
                .insert({ user_id: idToUse, role: "viewer" });

              if (roleError) console.error("Failed to set default role:", roleError);
            }
          } catch (err) {
            console.error("Error setting default role:", err);
          }

          toast({
            title: "Account Created!",
            description: "Your account has been created successfully.",
          });
        }
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "An unexpected error occurred.",
      });
    } finally {
      setLoading(false);
    }
  };

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
          <CardTitle className="text-2xl text-center">
            {isLogin ? "Welcome Back" : "Create Account"}
          </CardTitle>
          <CardDescription className="text-center">
            {isLogin
              ? "Enter your credentials to access the inventory system"
              : "Enter your details to create a new account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAuth} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required={!isLogin}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Please wait..." : isLogin ? "Sign In" : "Sign Up"}
            </Button>
          </form>
          <div className="mt-4 text-center">
            {isLogin && (
              <Button variant="link" className="p-0" onClick={() => { setForgotOpen(true); setForgotStep('enterEmail'); setForgotEmail(email); }}>
                Forgot password?
              </Button>
            )}
          </div>
          <div className="mt-4 text-center text-sm">
            {isLogin ? (
              <>
                Don't have an account?{" "}
                <Button
                  variant="link"
                  className="p-0"
                  onClick={() => setIsLogin(false)}
                >
                  Sign up
                </Button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <Button
                  variant="link"
                  className="p-0"
                  onClick={() => setIsLogin(true)}
                >
                  Sign in
                </Button>
              </>
            )}
          </div>
          <div className="mt-6 text-center text-xs text-muted-foreground" style={{ opacity: 0.01, userSelect: 'text' }}>
            <p>
              Developed by{" "}
              <a
                href="https://riteshn.me"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
                style={{ opacity: 1 }}
              >
                Ritesh N.
              </a>
            </p>
            <p>USN: 1AM22CI079</p>
          </div>
        </CardContent>

        <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {forgotStep === 'enterEmail' && (
                <div>
                  <Label>Email</Label>
                  <Input value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder="your@email.com" />
                  <div className="flex justify-end gap-2 mt-3">
                    <Button variant="outline" onClick={() => setForgotOpen(false)}>Cancel</Button>
                    <Button onClick={async () => {
                      try {
                        setForgotLoading(true);
                        const emailToUse = String((forgotEmail || '').trim());
                        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailToUse)) {
                          toast({ variant: 'destructive', title: 'Invalid email', description: 'Please enter a valid email address' });
                          setForgotLoading(false);
                          return;
                        }
                        setForgotEmail(emailToUse);
                        const res = await callEdgeFunction('send-otp', { email: emailToUse });
                        if (res?.error) {
                          // if edge function unavailable, fallback to Supabase email reset
                          const { data, error } = await supabase.auth.resetPasswordForEmail(emailToUse, { redirectTo: window.location.origin + '/auth' });
                          if (error) throw error;
                          toast({ title: 'Reset email sent', description: 'Check your inbox for a password reset link' });
                          setForgotOpen(false);
                        } else {
                          toast({ title: 'OTP sent', description: 'Check your email for the OTP' });
                          setForgotStep('enterOtp');
                        }
                      } catch (err: any) {
                        console.error('send-otp error', err);
                        toast({ variant: 'destructive', title: 'Error', description: err?.message || 'Failed to send OTP/reset email' });
                      } finally { setForgotLoading(false); }
                    }}>{forgotLoading ? 'Please wait...' : 'Send OTP'}</Button>
                  </div>
                </div>
              )}

              {forgotStep === 'enterOtp' && (
                <div>
                  <Label>Enter OTP</Label>
                  <Input value={forgotOtp} onChange={(e) => setForgotOtp(e.target.value)} placeholder="123456" />
                  <div className="flex justify-end gap-2 mt-3">
                    <Button variant="outline" onClick={() => setForgotStep('enterEmail')}>Back</Button>
                    <Button onClick={async () => {
                      try {
                        setForgotLoading(true);
                        const emailToUse = String((forgotEmail || '').trim());
                        const res = await callEdgeFunction('verify-otp', { email: emailToUse, otp: forgotOtp });
                        if (res?.error) throw res.error;
                        toast({ title: 'OTP verified', description: 'You can now set a new password' });
                        setForgotStep('setPassword');
                      } catch (err: any) {
                        console.error('verify-otp error', err);
                        toast({ variant: 'destructive', title: 'Error', description: err?.message || 'OTP verification failed' });
                      } finally { setForgotLoading(false); }
                    }}>{forgotLoading ? 'Verifying...' : 'Verify OTP'}</Button>
                  </div>
                </div>
              )}

              {forgotStep === 'setPassword' && (
                <div>
                  <Label>New Password</Label>
                  <Input type="password" value={forgotNewPassword} onChange={(e) => setForgotNewPassword(e.target.value)} placeholder="New password" />
                  <div className="flex justify-end gap-2 mt-3">
                    <Button variant="outline" onClick={() => setForgotStep('enterOtp')}>Back</Button>
                    <Button onClick={async () => {
                      try {
                        setForgotLoading(true);
                        const emailToUse = String((forgotEmail || '').trim());
                        const res = await callEdgeFunction('reset-password', { email: emailToUse, otp: forgotOtp, newPassword: forgotNewPassword });
                        if (res?.error) {
                          // fallback: send reset link
                          const { data, error } = await supabase.auth.resetPasswordForEmail(emailToUse, { redirectTo: window.location.origin + '/auth' });
                          if (error) throw error;
                          toast({ title: 'Reset email sent', description: 'Check your inbox for a password reset link' });
                          setForgotOpen(false);
                        } else {
                          toast({ title: 'Password changed', description: 'You can now login with your new password' });
                          setForgotOpen(false);
                        }
                      } catch (err: any) {
                        console.error('reset-password error', err);
                        toast({ variant: 'destructive', title: 'Error', description: err?.message || 'Failed to reset password' });
                      } finally { setForgotLoading(false); }
                    }}>{forgotLoading ? 'Please wait...' : 'Set Password'}</Button>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </Card>

      {/* Floating trigger button at bottom right corner */}
      <div className="fixed bottom-6 right-6 z-40">
        <Button
          onClick={() => setReadmeOpen(true)}
          className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 shadow-2xl border border-slate-700/50 dark:border-slate-300 rounded-full px-4 py-2.5 h-auto text-xs font-bold flex items-center gap-2.5 transition-all duration-300 hover:scale-105 active:scale-95 group"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <BookOpen className="w-4 h-4 text-indigo-400 dark:text-indigo-600 group-hover:rotate-12 transition-transform duration-300" />
          <span>System Architecture & README</span>
        </Button>
      </div>

      {/* In-place UI README Dialog */}
      <SystemReadmeModal open={readmeOpen} onOpenChange={setReadmeOpen} />
    </div>
  );
};

export default Auth;

