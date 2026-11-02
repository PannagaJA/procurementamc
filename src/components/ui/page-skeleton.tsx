import React from "react";
import Layout from "@/components/Layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function PageSkeleton({
  title = "Loading...",
  subtitle = "Please wait while we fetch the latest records",
  cards = 4,
  rows = 5,
}: {
  title?: string;
  subtitle?: string;
  cards?: number;
  rows?: number;
}) {
  return (
    <Layout>
      <div className="space-y-6 w-full animate-in fade-in-0 duration-300">
        {/* Header Skeleton */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64 rounded-xl" />
            <Skeleton className="h-4 w-44 rounded-lg" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-28 rounded-full" />
            <Skeleton className="h-10 w-28 rounded-full" />
          </div>
        </div>

        {/* Metric Cards Skeleton */}
        {cards > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(cards)].map((_, i) => (
              <Card key={i} className="p-5 shadow-xs">
                <Skeleton className="h-4 w-28 mb-3 rounded" />
                <Skeleton className="h-8 w-20 mb-2 rounded-lg" />
                <Skeleton className="h-3 w-36 rounded" />
              </Card>
            ))}
          </div>
        )}

        {/* Main Content / Table Skeleton */}
        <Card className="shadow-xs overflow-hidden">
          <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-48 rounded-lg" />
              <Skeleton className="h-9 w-32 rounded-full" />
            </div>
          </CardHeader>
          <CardContent className="p-5 space-y-3">
            {[...Array(rows)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

export function FormPageSkeleton() {
  return (
    <Layout>
      <div className="w-full space-y-6 animate-in fade-in-0 duration-300">
        <div className="space-y-2 pb-2 border-b border-slate-200 dark:border-slate-800">
          <Skeleton className="h-8 w-64 rounded-xl" />
          <Skeleton className="h-4 w-48 rounded-lg" />
        </div>
        <Card className="p-6 shadow-xs space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Skeleton className="h-10 w-24 rounded-full" />
            <Skeleton className="h-10 w-36 rounded-full" />
          </div>
        </Card>
      </div>
    </Layout>
  );
}

