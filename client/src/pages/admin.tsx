import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Header } from "@/components/layout/header";
import { Users, Building, Eye, Calendar, Link2, Unlink } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth.toString());
  const [selectedYear, setSelectedYear] = useState<string>(currentYear.toString());
  const [chartYear, setChartYear] = useState<string>("2025");
  const [rankFilter, setRankFilter] = useState<string>("all");

  const { data: connectors, isLoading } = useQuery({
    queryKey: ["/api/admin/connectors"],
    enabled: user?.role === "AddBox",
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    staleTime: 0, // Always consider data stale for immediate updates
  });

  const { data: leads } = useQuery({
    queryKey: ["/api/leads"],
    enabled: user?.role === "AddBox",
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/dashboard/stats"],
    enabled: user?.role === "AddBox",
  });

  const { data: monthlyStats } = useQuery({
    queryKey: [`/api/dashboard/monthly-stats/${selectedYear}/${selectedMonth}`],
    enabled: user?.role === "AddBox",
    refetchOnMount: true,
    staleTime: 0,
  });

  const { data: connectedStaff } = useQuery({
    queryKey: ["/api/google/connected-staff"],
    enabled: user?.role === "AddBox",
  });

  const googleConnectMutation = useMutation({
    mutationFn: async (staffName: string) => {
      const res = await apiRequest("GET", `/api/auth/google/connect/${encodeURIComponent(staffName)}`);
      return res.json();
    },
    onSuccess: (data) => {
      window.open(data.url, "_blank", "width=500,height=600");
    },
  });

  const googleDisconnectMutation = useMutation({
    mutationFn: async (staffName: string) => {
      await apiRequest("DELETE", `/api/google/disconnect/${encodeURIComponent(staffName)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/google/connected-staff"] });
      toast({ title: "Google Calendar連携を解除しました" });
    },
  });

  const calendarStaff = ["宮本", "芝本", "浜野"];

  if (user?.role !== "AddBox") {
    return (
      <div className="p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive mb-4">アクセス権限がありません</h1>
          <p className="text-muted-foreground">この画面を表示する権限がありません。</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-muted-foreground">読み込み中...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header
        title="管理者ダッシュボード"
        subtitle="コネクター管理"
      />
      
      <div className="px-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Revenue Card - Left Side, Prominent */}
          <Card className="bg-gradient-to-r from-blue-600 to-blue-700 text-white lg:col-span-1">
            <CardContent className="pt-8 pb-8">
              <div className="text-4xl font-bold mb-2">
                ¥{leads?.filter((lead: any) => lead.status === "商談実施済み")
                  .reduce((sum: number, lead: any) => sum + (lead.meetingFee || 0), 0)
                  .toLocaleString() || 0}
              </div>
              <div className="text-sm text-blue-200 mb-3">
                税込 ¥{(leads?.filter((lead: any) => lead.status === "商談実施済み")
                  .reduce((sum: number, lead: any) => sum + (lead.meetingFee || 0), 0) * 1.1)
                  .toLocaleString() || 0}
              </div>
              <p className="text-blue-100 text-lg font-medium">累積売上（商談実施ベース）</p>
            </CardContent>
          </Card>
          
          {/* Secondary Cards - Right Side, Smaller */}
          <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">
                  {(leads || []).filter((lead: any) => lead.status === "商談実施済み").length}
                </div>
                <p className="text-blue-100 text-sm">ZETTAICHI累積商談数<br/>（商談実施ベース）</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-r from-blue-400 to-blue-500 text-white">
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{(connectors || []).length}</div>
                <p className="text-blue-100 text-sm">コネクター登録数</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Staff Performance Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>担当者別月別実績（商談実施日ベース）</CardTitle>
              <div className="flex items-center gap-2">
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2025">25年</SelectItem>
                    <SelectItem value="2026">26年</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({length: 12}, (_, i) => i + 1).map(month => (
                      <SelectItem key={month} value={month.toString()}>
                        {month}月
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {["宮本", "芝本", "浜野"].map((person) => {
                const personStats = monthlyStats?.[person] || { inProgress: 0, completed: 0, revenue: 0 };
                const { inProgress, completed, revenue } = personStats;
                
                return (
                  <Card key={person} className={`border-l-4 ${
                    person === "宮本" ? "border-l-blue-500" :
                    person === "芝本" ? "border-l-orange-500" :
                    person === "浜野" ? "border-l-teal-500" :
                    "border-l-gray-400"
                  }`}>
                    <CardContent className="pt-4">
                      <div className={`text-lg font-bold ${
                        person === "宮本" ? "text-blue-600" :
                        person === "芝本" ? "text-orange-600" :
                        person === "浜野" ? "text-teal-600" :
                        "text-gray-600"
                      }`}>
                        {person}
                      </div>
                      <div className="space-y-2 mt-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">進行中／日程確定:</span>
                          <span className="text-lg font-bold text-black">{inProgress}件</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">実施済み:</span>
                          <span className="text-lg font-bold text-red-600">{completed}件</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">売上金額:</span>
                          <span className="text-lg font-bold text-blue-600">¥{revenue.toLocaleString()}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Monthly Deal Performance Chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>月別商談実績（商談実施日ベース）</CardTitle>
              <Select value={chartYear} onValueChange={setChartYear}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2025">25年</SelectItem>
                  <SelectItem value="2026">26年</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Chart */}
              <div className="h-64 w-full bg-gray-50 rounded-lg p-4">
                <div className="flex items-end h-full justify-around">
                  {(() => {
                    // 全月の最大値を計算してグラフの高さを統一
                    const targetYear = parseInt(chartYear);
                    const allMonthsData = [1,2,3,4,5,6,7,8,9,10,11,12].map(month => {
                      const monthlyLeads = leads?.filter((lead: any) => {
                        if (lead.status !== "商談実施済み" || !lead.meetingDate) return false;
                        const meetingDate = new Date(lead.meetingDate);
                        return meetingDate.getMonth() + 1 === month && meetingDate.getFullYear() === targetYear;
                      }) || [];
                      return monthlyLeads.length;
                    });
                    const maxMeetings = Math.max(...allMonthsData, 1);
                    const maxHeight = 180;
                    
                    return [1,2,3,4,5,6,7,8,9,10,11,12].map((month) => {
                      const monthlyLeads = leads?.filter((lead: any) => {
                        if (lead.status !== "商談実施済み" || !lead.meetingDate) return false;
                        const meetingDate = new Date(lead.meetingDate);
                        return meetingDate.getMonth() + 1 === month && meetingDate.getFullYear() === targetYear;
                      }) || [];
                      
                      // 担当者別に分類
                      const staffColors = { "宮本": "#3b82f6", "芝本": "#f97316", "浜野": "#14b8a6" };
                      const staffData = ["宮本", "芝本", "浜野"].map(person => ({
                        person,
                        count: monthlyLeads.filter(lead => lead.assignedPerson === person).length,
                        color: staffColors[person as keyof typeof staffColors]
                      }));
                      
                      const totalMeetings = monthlyLeads.length;
                      const monthlyRevenue = monthlyLeads.reduce((sum: number, lead: any) => sum + (lead.meetingFee || 0), 0);
                      const barHeight = totalMeetings > 0 ? Math.max(8, (totalMeetings / maxMeetings) * maxHeight) : 0;
                      
                      return (
                        <div key={month} className="flex flex-col items-center">
                          <div className="text-xs font-medium text-gray-600 mb-2">{totalMeetings}</div>
                          <div className="flex flex-col items-center" style={{ height: `${maxHeight}px` }}>
                            <div className="flex-1" />
                            {totalMeetings > 0 && (
                              <div className="flex flex-col w-12 rounded-t overflow-hidden">
                                {staffData.map((staff, index) => {
                                  if (staff.count === 0) return null;
                                  const segmentHeight = (staff.count / totalMeetings) * barHeight;
                                  return (
                                    <div
                                      key={staff.person}
                                      className="w-full"
                                      style={{ 
                                        height: `${segmentHeight}px`,
                                        backgroundColor: staff.color
                                      }}
                                      title={`${month}月 ${staff.person}: ${staff.count}件`}
                                    />
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-2">{month}月</div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
              
              {/* Legend */}
              <div className="flex justify-center space-x-6 flex-wrap gap-2">
                {["宮本", "芝本", "浜野"].map((person, index) => (
                  <div key={person} className="flex items-center space-x-2">
                    <div 
                      className="w-4 h-4 rounded border"
                      style={{ backgroundColor: ["#3b82f6", "#f97316", "#14b8a6"][index] }}
                    />
                    <span className="text-sm font-medium">{person}</span>
                  </div>
                ))}
              </div>
              
              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                {[1,2,3,4,5,6,7,8,9,10,11,12].map((month) => {
                  const targetYear = parseInt(chartYear);
                  const monthlyLeads = leads?.filter((lead: any) => {
                    if (lead.status !== "商談実施済み" || !lead.meetingDate) return false;
                    const meetingDate = new Date(lead.meetingDate);
                    return meetingDate.getMonth() + 1 === month && meetingDate.getFullYear() === targetYear;
                  }) || [];
                  
                  const totalMeetings = monthlyLeads.length;
                  const monthlyRevenue = monthlyLeads.reduce((sum: number, lead: any) => sum + (lead.meetingFee || 0), 0);
                  
                  if (totalMeetings === 0) return null;
                  
                  return (
                    <div key={month} className="bg-white border rounded-lg p-3">
                      <div className="text-sm font-medium text-gray-600">{month}月</div>
                      <div className="text-lg font-bold text-blue-600">{totalMeetings}件</div>
                      <div className="text-sm text-green-600">¥{(monthlyRevenue / 10000).toFixed(0)}万円</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>



        {/* Connectors Management */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>コネクター一覧</CardTitle>
              <div className="flex items-center space-x-6">
                <div className="text-center">
                  <div className="text-lg font-bold text-blue-600">{(connectors || []).length}</div>
                  <div className="text-sm text-muted-foreground">総登録数</div>
                </div>
                <div className="flex flex-col space-y-1">
                  <label className="text-xs text-muted-foreground">ランクフィルター</label>
                  <Select value={rankFilter} onValueChange={setRankFilter}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全て表示</SelectItem>
                      <SelectItem value="5">★★★★★ (5)</SelectItem>
                      <SelectItem value="4">★★★★☆ (4)</SelectItem>
                      <SelectItem value="3">★★★☆☆ (3)</SelectItem>
                      <SelectItem value="2">★★☆☆☆ (2)</SelectItem>
                      <SelectItem value="1">★☆☆☆☆ (1)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名前</TableHead>
                  <TableHead>メールアドレス</TableHead>
                  <TableHead>企業名</TableHead>
                  <TableHead>企業HP</TableHead>
                  <TableHead>ランク</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(connectors || [])
                  .filter((connector: any) => {
                    const connectorRank = connector.rank || 1; // Default to 1 star
                    
                    if (rankFilter === "all") return true;
                    return connectorRank.toString() === rankFilter;
                  })
                  .map((connector: any) => {
                    const connectorRank = connector.rank || 1; // Default to 1 star
                    const getRankDisplay = (rank: number) => {
                      const filled = "★".repeat(rank);
                      const empty = "☆".repeat(5 - rank);
                      return filled + empty;
                    };
                    
                    return (
                      <TableRow key={connector.id}>
                        <TableCell className="font-medium">{connector.name}</TableCell>
                        <TableCell>{connector.email}</TableCell>
                        <TableCell>{connector.companyName || "未設定"}</TableCell>
                        <TableCell>
                          {connector.companyWebsite ? (
                            <a 
                              href={connector.companyWebsite.startsWith('http') ? connector.companyWebsite : `https://${connector.companyWebsite}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 underline"
                            >
                              {connector.companyWebsite}
                            </a>
                          ) : (
                            "未設定"
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <span className="text-yellow-500 text-lg">{getRankDisplay(connectorRank)}</span>
                            <Select 
                              value={connectorRank.toString()} 
                              onValueChange={(value) => {
                                // TODO: Implement rank update functionality
                                console.log("Update rank for connector:", connector.id, "to:", value);
                              }}
                            >
                              <SelectTrigger className="w-16 h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">1</SelectItem>
                                <SelectItem value="2">2</SelectItem>
                                <SelectItem value="3">3</SelectItem>
                                <SelectItem value="4">4</SelectItem>
                                <SelectItem value="5">5</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Link href={`/admin/connectors/${connector.id}`}>
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4 mr-2" />
                              詳細を見る
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Google Calendar連携
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-4">
              担当者のGoogleカレンダーと連携すると、ステータスが「日程確定」になった際に自動で予定が追加されます。
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>担当者</TableHead>
                  <TableHead>連携状態</TableHead>
                  <TableHead>連携アカウント</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calendarStaff.map((name) => {
                  const connected = (connectedStaff as any[])?.find((s: any) => s.staffName === name);
                  return (
                    <TableRow key={name}>
                      <TableCell className="font-medium">{name}</TableCell>
                      <TableCell>
                        {connected ? (
                          <Badge className="bg-green-100 text-green-800">連携済み</Badge>
                        ) : (
                          <Badge variant="outline" className="text-gray-500">未連携</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {connected?.email || "-"}
                      </TableCell>
                      <TableCell>
                        {connected ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => googleDisconnectMutation.mutate(name)}
                            disabled={googleDisconnectMutation.isPending}
                          >
                            <Unlink className="h-4 w-4 mr-1" />
                            解除
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => googleConnectMutation.mutate(name)}
                            disabled={googleConnectMutation.isPending}
                          >
                            <Link2 className="h-4 w-4 mr-1" />
                            連携する
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}