import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Header } from "@/components/layout/header";
import { Calendar, Download, Filter } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function ConnectorBillingPage() {
  const { connectorId } = useParams();
  const { user } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

  // Access control: Only allow if user is the connector or is AddBox admin
  const canAccess = user?.role === "AddBox" || (user?.role === "Connector" && user.id.toString() === connectorId);

  const { data: profile } = useQuery({
    queryKey: [`/api/connectors/${connectorId}/profile`],
    enabled: canAccess && !!connectorId,
  });

  // Billing data for this connector - using same pattern as billing page
  const actualConnectorId = user?.role === "Connector" ? user.id.toString() : connectorId;
  const { data: billingData, isLoading: billingLoading } = useQuery({
    queryKey: ["/api/billing", selectedMonth, actualConnectorId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedMonth) params.append('month', selectedMonth);
      if (actualConnectorId) params.append('connectorId', actualConnectorId);
      
      const response = await fetch(`/api/billing?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch billing data');
      return response.json();
    },
    enabled: canAccess && !!actualConnectorId,
    staleTime: 0,
    gcTime: 0,
  });

  if (!canAccess) {
    return (
      <div className="p-6">
        <Alert>
          <AlertDescription>
            このページにアクセスする権限がありません。
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const getDisplayName = (profile: any) => {
    if (!profile) return "コネクター";
    if (profile.companyName === "個人") {
      return profile.name;
    }
    return profile.companyName || profile.name;
  };

  const exportToExcel = () => {
    const csvData = ((billingData as any)?.items || []).map((item: any) => [
      item.companyName,
      item.contactPerson,
      item.meetingFee,
      item.meetingDate ? new Date(item.meetingDate).toLocaleDateString() : "",
      item.status
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + "企業名,担当者,金額,商談日,ステータス\n"
      + csvData.map((row: any) => row.join(",")).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `請求データ_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <Header
        title="月末請求"
        subtitle="商談実施済みの、ステータスの案件を集計し請求データを作成します"
      />
      
      <div className="px-6 space-y-6">
        {/* Notice Bar */}
        <Alert className="border-orange-200 bg-orange-50">
          <AlertDescription className="text-orange-800">
            商談一覧から商談実施済みのステータスについて月末請求します。商談一覧から商談実施したものが、商談実施済みのステータスになっているか必ず確認してください。
          </AlertDescription>
        </Alert>

        {/* Filter Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              請求期間設定
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">対象月</label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(() => {
                      const months = [];
                      const now = new Date();
                      
                      // 2025年06月から現在月+6ヶ月まで生成
                      const startYear = 2025;
                      const startMonth = 6; // 6月
                      const currentYear = now.getFullYear();
                      const currentMonth = now.getMonth() + 1; // 1-based
                      
                      // 開始月から6ヶ月先まで
                      for (let year = startYear; year <= currentYear + 1; year++) {
                        const monthStart = year === startYear ? startMonth : 1;
                        const monthEnd = year === currentYear ? Math.min(currentMonth + 6, 12) : 12;
                        
                        for (let month = monthStart; month <= monthEnd; month++) {
                          if (year === currentYear + 1 && month > currentMonth + 6 - 12) break;
                          
                          const monthStr = `${year}-${String(month).padStart(2, '0')}`;
                          const displayStr = `${year}年${String(month).padStart(2, '0')}月`;
                          months.push({ value: monthStr, label: displayStr });
                        }
                      }
                      
                      return months.map(month => (
                        <SelectItem key={month.value} value={month.value}>
                          {month.label}
                        </SelectItem>
                      ));
                    })()}
                  </SelectContent>
                </Select>
              </div>

              <Button 
                className="bg-blue-600 hover:bg-blue-700"
                onClick={exportToExcel}
                disabled={((billingData as any)?.items || []).length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                請求データ出力
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Summary Section */}
        <div className="grid grid-cols-3 gap-6">
          <Card>
            <CardContent className="p-6 text-center">
              <div className="flex items-center justify-center mb-2">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
              <p className="text-sm text-gray-600 mb-1">対象期間</p>
              <p className="text-xl font-bold text-gray-900">{selectedMonth}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-sm text-gray-600 mb-1">商談実施件数</p>
              <p className="text-3xl font-bold text-gray-900">{((billingData as any)?.items || []).length}件</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-sm text-gray-600 mb-1">請求合計金額</p>
              <p className="text-3xl font-bold text-gray-900">¥{((billingData as any)?.summary?.totalAmount || 0).toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>

        {/* Details Table */}
        <Card>
          <CardHeader>
            <CardTitle>請求明細</CardTitle>
          </CardHeader>
          <CardContent>
            {billingLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : ((billingData as any)?.items || []).length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead className="font-semibold">企業名</TableHead>
                      <TableHead className="font-semibold">担当者</TableHead>
                      <TableHead className="font-semibold">商談日</TableHead>
                      <TableHead className="font-semibold">金額</TableHead>
                      <TableHead className="font-semibold">ステータス</TableHead>
                      <TableHead className="font-semibold">コネクター</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {((billingData as any)?.items || []).map((item: any) => (
                      <TableRow key={item.id} className="hover:bg-gray-50">
                        <TableCell className="font-medium">{item.companyName}</TableCell>
                        <TableCell>{item.contactPerson}</TableCell>
                        <TableCell>
                          {item.meetingDate ? new Date(item.meetingDate).toLocaleDateString() : (
                            <span className="text-gray-400">未設定</span>
                          )}
                        </TableCell>
                        <TableCell className="font-semibold">¥{(item.fee || 0).toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge 
                            variant="default"
                            className="bg-blue-100 text-blue-800 border-blue-200"
                          >
                            {item.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{getDisplayName(profile)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-gray-500 mb-2">選択した月には商談実施済み案件がありません</div>
                <p className="text-sm text-gray-400">他の月を選択してください</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}