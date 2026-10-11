import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Header } from "@/components/layout/header";
import { LeadForm } from "@/components/leads/lead-form";
import { MeetingReportForm } from "@/components/meeting-reports/meeting-report-form";
import { Plus, Search, Edit, Trash2, Download, Eye, Copy, FileText, CalendarPlus, Check } from "lucide-react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const INTERNAL_STAFF = ["森尾", "宮本", "林", "福嶋", "芝本", "棗", "浜野", "阿久津"];

export default function LeadsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const scrollPositionRef = useRef<number>(0);

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
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [supporterFilter, setSupporterFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [createdDateFrom, setCreatedDateFrom] = useState<string>("");
  const [createdDateTo, setCreatedDateTo] = useState<string>("");
  const [meetingDateFrom, setMeetingDateFrom] = useState<string>("");
  const [meetingDateTo, setMeetingDateTo] = useState<string>("");
  const [meetingDateInputs, setMeetingDateInputs] = useState<Record<number, string>>({});
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingLead, setEditingLead] = useState<number | undefined>();
  const [showMeetingReports, setShowMeetingReports] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportLead, setReportLead] = useState<{ id: number; companyName: string; contactPerson: string } | null>(null);
  const [dealLinkInputs, setDealLinkInputs] = useState<{[key: number]: {contact: string, url: string}}>({});
  const { data: leads, isLoading } = useQuery({
    queryKey: ['/api/leads'],
    enabled: !!user
  });
  const { data: supporters } = useQuery({
    queryKey: ['/api/supporters'],
    enabled: !!user
  });
  const deleteMutation = useMutation({
    mutationFn: async (leadId: number) => {
      await apiRequest("DELETE", `/api/leads/${leadId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'] });
      toast({
        title: "成功",
        description: "商談を削除しました",
      });
    },
    onError: () => {
      toast({
        title: "エラー",
        description: "商談の削除に失敗しました",
        variant: "destructive",
      });
    },
  });
  const statusUpdateMutation = useMutation({
    mutationFn: async ({ leadId, status, meetingDate, dealLinkContact, dealLinkUrl }: { leadId: number; status?: string; meetingDate?: string; dealLinkContact?: string; dealLinkUrl?: string }) => {
      const updateData: any = {};
      if (status !== undefined) updateData.status = status;
      if (meetingDate !== undefined) updateData.meetingDate = meetingDate;
      if (dealLinkContact !== undefined) updateData.dealLinkContact = dealLinkContact;
      if (dealLinkUrl !== undefined) updateData.dealLinkUrl = dealLinkUrl;
      const response = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('growth_park_token')}`
        },
        body: JSON.stringify(updateData)
      });
      if (!response.ok) {
        throw new Error('データの更新に失敗しました');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'] });
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
  const addToCalendarMutation = useMutation({
    mutationFn: async (leadId: number) => {
      const response = await fetch(`/api/leads/${leadId}/add-to-calendar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('growth_park_token')}`
        },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        let msg = 'カレンダー登録に失敗しました';
        try {
          const data = await response.json();
          msg = data.message || msg;
        } catch { 
          msg = await response.text() || msg;
        }
        throw new Error(msg);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'] });
      toast({
        title: "成功",
        description: "Googleカレンダーに予定を追加しました。ステータスを「日程確定」に更新しました。",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "エラー",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  const handleFormSuccess = () => {
    setShowNewForm(false);
    setEditingLead(undefined);
  };
  const handleDelete = (leadId: number) => {
    if (confirm("この商談を削除してもよろしいですか？")) {
      deleteMutation.mutate(leadId);
    }
  };
  const handleStatusChange = (leadId: number, status: string) => {
    statusUpdateMutation.mutate({ leadId, status });
  };

  const handleShowReportForm = (lead: any) => {
    // スクロール位置を保存
    scrollPositionRef.current = window.scrollY;
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
    toast({ title: "商談報告書が閲覧できます" });
  };

  // ダイアログが閉じられたときにスクロール位置を復元
  useEffect(() => {
    if (!showNewForm && !showReportForm && scrollPositionRef.current > 0) {
      setTimeout(() => {
        window.scrollTo(0, scrollPositionRef.current);
      }, 50);
    }
  }, [showNewForm, showReportForm]);

  const updateDealLinkInput = (leadId: number, field: 'contact' | 'url', value: string) => {
    setDealLinkInputs(prev => ({
      ...prev,
      [leadId]: {
        contact: prev[leadId]?.contact || "",
        url: prev[leadId]?.url || "",
        [field]: value
      }
    }));
  };

  const saveDealLinkField = (leadId: number, field: 'contact' | 'url') => {
    const currentInput = dealLinkInputs[leadId];
    if (!currentInput) return;

    const updateData: any = {};
    if (field === 'contact') {
      updateData.dealLinkContact = currentInput.contact;
    } else {
      updateData.dealLinkUrl = currentInput.url;
    }

    statusUpdateMutation.mutate({ leadId, ...updateData });
  };
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "進行中":
        return <Badge className="bg-blue-100 text-blue-800 border border-blue-300">進行中</Badge>;
      case "日程確定":
        return <Badge className="bg-yellow-100 text-yellow-800 border border-yellow-300">日程確定</Badge>;
      case "商談実施済み":
        return <Badge className="bg-red-100 text-red-800 border border-red-300">商談実施済み</Badge>;
      case "失注":
        return <Badge className="bg-gray-100 text-gray-800 border border-gray-300">失注</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800 border border-gray-300">{status}</Badge>;
    }
  };
  const getStatusSelectStyle = (status: string) => {
    switch (status) {
      case "進行中":
        return "bg-blue-100 border-blue-300 text-blue-800";
      case "日程確定":
        return "bg-yellow-100 border-yellow-300 text-yellow-800";
      case "商談実施済み":
        return "bg-red-100 border-red-300 text-red-800";
      case "失注":
        return "bg-gray-100 border-gray-300 text-gray-800";
      default:
        return "bg-gray-100 border-gray-300 text-gray-800";
    }
  };
  const filteredLeads = leads?.filter((lead: any) => {
    const matchesSearch = (lead.companyName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                         (lead.contactPerson?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                         (lead.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                         (lead.supporter?.companyName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                         (lead.assignedPerson?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                         (lead.status?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                         (lead.meetingFee?.toString() || '').includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
    const isInternalStaffLead = !!lead.assignedPerson && INTERNAL_STAFF.includes(lead.assignedPerson);
    const matchesStaff = staffFilter === "all" ||
      (staffFilter === "internal" && isInternalStaffLead) ||
      (staffFilter === "connector" && !isInternalStaffLead);
    const matchesSupporter = supporterFilter === "all" || lead.supporter?.companyName === supporterFilter;
    const matchesMonth = monthFilter === "all" || (() => {
      const targetDate = lead.meetingDate ? new Date(lead.meetingDate) : new Date(lead.createdAt);
      const month = targetDate.getMonth() + 1;
      return month.toString() === monthFilter;
    })();
    const matchesYear = yearFilter === "all" || (() => {
      const targetDate = lead.meetingDate ? new Date(lead.meetingDate) : new Date(lead.createdAt);
      const year = targetDate.getFullYear();
      return year.toString() === yearFilter;
    })();
    const matchesCreatedDateRange = (() => {
      if (!createdDateFrom && !createdDateTo) return true;
      if (!lead.createdAt) return false;
      const created = new Date(lead.createdAt);
      created.setHours(0, 0, 0, 0);
      if (createdDateFrom) {
        const from = new Date(createdDateFrom);
        from.setHours(0, 0, 0, 0);
        if (created < from) return false;
      }
      if (createdDateTo) {
        const to = new Date(createdDateTo);
        to.setHours(23, 59, 59, 999);
        if (created > to) return false;
      }
      return true;
    })();
    const matchesMeetingDateRange = (() => {
      if (!meetingDateFrom && !meetingDateTo) return true;
      if (!lead.meetingDate) return false;
      const meeting = new Date(lead.meetingDate);
      meeting.setHours(0, 0, 0, 0);
      if (meetingDateFrom) {
        const from = new Date(meetingDateFrom);
        from.setHours(0, 0, 0, 0);
        if (meeting < from) return false;
      }
      if (meetingDateTo) {
        const to = new Date(meetingDateTo);
        to.setHours(23, 59, 59, 999);
        if (meeting > to) return false;
      }
      return true;
    })();
    return matchesSearch && matchesStatus && matchesStaff && matchesSupporter && matchesMonth && matchesYear && matchesCreatedDateRange && matchesMeetingDateRange;
  }) || [];
  // AddBox経由とコネクター経由で商談を分ける
  // 社内担当者が設定されている場合はZETTAICHI経由
  const addBoxLeads = filteredLeads.filter((lead: any) => 
    lead.assignedPerson && INTERNAL_STAFF.includes(lead.assignedPerson)
  );
  const connectorLeads = filteredLeads.filter((lead: any) => 
    !lead.assignedPerson || !INTERNAL_STAFF.includes(lead.assignedPerson)
  );

  // AddBox経由の売上計算（従来通りmeetingFeeで計算）
  const addBoxInProgressRevenue = addBoxLeads
    .filter((lead: any) => lead.status === '進行中' && lead.meetingFee)
    .reduce((sum: number, lead: any) => sum + (Number(lead.meetingFee) || 0), 0);
  
  const addBoxScheduledRevenue = addBoxLeads
    .filter((lead: any) => lead.status === '日程確定' && lead.meetingFee)
    .reduce((sum: number, lead: any) => sum + (Number(lead.meetingFee) || 0), 0);
  
  const addBoxConfirmedRevenue = addBoxLeads
    .filter((lead: any) => lead.status === '商談実施済み' && lead.meetingFee)
    .reduce((sum: number, lead: any) => sum + (Number(lead.meetingFee) || 0), 0);

  // コネクター経由の売上計算（AddBoxユーザーの場合は利益ベースで計算）
  const connectorInProgressRevenue = connectorLeads
    .filter((lead: any) => lead.status === '進行中' && lead.supporter)
    .reduce((sum: number, lead: any) => {
      if (user?.role === 'AddBox') {
        // AddBoxユーザーの場合は利益ベース（AddBox商談フィー - コネクター商談フィー）
        const addboxFee = lead.supporter?.addboxFee || 0;
        const connectorFee = lead.supporter?.connectorFee || 0;
        return sum + (addboxFee - connectorFee);
      } else {
        // コネクターユーザーの場合は従来通り
        return sum + (Number(lead.meetingFee) || 0);
      }
    }, 0);
  
  const connectorScheduledRevenue = connectorLeads
    .filter((lead: any) => lead.status === '日程確定' && lead.supporter)
    .reduce((sum: number, lead: any) => {
      if (user?.role === 'AddBox') {
        // AddBoxユーザーの場合は利益ベース（AddBox商談フィー - コネクター商談フィー）
        const addboxFee = lead.supporter?.addboxFee || 0;
        const connectorFee = lead.supporter?.connectorFee || 0;
        return sum + (addboxFee - connectorFee);
      } else {
        // コネクターユーザーの場合は従来通り
        return sum + (Number(lead.meetingFee) || 0);
      }
    }, 0);
  
  const connectorConfirmedRevenue = connectorLeads
    .filter((lead: any) => lead.status === '商談実施済み' && lead.supporter)
    .reduce((sum: number, lead: any) => {
      if (user?.role === 'AddBox') {
        // AddBoxユーザーの場合は利益ベース（AddBox商談フィー - コネクター商談フィー）
        const addboxFee = lead.supporter?.addboxFee || 0;
        const connectorFee = lead.supporter?.connectorFee || 0;
        return sum + (addboxFee - connectorFee);
      } else {
        // コネクターユーザーの場合は従来通り
        return sum + (Number(lead.meetingFee) || 0);
      }
    }, 0);
  const exportToCSV = () => {
    const csvHeaders = [
      "企業名",
      "担当者",
      "メールアドレス",
      "電話番号",
      "売上",
      "支援者",
      "担当者",
      "ステータス",
      "紹介日",
      "商談費用"
    ];
    const csvData = filteredLeads.map((lead: any) => [
      lead.companyName || "",
      lead.contactPerson || "",
      lead.email || "",
      lead.phoneNumber || "",
      lead.revenue ? `¥${lead.revenue.toLocaleString()}` : "",
      lead.supporter?.companyName || "",
      lead.assignedPerson || "",
      lead.status || "",
      lead.introducedAt ? format(new Date(lead.introducedAt), "yyyy/M/d", { locale: ja }) : "",
      lead.meetingFee ? `¥${lead.meetingFee.toLocaleString()}` : ""
    ]);
    const csvContent = [csvHeaders, ...csvData]
      .map(row => row.map(cell => `"${cell}"`).join(","))
      .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `商談一覧_${format(new Date(), "yyyyMMdd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "CSVファイルをダウンロードしました" });
  };
  if (!user) {
    return <div>認証が必要です</div>;
  }
  return (
    <div className="space-y-6">
      <Header
        title="商談管理"
        subtitle="全ての商談を管理"
      />
      <div className="px-6 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>商談一覧 ({filteredLeads.length}件)</CardTitle>
              <div className="flex items-center gap-3">
                <Button 
                  onClick={exportToCSV}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Download className="h-4 w-4 mr-2" />
                  CSV形式でエクスポート ({filteredLeads.length}件)
                </Button>
                <Dialog open={showNewForm} onOpenChange={setShowNewForm}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      新規商談登録
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <LeadForm 
                      onSuccess={handleFormSuccess} 
                      leadId={editingLead} 
                      readOnly={editingLead && connectorLeads.some(lead => lead.id === editingLead)} 
                    />
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Search and Filter */}
            <div className="flex flex-col gap-4 mb-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="全項目から検索（企業名、お名前、支援先、売上、担当者、ステータス）"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    autoComplete="off"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="ステータス" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ステータス</SelectItem>
                    <SelectItem value="進行中">進行中</SelectItem>
                    <SelectItem value="日程確定">日程確定</SelectItem>
                    <SelectItem value="商談実施済み">商談実施済み</SelectItem>
                    <SelectItem value="失注">失注</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={yearFilter} onValueChange={setYearFilter}>
                  <SelectTrigger className="w-24">
                    <SelectValue placeholder="年" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全年</SelectItem>
                    <SelectItem value="2025">25年</SelectItem>
                    <SelectItem value="2026">26年</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={monthFilter} onValueChange={setMonthFilter}>
                  <SelectTrigger className="w-28">
                    <SelectValue placeholder="商談月" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全商談月</SelectItem>
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
              <Select value={staffFilter} onValueChange={setStaffFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="担当区分" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべての担当区分</SelectItem>
                  <SelectItem value="internal">繋いだ担当者</SelectItem>
                  <SelectItem value="connector">コネクター</SelectItem>
                </SelectContent>
              </Select>
                <Select value={supporterFilter} onValueChange={setSupporterFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="支援先" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">支援先</SelectItem>
                    {((supporters as any[]) || [])
                      .filter((supporter: any) => supporter.status === "アクティブ")
                      .map((supporter: any) => (
                      <SelectItem key={supporter.id} value={supporter.companyName}>
                        {supporter.companyName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 items-end">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-600 whitespace-nowrap">登録日:</span>
                  <Input
                    type="date"
                    value={createdDateFrom}
                    onChange={(e) => setCreatedDateFrom(e.target.value)}
                    className="w-36"
                  />
                  <span className="text-sm text-gray-400">〜</span>
                  <Input
                    type="date"
                    value={createdDateTo}
                    onChange={(e) => setCreatedDateTo(e.target.value)}
                    className="w-36"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-600 whitespace-nowrap">商談日:</span>
                  <Input
                    type="date"
                    value={meetingDateFrom}
                    onChange={(e) => setMeetingDateFrom(e.target.value)}
                    className="w-36"
                  />
                  <span className="text-sm text-gray-400">〜</span>
                  <Input
                    type="date"
                    value={meetingDateTo}
                    onChange={(e) => setMeetingDateTo(e.target.value)}
                    className="w-36"
                  />
                </div>
                {(createdDateFrom || createdDateTo || meetingDateFrom || meetingDateTo) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCreatedDateFrom("");
                      setCreatedDateTo("");
                      setMeetingDateFrom("");
                      setMeetingDateTo("");
                    }}
                  >
                    日付クリア
                  </Button>
                )}
              </div>
            </div>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <div className="space-y-0">
                {/* AddBox経由の商談 */}
                <div className="leads-section">
                  <div className="flex items-center mb-6">
                    <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-md font-semibold text-sm">
                      ▼ ZETTAICHI経由 ({addBoxLeads.length}件)
                    </div>
                  </div>
                  <Table className="leads-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="col-resizable" style={{width: '10%'}}>企業名</TableHead>
                        <TableHead className="col-resizable" style={{width: '6%'}}>お名前</TableHead>
                        <TableHead className="col-resizable" style={{width: '10%'}}>支援先</TableHead>
                        <TableHead className="col-resizable" style={{width: '6%'}}>売上</TableHead>
                        <TableHead className="col-resizable" style={{width: '6%'}}>担当者</TableHead>
                        <TableHead className="col-resizable" style={{width: '9%'}}>ステータス</TableHead>
                        <TableHead className="col-resizable" style={{width: '14%'}}>商談日時</TableHead>
                        <TableHead className="col-resizable" style={{width: '8%'}}>登録日</TableHead>
                        <TableHead className="col-resizable" style={{width: '18%'}}>商談リンク</TableHead>
                        <TableHead style={{width: '5%'}}>操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {addBoxLeads.map((lead: any) => (
                        <TableRow key={lead.id}>
                          <TableCell className="font-medium w-32 px-2">{lead.companyName}</TableCell>
                          <TableCell className="w-24 px-2">{lead.contactPerson}</TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <span>{lead.supporter?.companyName || "-"}</span>
                              {lead.supporter?.serviceName && (
                                <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-md text-xs font-medium">
                                  {lead.supporter.serviceName}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className={`font-medium ${
                            lead.status === "商談実施済み" ? "text-red-600" :
                            lead.status === "失注" ? "text-gray-600" : ""
                          }`}>
                            {lead.status === "失注" ? "¥0" : 
                             lead.meetingFee ? `¥${Number(lead.meetingFee).toLocaleString()}` : "-"}
                          </TableCell>
                          <TableCell className="assignee-col-mobile md:assignee-col-tablet lg:assignee-col-pc xl:assignee-col-large">
                            <div className="flex flex-col gap-1">
                              {lead.assignedPerson && (
                                <span className={`assignee-badge ${
                                  lead.assignedPerson === "森尾" ? "bg-red-100 text-red-800 border border-red-300" :
                                  lead.assignedPerson === "宮本" ? "bg-blue-100 text-blue-800 border border-blue-300" :
                                  lead.assignedPerson === "林" ? "bg-green-100 text-green-800 border border-green-300" :
                                  lead.assignedPerson === "福嶋" ? "bg-purple-100 text-purple-800 border border-purple-300" :
                                  lead.assignedPerson === "芝本" ? "bg-orange-100 text-orange-800 border border-orange-300" :
                                  lead.assignedPerson === "棗" ? "bg-pink-100 text-pink-800 border border-pink-300" :
                                  lead.assignedPerson === "浜野" ? "bg-teal-100 text-teal-800 border border-teal-300" :
                                  lead.assignedPerson === "阿久津" ? "bg-indigo-100 text-indigo-800 border border-indigo-300" :
                                  "bg-gray-100 text-gray-800 border border-gray-300"
                                }`}>
                                  {lead.assignedPerson}
                                </span>
                              )}
                              {lead.assignedPersonSub && lead.assignedPersonSub !== "なし" && (
                                <span className="text-xs text-gray-500">
                                  サブ: {lead.assignedPersonSub}
                                </span>
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
                                <SelectItem value="日程確定">日程確定</SelectItem>
                                <SelectItem value="商談実施済み">商談実施済み</SelectItem>
                                <SelectItem value="失注">失注</SelectItem>
                              </SelectContent>
                            </Select>
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
                            {new Date(lead.createdAt).toLocaleDateString('ja-JP')}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 flex-nowrap">
                              <input
                                type="text"
                                placeholder="リンク"
                                value={
                                  dealLinkInputs[lead.id]?.url !== undefined 
                                    ? dealLinkInputs[lead.id].url 
                                    : (lead.dealLinkUrl || "")
                                }
                                onChange={(e) => {
                                  updateDealLinkInput(lead.id, 'url', e.target.value);
                                }}
                                onBlur={() => {
                                  saveDealLinkField(lead.id, 'url');
                                }}
                                onFocus={() => {
                                  if (!dealLinkInputs[lead.id]) {
                                    setDealLinkInputs(prev => ({
                                      ...prev,
                                      [lead.id]: {
                                        contact: lead.dealLinkContact || "",
                                        url: lead.dealLinkUrl || ""
                                      }
                                    }));
                                  }
                                }}
                                className="flex-1 min-w-0 px-2 py-1 border rounded text-sm"
                              />
                              {(dealLinkInputs[lead.id]?.url || lead.dealLinkUrl) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => copyToClipboard(dealLinkInputs[lead.id]?.url || lead.dealLinkUrl, 'リンク')}
                                  title="リンクをコピー"
                                  className="h-7 w-7 p-0 flex-shrink-0"
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              )}
                              {lead.meetingDate && lead.assignedPerson && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => addToCalendarMutation.mutate(lead.id)}
                                  disabled={addToCalendarMutation.isPending}
                                  title="Googleカレンダーに追加"
                                  className="text-green-600 hover:text-green-800 h-7 w-7 p-0 flex-shrink-0"
                                >
                                  <CalendarPlus className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  scrollPositionRef.current = window.scrollY;
                                  queryClient.invalidateQueries({ queryKey: [`/api/leads/${lead.id}`] });
                                  queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
                                  setEditingLead(lead.id);
                                  setShowNewForm(true);
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(lead.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={10} className="text-right font-medium">
                          <div className="space-y-1">
                            <div>進行中売上：¥{addBoxInProgressRevenue.toLocaleString()}</div>
                            <div>日程確定売上：¥{addBoxScheduledRevenue.toLocaleString()}</div>
                            <div className="text-red-600">確定売上：¥{addBoxConfirmedRevenue.toLocaleString()}</div>
                          </div>
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
                {/* コネクター経由の商談 */}
                <div className="leads-section">
                  <div className="flex items-center mb-6">
                    <div className="bg-green-100 text-green-800 px-3 py-1 rounded-md font-semibold text-sm">
                      ▼ コネクター経由 ({connectorLeads.length}件) - 閲覧専用
                    </div>
                  </div>
                  <Table className="leads-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="col-resizable" style={{width: '10%'}}>企業名</TableHead>
                        <TableHead className="col-resizable" style={{width: '6%'}}>お名前</TableHead>
                        <TableHead className="col-resizable" style={{width: '10%'}}>支援先</TableHead>
                        <TableHead className="col-resizable" style={{width: '6%'}}>売上</TableHead>
                        <TableHead className="col-resizable" style={{width: '6%'}}>担当者</TableHead>
                        <TableHead className="col-resizable" style={{width: '9%'}}>ステータス</TableHead>
                        <TableHead className="col-resizable" style={{width: '14%'}}>商談日時</TableHead>
                        <TableHead className="col-resizable" style={{width: '8%'}}>登録日</TableHead>
                        <TableHead className="col-resizable" style={{width: '16%'}}>商談リンク</TableHead>
                        <TableHead style={{width: '4%'}}>報告書</TableHead>
                        <TableHead style={{width: '5%'}}>操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {connectorLeads.map((lead: any) => (
                        <TableRow key={lead.id}>
                          <TableCell className="font-medium w-32 px-2">
                            {lead.companyName}
                          </TableCell>
                          <TableCell className="w-24 px-2">
                            {lead.contactPerson}
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <span>{lead.supporter?.companyName || "-"}</span>
                              {lead.supporter?.serviceName && (
                                <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-md text-xs font-medium">
                                  {lead.supporter.serviceName}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className={`font-medium ${
                            lead.status === "商談実施済み" ? "text-red-600" :
                            lead.status === "失注" ? "text-gray-600" : ""
                          }`}>
                            {lead.status === "失注" ? "¥0" : 
                             lead.meetingFee ? `¥${Number(lead.meetingFee).toLocaleString()}` : "-"}
                          </TableCell>
                          <TableCell className="assignee-col-mobile md:assignee-col-tablet lg:assignee-col-pc xl:assignee-col-large">
                            <div className="flex flex-col gap-1">
                              {lead.assignedPerson && (
                                <span className={`assignee-badge ${
                                  lead.assignedPerson === "森尾" ? "bg-red-100 text-red-800 border border-red-300" :
                                  lead.assignedPerson === "宮本" ? "bg-blue-100 text-blue-800 border border-blue-300" :
                                  lead.assignedPerson === "林" ? "bg-green-100 text-green-800 border border-green-300" :
                                  lead.assignedPerson === "福嶋" ? "bg-purple-100 text-purple-800 border border-purple-300" :
                                  lead.assignedPerson === "芝本" ? "bg-orange-100 text-orange-800 border border-orange-300" :
                                  lead.assignedPerson === "棗" ? "bg-pink-100 text-pink-800 border border-pink-300" :
                                  lead.assignedPerson === "浜野" ? "bg-teal-100 text-teal-800 border border-teal-300" :
                                  lead.assignedPerson === "阿久津" ? "bg-indigo-100 text-indigo-800 border border-indigo-300" :
                                  "bg-gray-100 text-gray-800 border border-gray-300"
                                }`}>
                                  {lead.assignedPerson}
                                </span>
                              )}
                              {lead.assignedPersonSub && lead.assignedPersonSub !== "なし" && (
                                <span className="text-xs text-gray-500">
                                  サブ: {lead.assignedPersonSub}
                                </span>
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
                                <SelectItem value="日程確定">日程確定</SelectItem>
                                <SelectItem value="商談実施済み">商談実施済み</SelectItem>
                                <SelectItem value="失注">失注</SelectItem>
                              </SelectContent>
                            </Select>
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
                            {new Date(lead.createdAt).toLocaleDateString('ja-JP')}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 flex-nowrap">
                              <input
                                type="text"
                                placeholder="リンク"
                                value={
                                  dealLinkInputs[lead.id]?.url !== undefined 
                                    ? dealLinkInputs[lead.id].url 
                                    : (lead.dealLinkUrl || "")
                                }
                                onChange={(e) => {
                                  updateDealLinkInput(lead.id, 'url', e.target.value);
                                }}
                                onBlur={() => {
                                  saveDealLinkField(lead.id, 'url');
                                }}
                                onFocus={() => {
                                  if (!dealLinkInputs[lead.id]) {
                                    setDealLinkInputs(prev => ({
                                      ...prev,
                                      [lead.id]: {
                                        contact: lead.dealLinkContact || "",
                                        url: lead.dealLinkUrl || ""
                                      }
                                    }));
                                  }
                                }}
                                className="flex-1 min-w-0 px-2 py-1 border rounded text-sm"
                              />
                              {(dealLinkInputs[lead.id]?.url || lead.dealLinkUrl) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => copyToClipboard(dealLinkInputs[lead.id]?.url || lead.dealLinkUrl, 'リンク')}
                                  title="リンクをコピー"
                                  className="h-7 w-7 p-0 flex-shrink-0"
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              )}
                              {lead.meetingDate && lead.assignedPerson && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => addToCalendarMutation.mutate(lead.id)}
                                  disabled={addToCalendarMutation.isPending}
                                  title="Googleカレンダーに追加"
                                  className="text-green-600 hover:text-green-800 h-7 w-7 p-0 flex-shrink-0"
                                >
                                  <CalendarPlus className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleShowReportForm(lead)}
                              title="商談報告書を閲覧"
                            >
                              <FileText className="h-4 w-4 text-blue-500" />
                            </Button>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  queryClient.invalidateQueries({ queryKey: [`/api/leads/${lead.id}`] });
                                  queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
                                  setEditingLead(lead.id);
                                  setShowNewForm(true);
                                }}
                                title="詳細を閲覧"
                              >
                                <Eye className="h-4 w-4 text-gray-500" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={11} className="text-right font-medium">
                          <div className="space-y-1">
                            <div>進行中売上：¥{connectorInProgressRevenue.toLocaleString()}</div>
                            <div>日程確定売上：¥{connectorScheduledRevenue.toLocaleString()}</div>
                            <div className="text-red-600">確定売上：¥{connectorConfirmedRevenue.toLocaleString()}</div>
                          </div>
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 新規商談フォーム */}
      <Dialog open={showNewForm} onOpenChange={setShowNewForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <LeadForm
            leadId={editingLead}
            onSuccess={handleFormSuccess}
            onCancel={() => {
              setShowNewForm(false);
              setEditingLead(undefined);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* 商談報告書ダイアログ */}
      <Dialog open={showReportForm} onOpenChange={setShowReportForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {reportLead && (
            <MeetingReportForm
              leadId={reportLead.id}
              companyName={reportLead.companyName}
              contactPerson={reportLead.contactPerson}
              onSuccess={handleReportFormSuccess}
              onCancel={() => {
                setShowReportForm(false);
                setReportLead(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
