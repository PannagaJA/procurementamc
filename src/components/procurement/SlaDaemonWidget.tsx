import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  evaluateProcurementSlas,
  triggerSlaEscalationDaemon,
  getSlaEscalationLogs,
  SLA_RULES,
  type SlaBreachItem,
  type SlaEscalationLog,
} from "@/lib/procurement/slaDaemon";
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  BellRing,
  ArrowUpRight,
  ShieldAlert,
  Play,
  RotateCw,
} from "lucide-react";

interface SlaDaemonWidgetProps {
  onRefreshParent?: () => void;
  compact?: boolean;
}

export function SlaDaemonWidget({ onRefreshParent, compact = false }: SlaDaemonWidgetProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [runningDaemon, setRunningDaemon] = useState(false);
  const [breachedItems, setBreachedItems] = useState<SlaBreachItem[]>([]);
  const [stats, setStats] = useState({
    totalPending: 0,
    withinSla: 0,
    approachingBreach: 0,
    breached: 0,
  });
  const [logs, setLogs] = useState<SlaEscalationLog[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const loadSlaData = async () => {
    setLoading(true);
    try {
      const res = await evaluateProcurementSlas();
      setStats(res.stats);
      setBreachedItems(res.items.filter((i) => i.status === "breached"));
      setLogs(getSlaEscalationLogs());
    } catch (e) {
      console.warn("Failed to evaluate SLAs", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSlaData();
    // Auto-poll every 60 seconds
    const interval = setInterval(loadSlaData, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleRunDaemon = async () => {
    setRunningDaemon(true);
    try {
      const res = await triggerSlaEscalationDaemon();
      toast({
        title: "SLA Daemon Audit Completed",
        description: res.message,
      });
      await loadSlaData();
      if (onRefreshParent) onRefreshParent();
    } catch (e: any) {
      toast({ title: "Daemon Execution Failed", description: e.message, variant: "destructive" });
    } finally {
      setRunningDaemon(false);
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {stats.breached > 0 ? (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setModalOpen(true)}
            className="h-7 text-xs gap-1.5 animate-pulse"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            {stats.breached} Overdue SLA Breaches
          </Button>
        ) : (
          <Badge variant="outline" className="text-emerald-600 border-emerald-300 gap-1 text-xs py-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> SLAs Healthy
          </Badge>
        )}
      </div>
    );
  }

  return (
    <>
      <Card className="border border-slate-200 dark:border-slate-800 bg-gradient-to-r from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                <span className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-600" /> Working-Day SLA Governance & Escalation Daemon
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Automated scheduler tracking PR (2d), RFQ (7d), PO (1d), GRN (2d), and Invoice (5d) turnarounds.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 font-mono text-xs">
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold">
                  {stats.withinSla} on track
                </span>
                {stats.approachingBreach > 0 && (
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold">
                    {stats.approachingBreach} warning
                  </span>
                )}
                {stats.breached > 0 && (
                  <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 font-bold">
                    {stats.breached} breached
                  </span>
                )}
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={() => setModalOpen(true)}
                className="h-8 text-xs gap-1.5"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-slate-600" /> Audit Log ({logs.length})
              </Button>

              <Button
                size="sm"
                onClick={handleRunDaemon}
                disabled={runningDaemon}
                className="h-8 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
              >
                <Play className={`w-3 h-3 ${runningDaemon ? "animate-spin" : ""}`} />
                {runningDaemon ? "Evaluating..." : "Run SLA Audit Daemon"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SLA Details & Escalation Log Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-600" /> Procurement SLA Turnaround & Escalation Registry
            </DialogTitle>
            <DialogDescription>
              Working-day threshold compliance and automated tier escalation audit trail.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* SLA Stage Rules Matrix */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Mandatory Working-Day SLA Thresholds
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
                {Object.values(SLA_RULES).map((rule) => (
                  <div key={rule.stage} className="p-2 border rounded-lg bg-slate-50 dark:bg-slate-900">
                    <span className="font-bold text-slate-800 dark:text-slate-200 block text-[11px] truncate">{rule.label}</span>
                    <span className="text-lg font-bold font-mono text-indigo-600">{rule.maxWorkingDays}d</span>
                    <span className="text-[10px] text-slate-400 block">Tier: {rule.escalatedToRole.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Breached Items */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center justify-between">
                <span>Active Overdue Tasks Requiring Escalation</span>
                <Badge variant="destructive" className="text-[10px]">{breachedItems.length} breached</Badge>
              </h4>

              {breachedItems.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 border rounded-lg bg-slate-50/50 dark:bg-slate-900/50">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1.5" />
                  All active procurement tasks across all desks are within turnaround limits.
                </div>
              ) : (
                <div className="border rounded-lg overflow-x-auto text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 dark:bg-slate-900 border-b">
                      <tr>
                        <th className="p-2.5 font-semibold">Entity Number</th>
                        <th className="p-2.5 font-semibold">Stage</th>
                        <th className="p-2.5 font-semibold text-center">Elapsed</th>
                        <th className="p-2.5 font-semibold text-center">Overdue</th>
                        <th className="p-2.5 font-semibold">Current Role</th>
                        <th className="p-2.5 font-semibold">Escalation Tier</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {breachedItems.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                          <td className="p-2.5 font-mono font-bold text-slate-900 dark:text-white">
                            {item.entityNumber}
                          </td>
                          <td className="p-2.5 capitalize">{item.stage.replace(/_/g, " ")}</td>
                          <td className="p-2.5 text-center font-mono">{item.elapsedWorkingDays}d</td>
                          <td className="p-2.5 text-center font-mono font-bold text-red-600 dark:text-red-400">
                            +{item.daysOverdue}d
                          </td>
                          <td className="p-2.5 capitalize">{item.currentRole.replace(/_/g, " ")}</td>
                          <td className="p-2.5 font-semibold text-indigo-600 dark:text-indigo-400 uppercase">
                            <span className="flex items-center gap-1">
                              <ArrowUpRight className="w-3 h-3" /> {item.escalateToRole}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Escalation Digest & Notification Logs */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Automated Digest & Escalation Notification History
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-2 text-xs">
                {logs.length === 0 ? (
                  <p className="text-center text-slate-400 py-3">No automated escalation events recorded yet.</p>
                ) : (
                  logs.map((log) => (
                    <div key={log.id} className="p-2 rounded bg-slate-50 dark:bg-slate-900 border flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold">{log.entityNumber}</span>
                          <span className="text-[10px] uppercase text-indigo-600 font-semibold">{log.stage}</span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400">{log.actionTaken}</p>
                      </div>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">{new Date(log.notifiedAt).toLocaleString()}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Close</Button>
            <Button onClick={handleRunDaemon} disabled={runningDaemon} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5">
              <RotateCw className={`w-3.5 h-3.5 ${runningDaemon ? "animate-spin" : ""}`} /> Dispatch Reminders Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
