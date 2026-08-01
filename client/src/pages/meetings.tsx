import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Download, Edit, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { MeetingForm } from "@/components/meetings/meeting-form";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Meeting } from "@shared/schema";

export default function MeetingsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<number | undefined>();
  const { toast } = useToast();

  const { data: meetings, isLoading, error } = useQuery({
    queryKey: ["/api/meetings"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/meetings/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("商談の削除に失敗しました");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });
      toast({ title: "商談を削除しました" });
    },
    onError: () => {
      toast({ title: "エラー", description: "商談の削除に失敗しました", variant: "destructive" });
    },
  });

  const meetingsArray = Array.isArray(meetings) ? meetings as Meeting[] : [];
  const filteredMeetings = meetingsArray.filter((meeting: Meeting) => {
    const companyName = meeting.lead?.companyName || "";
    const contactPerson = meeting.lead?.contactPerson || "";
    const matchesSearch = companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         contactPerson.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesOutcome = !outcomeFilter || outcomeFilter === "all" || meeting.outcome === outcomeFilter;
    return matchesSearch && matchesOutcome;
  });

  const exportToCSV = () => {
    const csvHeaders = [
      "企業名",
      "担当者",
      "支援者",
      "売上",
      "担当者",
      "ステータス",
      "商談日",
      "操作"
    ];

    const csvData = filteredMeetings.map((meeting: Meeting) => [
      meeting.lead?.companyName || "",
      meeting.lead?.contactPerson || "",
      meeting.lead?.supporter?.companyName || "",
      meeting.lead?.revenue ? `¥${meeting.lead.revenue.toLocaleString()}` : "",
      meeting.lead?.assignedPerson || "",
      meeting.outcome || "",
      meeting.scheduledAt ? format(new Date(meeting.scheduledAt), "yyyy/M/d", { locale: ja }) : "",
      ""
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

  const getOutcomeBadge = (outcome: string) => {
    const outcomeMap = {
      "予定": { variant: "outline" as const, label: "予定" },
      "実施済み": { variant: "default" as const, label: "実施済み" },
      "キャンセル": { variant: "destructive" as const, label: "キャンセル" },
    };
    return outcomeMap[outcome as keyof typeof outcomeMap] || { variant: "outline" as const, label: outcome };
  };

  const handleEditMeeting = (meetingId: number) => {
    setEditingMeeting(meetingId);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingMeeting(undefined);
    queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });
  };

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">商談データの取得に失敗しました</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">商談管理</h1>
          <p className="text-muted-foreground">全ての商談を管理</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>商談一覧 ({filteredMeetings.length}件)</CardTitle>
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
              {searchTerm || outcomeFilter ? "検索条件に一致する商談がありません" : "商談がありません"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>企業名</TableHead>
                  <TableHead>担当者</TableHead>
                  <TableHead>支援者</TableHead>
                  <TableHead>売上</TableHead>
                  <TableHead>担当者</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>商談日</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMeetings.map((meeting: Meeting) => {
                  const badge = getOutcomeBadge(meeting.outcome || "");
                  return (
                    <TableRow key={meeting.id}>
                      <TableCell className="font-medium">
                        {meeting.lead?.companyName}
                      </TableCell>
                      <TableCell>{meeting.lead?.contactPerson}</TableCell>
                      <TableCell>{meeting.lead?.supporter?.companyName}</TableCell>
                      <TableCell>
                        {meeting.lead?.revenue ? `¥${meeting.lead.revenue.toLocaleString()}` : ""}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{meeting.lead?.assignedPerson}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {meeting.scheduledAt ? format(new Date(meeting.scheduledAt), "yyyy/M/d", { locale: ja }) : ""}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
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
                            onClick={() => deleteMutation.mutate(meeting.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
