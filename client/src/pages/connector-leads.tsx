import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Header } from "@/components/layout/header";
import { LeadForm } from "@/components/leads/lead-form";
import { MeetingReportForm } from "@/components/meeting-reports/meeting-report-form";
import { Plus, Edit, Trash2, Search, Download, Calendar, FileText, Copy, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function ConnectorLeadsPage() {
  const { connectorId } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isLeadFormOpen, setIsLeadFormOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<number | undefined>();
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportLead, setReportLead] = useState<{ id: number; companyName: string; contactPerson: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [meetingDateInputs, setMeetingDateInputs] = useState<Record<number, string>>({});
  const [statusFilter, setStatusFilter] = useState("全て");
  const [monthFilter, setMonthFilter] = useState("全て");

  const toJSTDateTimeLocal = (dateStr: string) => {
    const d = new Date(dateStr);
    const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return jst.toISOString().slice(0, 16);
  };

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({
        title: "コピーしました",
        description: `${fieldName}をクリップボードにコピーしました`,
      });
    }).catch(() => {
      toast({
        title: "エラー",
        description: "コピーに失敗しました",
        variant: "destructive",
      });
    });
  };

  // Access control: Only allow if user is the connector or is AddBox admin
  const canAccess = user?.role === "AddBox" || (user?.role === "Connector" && user.id.toString() === connectorId);

  const { data: profile } = useQuery({
    queryKey: [`/api/connectors/${connectorId}/profile`],
    enabled: canAccess && !!connectorId,
  });

  const { data: leads, isLoading: leadsLoading, refetch: refetchLeads } = useQuery({
    queryKey: [`/api/connectors/${connectorId}/leads`],
    enabled: canAccess && !!connectorId,
    refetchInterval: 5000, // 5秒ごとに自動更新
    refetchOnWindowFocus: true, // ウィンドウフォーカス時に更新
  });

  // Status update mutation
  const statusUpdateMutation = useMutation({
    mutationFn: async ({ leadId, status, meetingDate }: { leadId: number; status?: string; meetingDate?: string }) => {
      const updateData: any = {};
      if (status !== undefined) updateData.status = status;
      if (meetingDate !== undefined) updateData.meetingDate = meetingDate;
      
      return await apiRequest("PATCH", `/api/leads/${leadId}`, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/connectors/${connectorId}/leads`] });
      toast({
        title: "成功",
        description: "データを更新しました",
      });
    },
    onError: () => {
      toast({
        title: "エラー",
        description: "データの更新に失敗しました",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (leadId: number) => {
      await apiRequest("DELETE", `/api/leads/${leadId}`);
    },
    onSuccess: () => {
      toast({ title: "リードを削除しました" });
      queryClient.invalidateQueries({ queryKey: [`/api/connectors/${connectorId}/leads`] });
    },
    onError: () => {
      toast({ title: "削除に失敗しました", variant: "destructive" });
    },
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

  const handleLeadFormSuccess = () => {
    setIsLeadFormOpen(false);
    setEditingLead(undefined);
    queryClient.invalidateQueries({ queryKey: [`/api/connectors/${connectorId}/leads`] });
  };

  const handleDeleteLead = (leadId: number) => {
    if (confirm("このリードを削除してもよろしいですか？")) {
      deleteMutation.mutate(leadId);
    }
  };

  const handleShowReportForm = (lead: any) => {
    setReportLead({
      id: lead.id,
      companyName: lead.companyName,
      contactPerson: lead.contactPerson
    });
    setShowReportForm(true);
  };

  const handleReportFormSuccess = () => {
    setShowReportForm(false);
    setReportLead(null);
    toast({ title: "商談報告書が提出されました" });
  };

  const handleStatusChange = (leadId: number, status: string) => {
    statusUpdateMutation.mutate({ leadId, status });
  };

  const getStatusSelectStyle = (status: string) => {
    switch (status) {
      case "進行中":
        return "bg-blue-100 text-blue-800 border-blue-300";
      case "商談実施済み":
        return "bg-red-100 text-red-800 border-red-300";
      case "失注":
        return "bg-gray-100 text-gray-800 border-gray-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  const getDisplayName = (profile: any) => {
    if (!profile) return "コネクター";
    if (profile.companyName === "個人") {
      return profile.name;
    }
    return profile.companyName || profile.name;
  };

  // Filter leads based on search, status, and month
  const filteredLeads = ((leads as any) || []).filter((lead: any) => {
    const matchesSearch = searchQuery === "" || 
      lead.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.contactPerson?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "全て" || lead.status === statusFilter;
    
    const matchesMonth = monthFilter === "全て" || (() => {
      // 商談日が入力されている場合は商談日を使用、未入力の場合は登録日を使用
      const targetDate = lead.meetingDate ? new Date(lead.meetingDate) : new Date(lead.createdAt);
      const month = targetDate.getMonth() + 1;
      return month.toString() === monthFilter;
    })();
    
    return matchesSearch && matchesStatus && matchesMonth;
  });

  const exportToCSV = () => {
    const csvData = filteredLeads.map((lead: any) => [
      lead.companyName,
      lead.contactPerson,
      lead.contactInfo,
      lead.meetingFee,
      lead.status,
      new Date(lead.createdAt).toLocaleDateString()
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + "企業名,担当者,連絡先,料金,ステータス,作成日\n"
      + csvData.map(row => row.join(",")).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `商談管理_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <Header
        title="商談管理"
        subtitle="全ての商談を管理"
      />
      
      <div className="px-6 space-y-6">
        {/* Main Content Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>商談一覧 ({filteredLeads.length}件)</CardTitle>
              <div className="flex gap-2">
                <Button 
                  variant="outline"
                  onClick={() => refetchLeads()}
                  className="text-sm"
                  disabled={leadsLoading}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${leadsLoading ? 'animate-spin' : ''}`} />
                  更新
                </Button>
                <Button 
                  variant="outline"
                  onClick={exportToCSV}
                  className="text-sm"
                >
                  <Download className="h-4 w-4 mr-2" />
                  CSVでエクスポート ({filteredLeads.length}件)
                </Button>
                {user?.role === "Connector" && user.id.toString() === connectorId && (
                  <Dialog open={isLeadFormOpen} onOpenChange={(open) => {
                    setIsLeadFormOpen(open);
                    if (!open) {
                      setEditingLead(undefined);
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Button 
                        className="bg-blue-600 hover:bg-blue-700"
                        onClick={() => {
                          setEditingLead(undefined);
                          setIsLeadFormOpen(true);
                        }}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        新規商談登録
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                      <LeadForm 
                        onSuccess={handleLeadFormSuccess}
                        leadId={editingLead}
                      />
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search and Filter Bar */}
            <div className="flex gap-4 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="企業名、担当者、支援先、その他のキーワードで検索"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="全て">全て</SelectItem>
                  <SelectItem value="進行中">進行中</SelectItem>
                  <SelectItem value="商談実施済み">商談実施済み</SelectItem>
                  <SelectItem value="失注">失注</SelectItem>
                </SelectContent>
              </Select>
              <Select value={monthFilter} onValueChange={setMonthFilter}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="全て">全商談月</SelectItem>
                  <SelectItem value="1">1月</SelectItem>
                  <SelectItem value="2">2月</SelectItem>
                  <SelectItem value="3">3月</SelectItem>
                  <SelectItem value="4">4月</SelectItem>
                  <SelectItem value="5">5月</SelectItem>
                  <SelectItem value="6">6月</SelectItem>
                  <SelectItem value="7">7月</SelectItem>
                  <SelectItem value="8">8月</SelectItem>
                  <SelectItem value="9">9月</SelectItem>
                  <SelectItem value="10">10月</SelectItem>
                  <SelectItem value="11">11月</SelectItem>
                  <SelectItem value="12">12月</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Results Table */}
            {leadsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-500 mb-2">
                  {searchQuery || statusFilter !== "全て" || monthFilter !== "全て" ? "検索条件に一致する商談が見つかりません" : "まだ商談がありません"}
                </div>
                {(searchQuery || statusFilter !== "全て" || monthFilter !== "全て") && (
                  <Button variant="outline" onClick={() => {
                    setSearchQuery("");
                    setStatusFilter("全て");
                    setMonthFilter("全て");
                  }}>
                    検索条件をクリア
                  </Button>
                )}
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead className="font-semibold">企業名</TableHead>
                      <TableHead className="font-semibold">担当者</TableHead>
                      <TableHead className="font-semibold">支援先</TableHead>
                      <TableHead className="font-semibold">金額</TableHead>
                      <TableHead className="font-semibold">商談日時</TableHead>
                      <TableHead className="font-semibold">ステータス</TableHead>
                      <TableHead className="font-semibold">登録日</TableHead>
                      <TableHead className="font-semibold">商談リンク</TableHead>
                      <TableHead className="font-semibold">報告書</TableHead>
                      <TableHead className="font-semibold">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLeads.map((lead: any) => (
                      <TableRow key={lead.id} className="hover:bg-gray-50">
                        <TableCell className="font-medium">{lead.companyName}</TableCell>
                        <TableCell>{lead.contactPerson}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>{lead.supporter?.companyName || "未設定"}</div>
                            {lead.supporter?.serviceName && (
                              <div className="text-gray-500 text-xs">{lead.supporter.serviceName}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          ¥{lead.meetingFee?.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <input
                              type="datetime-local"
                              value={meetingDateInputs[lead.id] !== undefined ? meetingDateInputs[lead.id] : (lead.meetingDate ? toJSTDateTimeLocal(lead.meetingDate) : "")}
                              onChange={(e) => {
                                setMeetingDateInputs(prev => ({ ...prev, [lead.id]: e.target.value }));
                              }}
                              className={`w-[140px] px-1 py-1 border rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                                lead.meetingDate 
                                  ? 'border-blue-300 bg-blue-50 hover:bg-blue-100' 
                                  : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
                              }`}
                              disabled={statusUpdateMutation.isPending}
                              autoComplete="off"
                              style={{
                                colorScheme: 'light',
                                appearance: 'auto'
                              }}
                            />
                            {meetingDateInputs[lead.id] !== undefined && meetingDateInputs[lead.id] !== (lead.meetingDate ? toJSTDateTimeLocal(lead.meetingDate) : "") && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const newDate = meetingDateInputs[lead.id];
                                  statusUpdateMutation.mutate({ leadId: lead.id, meetingDate: newDate || null });
                                  setMeetingDateInputs(prev => { const n = { ...prev }; delete n[lead.id]; return n; });
                                }}
                                disabled={statusUpdateMutation.isPending}
                                title="日時を確定"
                                className="h-6 px-2 text-xs bg-blue-500 text-white hover:bg-blue-600 border-blue-500 whitespace-nowrap"
                              >
                                決定
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={lead.status}
                            onValueChange={(value) => handleStatusChange(lead.id, value)}
                            disabled={statusUpdateMutation.isPending}
                          >
                            <SelectTrigger className={`w-40 ${getStatusSelectStyle(lead.status)}`}>
                              <SelectValue>
                                {lead.status}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="進行中">進行中</SelectItem>
                              <SelectItem value="商談実施済み">商談実施済み</SelectItem>
                              <SelectItem value="失注">失注</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {new Date(lead.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-2">
                            {lead.dealLinkUrl && (
                              <div className="flex items-center space-x-2">
                                <div className="text-sm text-gray-700 truncate max-w-32" title={lead.dealLinkUrl}>
                                  {lead.dealLinkUrl}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => copyToClipboard(lead.dealLinkUrl, 'リンク')}
                                  title="リンクをコピー"
                                  className="h-6 w-6 p-0"
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                            {!lead.dealLinkUrl && (
                              <div className="text-sm text-gray-400">未設定</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleShowReportForm(lead)}
                            className="h-8 px-2"
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            報告書
                          </Button>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingLead(lead.id);
                                setIsLeadFormOpen(true);
                              }}
                              className="h-8 w-8 p-0"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteLead(lead.id)}
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-800 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Meeting Report Dialog */}
        <Dialog open={showReportForm} onOpenChange={setShowReportForm}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            {reportLead && (
              <MeetingReportForm
                leadId={reportLead.id}
                companyName={reportLead.companyName}
                contactPerson={reportLead.contactPerson}
                onSuccess={handleReportFormSuccess}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}