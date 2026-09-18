import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, Eye, Code, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Initialize mermaid once
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: 'Inter, system-ui, sans-serif',
  themeVariables: {
    primaryColor: '#6366f1',
    primaryTextColor: '#ffffff',
    primaryBorderColor: '#4f46e5',
    lineColor: '#64748b',
    secondaryColor: '#f1f5f9',
    tertiaryColor: '#ffffff',
  },
});

interface MermaidViewerProps {
  id: string;
  chart: string;
  title: string;
  description: string;
  badgeText?: string;
  sourceFile?: string;
}

export const MermaidViewer: React.FC<MermaidViewerProps> = ({
  id,
  chart,
  title,
  description,
  badgeText = 'Mermaid Diagram',
  sourceFile,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const { toast } = useToast();

  useEffect(() => {
    let isMounted = true;

    const renderChart = async () => {
      try {
        setError(null);
        const uniqueId = `mermaid-${id}-${Date.now().toString(36)}`;
        const { svg } = await mermaid.render(uniqueId, chart.trim());
        if (isMounted) {
          setSvgContent(svg);
        }
      } catch (err: any) {
        console.error('Mermaid render error for ' + id, err);
        if (isMounted) {
          setError(err.message || 'Failed to render Mermaid diagram');
        }
      }
    };

    renderChart();

    return () => {
      isMounted = false;
    };
  }, [chart, id]);

  const handleCopy = () => {
    navigator.clipboard.writeText(chart.trim());
    setCopied(true);
    toast({ title: 'Copied to Clipboard', description: 'Mermaid source code copied.' });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      <CardHeader className="p-4 pb-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge className="bg-indigo-600 text-white text-[10px]">{badgeText}</Badge>
              <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-500">{description}</CardDescription>
          </div>

          <div className="flex items-center gap-1.5 self-end sm:self-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCode(!showCode)}
              className="h-7 px-2 text-xs gap-1"
            >
              {showCode ? <Eye className="w-3.5 h-3.5" /> : <Code className="w-3.5 h-3.5" />}
              {showCode ? 'View Diagram' : 'View Code'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopy}
              className="h-7 px-2 text-xs gap-1"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        {showCode ? (
          <div className="p-3 bg-slate-900 text-slate-100 rounded-lg font-mono text-xs overflow-x-auto max-h-96">
            <pre className="whitespace-pre">{chart.trim()}</pre>
          </div>
        ) : error ? (
          <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg text-xs text-amber-900 dark:text-amber-200 space-y-2">
            <div className="font-semibold">Mermaid Source Fallback:</div>
            <pre className="p-2 bg-slate-900 text-slate-100 rounded overflow-x-auto">{chart.trim()}</pre>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="w-full overflow-x-auto flex justify-center py-2 bg-white dark:bg-slate-950/40 rounded-lg [&_svg]:max-w-full [&_svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        )}

        {sourceFile && (
          <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 italic">
            {sourceFile}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
export default MermaidViewer;
