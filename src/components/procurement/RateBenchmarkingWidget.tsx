import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  calculateRateBenchmark,
  type RateBenchmarkResult,
} from "@/lib/procurement/rateBenchmarking";
import { TrendingDown, TrendingUp, Minus, ShieldCheck, Sparkles, AlertTriangle } from "lucide-react";

interface RateBenchmarkingWidgetProps {
  description: string;
  unitRate: number;
  onApplyJustification?: (justificationText: string) => void;
  compact?: boolean;
}

export function RateBenchmarkingWidget({
  description,
  unitRate,
  onApplyJustification,
  compact = false,
}: RateBenchmarkingWidgetProps) {
  const [benchmark, setBenchmark] = useState<RateBenchmarkResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (!description || unitRate <= 0) {
      setBenchmark(null);
      return;
    }
    setLoading(true);
    calculateRateBenchmark(description, unitRate).then((res) => {
      if (active) {
        setBenchmark(res);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [description, unitRate]);

  if (!benchmark || !benchmark.hasHistoricalData) {
    if (compact) return null;
    return (
      <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
        <span>No 6-month historical PO baseline for this item. Supplier quotes provide current benchmark.</span>
      </div>
    );
  }

  const isSaving = benchmark.verdict === "cost_saving";
  const isPremium = benchmark.verdict === "premium_exceeds_avg";

  if (compact) {
    return (
      <div className="inline-flex items-center gap-1.5 text-[11px]">
        {isSaving ? (
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 gap-1 text-[10px] py-0 px-1.5">
            <TrendingDown className="w-3 h-3 text-emerald-600" />
            {Math.abs(benchmark.percentageVariance)}% below 6-mo avg (₹{benchmark.movingAverage6m})
          </Badge>
        ) : isPremium ? (
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 gap-1 text-[10px] py-0 px-1.5">
            <TrendingUp className="w-3 h-3 text-amber-600" />
            +{benchmark.percentageVariance}% above 6-mo avg (₹{benchmark.movingAverage6m})
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-[10px] py-0 px-1.5">
            <Minus className="w-3 h-3" />
            Matches 6-mo avg (₹{benchmark.movingAverage6m})
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div
      className={`p-3 rounded-lg border text-xs space-y-2 transition-all duration-200 ${
        isSaving
          ? "bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60"
          : isPremium
            ? "bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60"
            : "bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/60"
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
          <span className="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wide">
            Historical Rate Benchmark
          </span>
          {isSaving ? (
            <Badge className="bg-emerald-600 text-white text-[10px] gap-1">
              <TrendingDown className="w-3 h-3" /> Cost Saving ({Math.abs(benchmark.percentageVariance)}% below avg)
            </Badge>
          ) : isPremium ? (
            <Badge className="bg-amber-600 text-white text-[10px] gap-1">
              <AlertTriangle className="w-3 h-3" /> Rate Premium (+{benchmark.percentageVariance}% above avg)
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <Minus className="w-3 h-3" /> Normal Market Rate
            </Badge>
          )}
        </div>

        {onApplyJustification && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onApplyJustification(benchmark.complianceNote)}
            className="h-6 text-[11px] gap-1 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100/50 dark:hover:bg-indigo-900/40 p-1"
          >
            <Sparkles className="w-3 h-3" /> Insert Justification Text
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
        <div className="p-1.5 rounded bg-white/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
          <span className="text-slate-400 block text-[10px]">Requested Unit Rate</span>
          <span className="font-bold text-slate-900 dark:text-white">₹{benchmark.currentUnitRate.toLocaleString("en-IN")}</span>
        </div>
        <div className="p-1.5 rounded bg-white/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
          <span className="text-slate-400 block text-[10px]">6-Mo Rolling Avg</span>
          <span className="font-bold text-slate-900 dark:text-white">₹{benchmark.movingAverage6m.toLocaleString("en-IN")}</span>
        </div>
        <div className="p-1.5 rounded bg-white/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
          <span className="text-slate-400 block text-[10px]">Historical Range</span>
          <span className="font-semibold text-slate-700 dark:text-slate-300">₹{benchmark.minHistoricalRate} – ₹{benchmark.maxHistoricalRate}</span>
        </div>
        <div className="p-1.5 rounded bg-white/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
          <span className="text-slate-400 block text-[10px]">Sample Prior POs</span>
          <span className="font-semibold text-slate-700 dark:text-slate-300">{benchmark.samplePoCount} orders ({benchmark.priorPoReferences.slice(0, 2).join(", ")})</span>
        </div>
      </div>

      <p className="text-[11px] text-slate-600 dark:text-slate-300 italic pt-0.5">
        "{benchmark.complianceNote}"
      </p>
    </div>
  );
}
