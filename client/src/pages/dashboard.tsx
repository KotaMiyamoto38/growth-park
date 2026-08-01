import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Header } from "@/components/layout/header";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { StatusChart } from "@/components/dashboard/status-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus, UserPlus, FileText, Settings, TrendingUp, Clock, CheckCircle } from "lucide-react";

export default function DashboardPage() {
  const { user } = useAuth();
  const [filters, setFilters] = useState({});

  const { data: dashboardStats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/dashboard/stats", filters],
  });

  const emptyRevenueData = {
    labels: [],
    values: [],
  };

  const emptyStatusData = {
    labels: [],
    values: [],
    colors: [],
  };

  const handleFiltersChange = (newFilters: any) => {
    setFilters(newFilters);
  };

  const getRoleSpecificTitle = () => {
    switch (user?.role) {
      case "AddBox":
        return "Growth Parkの全体状況を確認できます";
      case "Connector":
        return "コネクター向けの成果と進捗状況";
      case "Supporter":
        return "支援先向けのリード状況";
      default:
        return "ダッシュボード";
    }
  };

  const stats = dashboardStats || {
    monthlyRevenue: 2580000,
    monthlyMeetings: 12,
    totalRevenue: 15600000,
    totalMeetings: 48,
    conversionRate: 75,
    activeConnectors: 3,
    previousMonthRevenue: 2200000,
    previousMonthMeetings: 10,
    previousMonthConnectors: 3,
    previousConversionRate: 70,
  };

  return (
    <div className="space-y-6">
      <Header
        title="ダッシュボード"
        subtitle={getRoleSpecificTitle()}
        showFilters={true}
        onFiltersChange={handleFiltersChange}
      />

      {/* KPI Stats */}
      <DashboardStats stats={stats} />

      {/* Charts Section */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <RevenueChart data={emptyRevenueData} />
        <StatusChart data={emptyStatusData} />
      </div>

      {/* Recent Activities & Top Performers */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Recent Activities */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold">最近の活動</CardTitle>
              <Button variant="ghost" size="sm" className="text-primary">
                全て表示
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">
                最近の活動はありません
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Top Performers or Quick Actions */}
        {user?.role === "AddBox" ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold">今月のトップパフォーマー</CardTitle>
                <Button variant="ghost" size="sm" className="text-primary">
                  ランキング
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">
                  データがありません
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">今月の目標</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Settings className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">
                  目標が設定されていません
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">クイックアクション</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {user?.role === "AddBox" && (
              <Button variant="outline" className="flex items-center p-4 h-auto text-left justify-start">
                <div className="p-2 bg-primary/10 rounded-lg mr-3">
                  <Plus className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">新規支援先登録</p>
                  <p className="text-xs text-muted-foreground">支援先を追加</p>
                </div>
              </Button>
            )}

            <Button variant="outline" className="flex items-center p-4 h-auto text-left justify-start">
              <div className="p-2 bg-success/10 rounded-lg mr-3">
                <UserPlus className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  {user?.role === "AddBox" ? "コネクター招待" : "メンバー招待"}
                </p>
                <p className="text-xs text-muted-foreground">新しいメンバーを招待</p>
              </div>
            </Button>

            <Button variant="outline" className="flex items-center p-4 h-auto text-left justify-start">
              <div className="p-2 bg-warning/10 rounded-lg mr-3">
                <FileText className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-sm font-medium">レポート出力</p>
                <p className="text-xs text-muted-foreground">月次レポート生成</p>
              </div>
            </Button>

            <Button variant="outline" className="flex items-center p-4 h-auto text-left justify-start">
              <div className="p-2 bg-muted rounded-lg mr-3">
                <Settings className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">設定</p>
                <p className="text-xs text-muted-foreground">アカウント設定</p>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
