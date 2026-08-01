import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Edit, Trash2, Calendar, Download } from "lucide-react";
import { MeetingForm } from "./meeting-form";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

interface Meeting {
  id: number;
  leadId: number;
  supporterId?: number;
  scheduledDate?: string;
  locationOrLink?: string;
  outcome: string;
  attendanceRequired: boolean;
  attendanceFee?: number;
  addboxFee?: string;
  connectorFee?: string;
  createdAt: string;
  lead?: {
    companyName: string;
    contactPerson: string;
  };
  supporter?: {
    companyName: string;
  };
}

export function MeetingList() {
  const [searchTerm, setSearchTerm] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<number | undefined>();

  const { data: meetings, isLoading, error } = useQuery({
    queryKey: ["/api/meetings"],
  });

  const getOutcomeBadge = (outcome: string) => {
    const outcomeMap = {
      "予定": { variant: "outline" as const, label: "予定" },
      "実施済み": { variant: "default" as const, label: "実施済み" },
      "キャンセル": { variant: "destructive" as const, label: "キャンセル" },
    };

    const config = outcomeMap[outcome as keyof typeof outcomeMap] || { variant: "secondary" as const, label: outcome };
    
    return (
      <Badge variant={config.variant}>
        {config.label}
      </Badge>
    );
  };

  const meetingsArray = Array.isArray(meetings) ? meetings as Meeting[] : [];
  const filteredMeetings = meetingsArray.filter((meeting: Meeting) => {
    const companyName = meeting.lead?.companyName || "";
    const contactPerson = meeting.lead?.contactPerson || "";
    const matchesSearch = companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         contactPerson.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesOutcome = !outcomeFilter || outcomeFilter === "all" || meeting.outcome === outcomeFilter;
    return matchesSearch && matchesOutcome;
  });

  const handleEditMeeting = (meetingId: number) => {
    setEditingMeeting(meetingId);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingMeeting(undefined);
  };

  const exportToCSV = () => {
    const csvHeaders = [
      "商談ID",
      "企業名", 
      "担当者",
      "予定日時",
      "場所/リンク",
      "結果",
      "参加必須",
      "サポーター企業",
      "ZETTAICHI手数料",
      "コネクター手数料",
      "登録日時"
    ];

    const csvData = filteredMeetings.map(meeting => [
      meeting.id,
      meeting.lead?.companyName || "未設定",
      meeting.lead?.contactPerson || "未設定",
      meeting.scheduledDate ? new Date(meeting.scheduledDate).toLocaleString('ja-JP') : "未設定",
      meeting.locationOrLink || "未設定",
      meeting.outcome,
      meeting.attendanceRequired ? "必須" : "任意",
      meeting.supporter?.companyName || "未設定",
      meeting.addboxFee || "未設定",
      meeting.connectorFee || "未設定",
      new Date(meeting.createdAt).toLocaleString('ja-JP')
    ]);

    const csvContent = [csvHeaders, ...csvData]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    // UTF-8 BOM for proper Japanese character display in Excel
    const bom = "\uFEFF";
    const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    
    const timestamp = new Date().toISOString().slice(0, 10);
    const searchSuffix = searchTerm ? `_検索_${searchTerm}` : "";
    const filterSuffix = outcomeFilter && outcomeFilter !== "all" ? `_フィルター_${outcomeFilter}` : "";
    
    link.setAttribute("download", `商談一覧_${timestamp}${searchSuffix}${filterSuffix}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-destructive">
            商談の取得に失敗しました
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>商談管理</CardTitle>
            <div className="flex items-center gap-3">
              <Button 
                onClick={exportToCSV}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Download className="h-4 w-4 mr-2" />
                CSV形式でエクスポート ({filteredMeetings.length}件)
              </Button>
              <Dialog open={showForm} onOpenChange={setShowForm}>
                <DialogTrigger asChild>
                  <Button onClick={() => setEditingMeeting(undefined)}>
                    <Plus className="h-4 w-4 mr-2" />
                    新規商談登録
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <MeetingForm
                    meetingId={editingMeeting}
                    onSuccess={handleFormSuccess}
                  />
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="企業名または担当者名で検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                autoComplete="off"
              />
            </div>
            <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="ステータス" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全てのステータス</SelectItem>
                <SelectItem value="予定">予定</SelectItem>
                <SelectItem value="実施済み">実施済み</SelectItem>
                <SelectItem value="キャンセル">キャンセル</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="text-center py-8">読み込み中...</div>
          ) : filteredMeetings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm || outcomeFilter ? "条件に一致する商談が見つかりません" : "商談がありません"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>企業名</TableHead>
                    <TableHead>担当者</TableHead>
                    <TableHead>支援先</TableHead>
                    <TableHead>商談日時</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead>同席</TableHead>
                    <TableHead>アクション</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMeetings.map((meeting: Meeting) => (
                    <TableRow key={meeting.id}>
                      <TableCell className="font-medium">
                        {meeting.lead?.companyName || "N/A"}
                      </TableCell>
                      <TableCell>{meeting.lead?.contactPerson || "N/A"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {meeting.supporter?.companyName || "未設定"}
                      </TableCell>
                      <TableCell>
                        {meeting.scheduledDate ? (
                          <div className="flex items-center space-x-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span>
                              {new Date(meeting.scheduledDate).toLocaleString('ja-JP', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">未設定</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {getOutcomeBadge(meeting.outcome)}
                      </TableCell>
                      <TableCell>
                        {meeting.attendanceRequired ? (
                          <div className="flex flex-col">
                            <Badge variant="outline" className="text-xs">必要</Badge>
                            {meeting.attendanceFee && (
                              <span className="text-xs text-muted-foreground mt-1">
                                ¥{meeting.attendanceFee.toLocaleString()}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">不要</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditMeeting(meeting.id)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
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
    </div>
  );
}
