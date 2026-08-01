import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  change?: {
    value: string;
    type: "increase" | "decrease" | "neutral";
  };
  icon: React.ReactNode;
  className?: string;
}

function StatsCard({ title, value, change, icon, className }: StatsCardProps) {
  const getTrendIcon = (type: "increase" | "decrease" | "neutral") => {
    switch (type) {
      case "increase":
        return <TrendingUp className="h-3 w-3" />;
      case "decrease":
        return <TrendingDown className="h-3 w-3" />;
      default:
        return <Minus className="h-3 w-3" />;
    }
  };

  const getTrendColor = (type: "increase" | "decrease" | "neutral") => {
    switch (type) {
      case "increase":
        return "text-green-600";
      case "decrease":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  return (
    <Card className={`stats-card ${className}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold mb-1">{value}</div>
        {change && (
          <div className={`flex items-center text-xs ${getTrendColor(change.type)}`}>
            {getTrendIcon(change.type)}
            <span className="ml-1">{change.value}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface DashboardStatsProps {
  stats: {
    monthlyRevenue: number;
    monthlyMeetings: number;
    totalRevenue: number;
    totalMeetings: number;
    conversionRate: number;
    activeConnectors: number;
    previousMonthRevenue?: number;
    previousMonthMeetings?: number;
    previousMonthConnectors?: number;
    previousConversionRate?: number;
  };
}

export function DashboardStats({ stats }: DashboardStatsProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const calculateChange = (current: number, previous?: number): { value: string; type: "increase" | "decrease" | "neutral"; } | undefined => {
    if (!previous || previous === 0) return undefined;
    const change = ((current - previous) / previous) * 100;
    const type: "increase" | "decrease" | "neutral" = change > 0 ? "increase" : change < 0 ? "decrease" : "neutral";
    const value = change > 0 ? `+${change.toFixed(1)}%` : `${change.toFixed(1)}%`;
    return { value, type };
  };

  const revenueChange = calculateChange(stats.monthlyRevenue, stats.previousMonthRevenue);
  const meetingsChange = calculateChange(stats.monthlyMeetings, stats.previousMonthMeetings);
  const connectorsChange = calculateChange(stats.activeConnectors, stats.previousMonthConnectors);
  const conversionChange = calculateChange(stats.conversionRate, stats.previousConversionRate);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
      <StatsCard
        title="今月の売上"
        value={formatCurrency(stats.monthlyRevenue)}
        change={revenueChange}
        icon={<span className="text-primary">¥</span>}
      />
      
      <StatsCard
        title="今月の商談数"
        value={stats.monthlyMeetings}
        change={meetingsChange}
        icon={<span className="text-primary">🤝</span>}
      />
      
      <StatsCard
        title="アクティブコネクター"
        value={stats.activeConnectors}
        change={connectorsChange}
        icon={<span className="text-primary">👥</span>}
      />
      
      <StatsCard
        title="成約率"
        value={`${stats.conversionRate}%`}
        change={conversionChange}
        icon={<span className="text-primary">📈</span>}
      />
    </div>
  );
}
