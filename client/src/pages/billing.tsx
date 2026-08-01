import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Calendar, Filter } from "lucide-react";

export default function BillingPage() {
  const { user } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedConnector, setSelectedConnector] = useState("");
  const [selectedSupporter, setSelectedSupporter] = useState("");

  const { data: billingData, isLoading, error } = useQuery({
    queryKey: ["/api/billing", selectedMonth, selectedConnector, selectedSupporter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedMonth) params.append('month', selectedMonth);
      if (selectedConnector) params.append('connectorId', selectedConnector);
      if (selectedSupporter) params.append('supporterId', selectedSupporter);
      
      const token = localStorage.getItem("growth_park_token");
      const headers: Record<string, string> = {};
      
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      
      const response = await fetch(`/api/billing?${params.toString()}`, {
        headers,
        credentials: "include",
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Billing API error:', errorText);
        throw new Error(`請求データの取得に失敗しました: ${response.status}`);
      }
      const data = await response.json();
      console.log('Billing data received:', data);
      return data;
    },
    enabled: user?.role === "AddBox",
    staleTime: 0,
    gcTime: 0,
  });

  const { data: connectors = [] } = useQuery({
    queryKey: ["/api/admin/connectors"],
    enabled: user?.role === "AddBox",
  });

  const { data: supporters = [] } = useQuery({
    queryKey: ["/api/supporters"],
    enabled: user?.role === "AddBox",
  });

  const billingItems = (billingData as any)?.items || [];
  const totalAmount = (billingData as any)?.summary?.totalAmount || 0;
  const meetingCount = (billingData as any)?.summary?.meetingCount || 0;
  const period = (billingData as any)?.summary?.period || selectedMonth;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    return (
      <Badge variant="default">
        {status}
      </Badge>
    );
  };

  const exportToBilling = () => {
    const csvContent = [
      ["企業名", "担当者", "商談日", "金額", "ステータス", "コネクター", "支援先"],
      ...billingItems.map((item: any) => [
        item.companyName,
        item.contactPerson,
        new Date(item.meetingDate).toLocaleDateString('ja-JP'),
        item.fee.toString(),
        item.status,
        item.connector,
        item.supporterName || ""
      ])
    ].map(row => row.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `billing_${selectedMonth}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Error handling
  if (error) {
    return (
      <div className="space-y-6">
        <Header title="月末請求" />
        <Card>
          <CardContent className="pt-6">
            <Alert>
              <AlertDescription>
                請求データの取得中にエラーが発生しました: {(error as Error).message}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Access control
  if (user?.role !== "AddBox") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-muted-foreground mb-4">
            アクセス権限がありません
          </h1>
          <p className="text-muted-foreground">
            この機能はZETTAICHIユーザーのみ利用可能です
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header
        title="月末請求"
        subtitle="商談管理で「商談実施済み」ステータスの案件を集計し請求データを作成します"
      />

      <div className="px-6 space-y-6">
        <Alert>
          <FileText className="h-4 w-4 text-red-500" />
          <AlertDescription className="text-red-500">
            商談一覧から商談実施したものが、商談実施済みのステータスになっているか必ず確認してください。
          </AlertDescription>
        </Alert>

        {/* Filter Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Filter className="h-5 w-5" />
              <span>請求期間設定</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="space-y-2">
                <Label htmlFor="month">対象月</Label>
                <Input
                  id="month"
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-[200px]"
                />
              </div>

              {user?.role === "AddBox" && (
                <div className="space-y-2">
                  <Label htmlFor="connector">担当者</Label>
                  <Select value={selectedConnector} onValueChange={setSelectedConnector}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="全員" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">ZETTAICHI全員</SelectItem>
                      <SelectItem value="addbox">ZETTAICHI直接</SelectItem>
                      {(connectors as any[])?.filter((connector: any) => connector.role === "Connector").map((connector: any) => (
                        <SelectItem key={connector.id} value={connector.id.toString()}>
                          {connector.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {user?.role === "AddBox" && (
                <div className="space-y-2">
                  <Label htmlFor="supporter">支援先</Label>
                  <Select value={selectedSupporter} onValueChange={setSelectedSupporter}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="全て" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全ての支援先</SelectItem>
                      {(supporters as any[])?.map((supporter: any) => (
                        <SelectItem key={supporter.id} value={supporter.id.toString()}>
                          {supporter.companyName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-end">
                <Button onClick={exportToBilling} className="w-full sm:w-auto">
                  <Download className="h-4 w-4 mr-2" />
                  請求データ出力
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Billing Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                対象期間
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-lg font-semibold">
                  {new Date(selectedMonth + "-01").toLocaleDateString('ja-JP', { 
                    year: 'numeric', 
                    month: 'long' 
                  })}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                商談実施件数
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{meetingCount}件</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                請求合計金額
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {formatCurrency(totalAmount)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Billing Details Table */}
        <Card>
          <CardHeader>
            <CardTitle>請求明細</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">読み込み中...</div>
            ) : billingItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                選択した期間に該当する商談実施済み案件がありません
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>企業名</TableHead>
                      <TableHead>担当者</TableHead>
                      <TableHead>商談日</TableHead>
                      <TableHead>金額</TableHead>
                      <TableHead>ステータス</TableHead>
                      <TableHead>支援先</TableHead>
                      {user?.role === "AddBox" && <TableHead>コネクター</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {billingItems.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          {item.companyName}
                        </TableCell>
                        <TableCell>{item.contactPerson}</TableCell>
                        <TableCell>
                          {item.meetingDate ? new Date(item.meetingDate).toLocaleDateString('ja-JP') : '-'}
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(item.fee)}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(item.status)}
                        </TableCell>
                        <TableCell>
                          {item.supporterName || '-'}
                        </TableCell>
                        {user?.role === "AddBox" && (
                          <TableCell className="text-muted-foreground">
                            {item.connector}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>


      </div>
    </div>
  );
}
