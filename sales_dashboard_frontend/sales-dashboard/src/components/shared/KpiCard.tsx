import { Card } from "../ui/card";
import { cn } from "../../lib/utils";

interface Props {
  label: string;
  value: string;
  sub?: string;
  accent?: "primary" | "success" | "warning" | "info" | "destructive";
  loading?: boolean;
}

const ACCENT: Record<string, string> = {
  primary: "from-blue-500/15 to-blue-500/0 text-blue-500",
  success: "from-green-500/15 to-green-500/0 text-green-500",
  warning: "from-yellow-500/15 to-yellow-500/0 text-yellow-500",
  info: "from-cyan-500/15 to-cyan-500/0 text-cyan-500",
  destructive: "from-red-500/15 to-red-500/0 text-red-500",
};

export function KpiCard({ label, value, sub, accent = "primary", loading }: Props) {
  const a = ACCENT[accent];
  return (
    <Card className="relative overflow-hidden border-border/60 p-4 transition-all hover:shadow-md hover:-translate-y-0.5">
      <div className={cn("absolute inset-0 bg-gradient-to-br opacity-60", a.split(" ").slice(0, 2).join(" "))} />
      <div className="relative">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {loading ? (
          <div className="mt-1 h-8 w-24 animate-pulse rounded bg-muted" />
        ) : (
          <p className={cn("mt-1 truncate text-2xl font-bold tracking-tight", a.split(" ").slice(2).join(" "))}>
            {value}
          </p>
        )}
        {sub && !loading && (
          <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
        )}
      </div>
    </Card>
  );
}