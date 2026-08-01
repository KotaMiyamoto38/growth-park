import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Header } from "@/components/layout/header";
import { LeadForm } from "@/components/leads/lead-form";
import { User, Building, Calendar, Plus, Edit, Trash2, Check, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function ConnectorPage() {
  const { connectorId } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isLeadFormOpen, setIsLeadFormOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<number | undefined>();
  const [editingField, setEditingField] = useState<{leadId: number, field: string} | null>(null);
  const [editValue, setEditValue] = useState("");

  // Access control: Only allow if user is the connector or is AddBox admin
  const canAccess = user?.role === "AddBox" || (user?.role === "Connector" && user.id.toString() === connectorId);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: [`/api/connectors/${connectorId}/profile`],
    enabled: canAccess && !!connectorId,
  });

  const { data: leads, isLoading: leadsLoading } = useQuery({
    queryKey: [`/api/connectors/${connectorId}/leads`],
    enabled: canAccess && !!connectorId,
  });

  const { data: meetings } = useQuery({
    queryKey: [`/api/connectors/${connectorId}/meetings`],
    enabled: canAccess && !!connectorId,
  });

  // Mutations for inline editing
  const updateLeadMutation = useMutation({
    mutationFn: async ({ leadId, data }: { leadId: number; data: any }) => {
      return await apiRequest(`/api/leads/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/connectors/${connectorId}/leads`] });
      setEditingField(null);
      setEditValue("");
      toast({
        title: "成功",
        description: "商談情報を更新しました。",
      });
    },
    onError: (error: any) => {
      toast({
        title: "エラー",
        description: error.message || "更新に失敗しました。",
        variant: "destructive",
      });
    },
  });

  // Status update mutation
  const statusUpdateMutation = useMutation({
    mutationFn: async ({ leadId, status, meetingDate }: { leadId: number; status?: string; meetingDate?: string }) => {
      const updateData: any = {};
      if (status !== undefined) updateData.status = status;
      if (meetingDate !== undefined) updateData.meetingDate = meetingDate;
      
      const response = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });
      
      if (!response.ok) {
        throw new Error('データの更新に失敗しました');
      }
      
      return response.json();
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

  const deleteLeadMutation = useMutation({
    mutationFn: async (leadId: number) => {
      return await apiRequest(`/api/leads/${leadId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/connectors/${connectorId}/leads`] });
      toast({
        title: "成功",
        description: "商談を削除しました。",
      });
    },
    onError: (error: any) => {
      toast({
        title: "エラー",
        description: error.message || "削除に失敗しました。",
        variant: "destructive",
      });
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

  const getDisplayName = (profile: any) => {
    if (!profile) return "コネクター";
    if (profile.companyName === "個人") {
      return profile.name;
    }
    return profile.companyName || profile.name;
  };

  const handleLeadFormSuccess = () => {
    setIsLeadFormOpen(false);
    setEditingLead(undefined);
    queryClient.invalidateQueries({ queryKey: [`/api/connectors/${connectorId}/leads`] });
  };

  const handleDeleteLead = (leadId: number) => {
    if (confirm("この商談を削除してもよろしいですか？")) {
      deleteLeadMutation.mutate(leadId);
    }
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



  return (
    <div className="space-y-6">
      <Header
        title={`${getDisplayName(profile)}のダッシュボード`}
        subtitle="あなたの商談と活動を管理"
      />
      
      <div className="px-6 space-y-6">
        {/* Overview Cards - マスター画面スタイル */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-blue-600 text-white border-0">
            <CardContent className="p-6">
              <div className="text-sm opacity-90 mb-2">累積売上（商談実施ベース）</div>
              <div className="text-3xl font-bold">
                ¥{((leads as any) || [])
                  .filter((lead: any) => lead.status === "商談実施済み")
                  .reduce((sum: number, lead: any) => sum + (lead.meetingFee || 50000), 0)
                  .toLocaleString()}
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-blue-500 text-white border-0">
            <CardContent className="p-6">
              <div className="text-sm opacity-90 mb-2">累積商談実施済数</div>
              <div className="text-3xl font-bold">
                {((leads as any) || []).filter((lead: any) => lead.status === "商談実施済み").length}
              </div>
              <div className="text-sm opacity-75">件数</div>
            </CardContent>
          </Card>
          
          <Card className="bg-blue-400 text-white border-0">
            <CardContent className="p-6">
              <div className="text-sm opacity-90 mb-2">進行中商談</div>
              <div className="text-3xl font-bold">
                {((leads as any) || []).filter((lead: any) => lead.status === "進行中").length}
              </div>
              <div className="text-sm opacity-75">件数</div>
            </CardContent>
          </Card>
        </div>

        {/* Monthly Performance Chart */}
        <Card>
          <CardHeader>
            <CardTitle>月別商談実績（2025年6月〜）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {/* Chart */}
              <div className="flex items-end justify-center space-x-12 h-96 overflow-x-auto px-12 py-8">
                {(() => {
                  // Get data for months 6-12 (June to December)
                  const monthsToShow = [6, 7, 8, 9, 10, 11, 12];
                  const allMonthsData = monthsToShow.map(month => {
                    const monthlyLeads = ((leads as any) || []).filter((lead: any) => {
                      if (lead.status !== "商談実施済み" || !lead.meetingDate) return false;
                      const meetingDate = new Date(lead.meetingDate);
                      return meetingDate.getMonth() + 1 === month && meetingDate.getFullYear() === 2025;
                    });
                    return monthlyLeads.length;
                  });
                  const maxMeetings = Math.max(...allMonthsData, 1);
                  const maxHeight = 280;
                  
                  return monthsToShow.map((month) => {
                    const monthlyLeads = ((leads as any) || []).filter((lead: any) => {
                      if (lead.status !== "商談実施済み" || !lead.meetingDate) return false;
                      const meetingDate = new Date(lead.meetingDate);
                      return meetingDate.getMonth() + 1 === month && meetingDate.getFullYear() === 2025;
                    });
                    
                    const totalMeetings = monthlyLeads.length;
                    const monthlyRevenue = monthlyLeads.reduce((sum: number, lead: any) => sum + (lead.meetingFee || 50000), 0);
                    const barHeight = totalMeetings > 0 ? Math.max(12, (totalMeetings / maxMeetings) * maxHeight) : 0;
                    
                    return (
                      <div key={month} className="flex flex-col items-center">
                        <div className="text-sm font-bold text-gray-700 mb-3">{totalMeetings}</div>
                        <div className="flex flex-col items-center" style={{ height: `${maxHeight}px` }}>
                          <div className="flex-1" />
                          {totalMeetings > 0 && (
                            <div 
                              className="w-20 bg-gradient-to-t from-blue-600 to-blue-400 rounded-t shadow-md hover:shadow-lg transition-shadow cursor-pointer"
                              style={{ height: `${barHeight}px` }}
                              title={`${month}月: ${totalMeetings}件 (¥${(monthlyRevenue / 10000).toFixed(0)}万円)`}
                            />
                          )}
                        </div>
                        <div className="text-sm font-medium text-gray-600 mt-3">{month}月</div>
                      </div>
                    );
                  });
                })()}
              </div>
              
              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[6, 7, 8, 9, 10, 11, 12].map((month) => {
                  const monthlyLeads = ((leads as any) || []).filter((lead: any) => {
                    if (lead.status !== "商談実施済み" || !lead.meetingDate) return false;
                    const meetingDate = new Date(lead.meetingDate);
                    return meetingDate.getMonth() + 1 === month && meetingDate.getFullYear() === 2025;
                  });
                  
                  const totalMeetings = monthlyLeads.length;
                  const monthlyRevenue = monthlyLeads.reduce((sum: number, lead: any) => sum + (lead.meetingFee || 50000), 0);
                  
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

        {/* Leads Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>商談一覧 ({((leads as any) || []).length}件)</CardTitle>
              <Dialog open={isLeadFormOpen} onOpenChange={setIsLeadFormOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => {
                    setEditingLead(undefined);
                    setIsLeadFormOpen(true);
                  }}>
                    <Plus className="h-4 w-4 mr-2" />
                    新規商談登録
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <LeadForm 
                    onSuccess={handleLeadFormSuccess} 
                    leadId={editingLead}
                    connectorId={parseInt(connectorId!)}
                  />
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>企業名</TableHead>
                    <TableHead>担当者</TableHead>
                    <TableHead>支援先</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead>売上</TableHead>
                    <TableHead>商談日</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {((leads as any) || []).map((lead: any) => (
                    <TableRow key={lead.id}>
                      <TableCell className="font-medium">{lead.companyName}</TableCell>
                      <TableCell>{lead.contactPerson}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{lead.supporter?.companyName || "-"}</span>
                          {lead.supporter?.serviceName && (
                            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-md text-xs font-medium">
                              {lead.supporter.serviceName}
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
                          <SelectTrigger className={`w-36 ${getStatusSelectStyle(lead.status)}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="進行中">進行中</SelectItem>
                            <SelectItem value="商談実施済み">商談実施済み</SelectItem>
                            <SelectItem value="失注">失注</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className={`font-medium ${
                        lead.status === "商談実施済み" ? "text-red-600" :
                        lead.status === "失注" ? "text-gray-600" : ""
                      }`}>
                        {lead.status === "失注" ? "¥0" : 
                         lead.meetingFee ? `¥${Number(lead.meetingFee).toLocaleString()}` : 
                         lead.status === "商談実施済み" ? "¥50,000" : "-"}
                      </TableCell>
                      <TableCell>
                        {editingField?.leadId === lead.id && editingField?.field === 'meetingDate' ? (
                          <div className="flex items-center gap-2">
                            <Input
                              type="date"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-32"
                            />
                            <Button size="sm" onClick={() => handleSaveEdit(lead.id, 'meetingDate')}>
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingField(null)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <div 
                            className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded"
                            onClick={() => handleEditClick(lead.id, 'meetingDate', lead.meetingDate || '')}
                          >
                            {lead.meetingDate ? new Date(lead.meetingDate).toLocaleDateString('ja-JP') : "未設定"}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingLead(lead.id);
                              setIsLeadFormOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteLead(lead.id)}
                            className="text-red-600 hover:text-red-700"
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}