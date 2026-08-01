import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Header } from "@/components/layout/header";
import { User, Building, Calendar, Mail, Phone } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function AdminConnectorDetailPage() {
  const { connectorId } = useParams();
  const { user } = useAuth();

  const { data: connector, isLoading: connectorLoading } = useQuery({
    queryKey: [`/api/admin/connectors/${connectorId}`],
    enabled: user?.role === "AddBox" && !!connectorId,
  });

  const { data: leads, isLoading: leadsLoading } = useQuery({
    queryKey: [`/api/connectors/${connectorId}/leads`],
    enabled: user?.role === "AddBox" && !!connectorId,
  });

  const { data: meetings, isLoading: meetingsLoading } = useQuery({
    queryKey: [`/api/connectors/${connectorId}/meetings`],
    enabled: user?.role === "AddBox" && !!connectorId,
  });

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

  if (connectorLoading) {
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
        title={`コネクター詳細: ${connector?.name || "不明"}`}
        subtitle="コネクターの詳細情報と活動履歴"
      />
      
      <div className="px-6 space-y-6">
        {/* Connector Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              プロフィール情報
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">名前:</span>
                  <span>{connector?.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">メール:</span>
                  <span>{connector?.email}</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Building className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">企業名:</span>
                  <span>{connector?.companyName || "未設定"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">登録日:</span>
                  <span>{connector?.createdAt ? new Date(connector.createdAt).toLocaleDateString() : "不明"}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Leads Table */}
        <Card>
          <CardHeader>
            <CardTitle>リード一覧 ({leads?.length || 0}件)</CardTitle>
          </CardHeader>
          <CardContent>
            {leadsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>企業名</TableHead>
                    <TableHead>担当者</TableHead>
                    <TableHead>メール</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead>紹介日</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads?.map((lead: any) => (
                    <TableRow key={lead.id}>
                      <TableCell className="font-medium">{lead.companyName}</TableCell>
                      <TableCell>{lead.contactPerson}</TableCell>
                      <TableCell>{lead.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{lead.status}</Badge>
                      </TableCell>
                      <TableCell>
                        {lead.introducedAt ? new Date(lead.introducedAt).toLocaleDateString() : "未設定"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Meetings Table */}
        <Card>
          <CardHeader>
            <CardTitle>商談一覧 ({meetings?.length || 0}件)</CardTitle>
          </CardHeader>
          <CardContent>
            {meetingsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>リード企業</TableHead>
                    <TableHead>予定日時</TableHead>
                    <TableHead>場所/リンク</TableHead>
                    <TableHead>結果</TableHead>
                    <TableHead>参加必須</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {meetings?.map((meeting: any) => (
                    <TableRow key={meeting.id}>
                      <TableCell className="font-medium">{meeting.lead?.companyName || "不明"}</TableCell>
                      <TableCell>
                        {meeting.scheduledDate ? new Date(meeting.scheduledDate).toLocaleString() : "未設定"}
                      </TableCell>
                      <TableCell>{meeting.locationOrLink || "未設定"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{meeting.outcome}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={meeting.attendanceRequired ? "default" : "secondary"}>
                          {meeting.attendanceRequired ? "必須" : "任意"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}