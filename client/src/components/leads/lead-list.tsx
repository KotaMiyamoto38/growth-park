import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Edit, Trash2 } from "lucide-react";
import { LeadForm } from "./lead-form";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Lead {
  id: number;
  companyName: string;
  contactPerson: string;
  email: string;
  phone?: string;
  companyUrl?: string;
  businessDescription?: string;
  status: string;
  introducedAt: string;
  needs: string;
  connectedContact?: string;
}

export function LeadList() {
  const [searchTerm, setSearchTerm] = useState("");
  const [connectedContactFilter, setConnectedContactFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [supporterFilter, setSupporterFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingLead, setEditingLead] = useState<number | undefined>();
  const { toast } = useToast();

  const { data: leads, isLoading, error } = useQuery({
    queryKey: ["/api/leads"],
  });

  const { data: supporters } = useQuery({
    queryKey: ["/api/supporters"],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ leadId, status }: { leadId: number; status: string }) => {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("growth_park_token")}`,
        },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error("Failed to update status");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({
        title: "ステータス更新",
        description: "商談のステータスが更新されました",
      });
    },
    onError: () => {
      toast({
        title: "エラー",
        description: "ステータスの更新に失敗しました",
        variant: "destructive",
      });
    },
  });

  const deleteLeadMutation = useMutation({
    mutationFn: async (leadId: number) => {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("growth_park_token")}`,
        },
      });
      if (!response.ok) throw new Error("Failed to delete lead");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({
        title: "削除完了",
        description: "商談が削除されました",
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

  const getStatusBadge = (status: string) => {
    const statusMap = {
      "進行中": { variant: "default" as const, label: "進行中" },
      "商談実施済み": { variant: "default" as const, label: "商談実施済み" },
      "失注": { variant: "destructive" as const, label: "失注" },
    };

    const config = statusMap[status as keyof typeof statusMap] || { variant: "secondary" as const, label: status };
    
    return (
      <Badge variant={config.variant}>
        {config.label}
      </Badge>
    );
  };

  const handleStatusChange = (leadId: number, newStatus: string) => {
    updateStatusMutation.mutate({ leadId, status: newStatus });
  };

  const handleDeleteLead = (leadId: number) => {
    if (confirm("この商談を削除してもよろしいですか？")) {
      deleteLeadMutation.mutate(leadId);
    }
  };

  const filteredLeads = (leads as Lead[] || []).filter((lead: Lead) => {
    const matchesSearch = 
      lead.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.contactPerson.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.phone && lead.phone.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (lead.companyUrl && lead.companyUrl.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (lead.businessDescription && lead.businessDescription.toLowerCase().includes(searchTerm.toLowerCase())) ||
      lead.needs.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.connectedContact && lead.connectedContact.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = !statusFilter || statusFilter === "all" || lead.status === statusFilter;
    const matchesSupporter = !supporterFilter || supporterFilter === "all";
    
    const matchesConnectedContact = !connectedContactFilter || 
      (lead.connectedContact && lead.connectedContact.toLowerCase().includes(connectedContactFilter.toLowerCase()));
    
    return matchesSearch && matchesStatus && matchesSupporter && matchesConnectedContact;
  }) || [];

  const handleEditLead = (leadId: number) => {
    setEditingLead(leadId);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingLead(undefined);
  };

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-destructive">
            リードの取得に失敗しました
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
            <Dialog open={showForm} onOpenChange={setShowForm}>
              <DialogTrigger asChild>
                <Button onClick={() => setEditingLead(undefined)}>
                  <Plus className="h-4 w-4 mr-2" />
                  新規商談登録
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <LeadForm
                  leadId={editingLead}
                  onSuccess={handleFormSuccess}
                />
              </DialogContent>
            </Dialog>
          </div>
          
          {/* Filters */}
          <div className="flex gap-4 mt-4">
            <div className="flex items-center space-x-2 flex-1">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="全ての項目から検索"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-xs"
              />
            </div>
            
            <Select value={supporterFilter} onValueChange={setSupporterFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="支援先を選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべての支援先</SelectItem>
                {(supporters as any[] || []).map((supporter: any) => (
                  <SelectItem key={supporter.id} value={supporter.id.toString()}>
                    {supporter.companyName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="ステータスを選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべてのステータス</SelectItem>
                <SelectItem value="進行中">進行中</SelectItem>
                <SelectItem value="商談実施済み">商談実施済み</SelectItem>
                <SelectItem value="失注">失注</SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="text"
              placeholder="繋いだ担当者で検索"
              value={connectedContactFilter}
              onChange={(e) => setConnectedContactFilter(e.target.value)}
              className="w-[200px]"
            />
          </div>
        </CardHeader>
        <CardContent>
          {/* Table */}
          {isLoading ? (
            <div className="text-center py-8">読み込み中...</div>
          ) : filteredLeads.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm || statusFilter ? "条件に一致する商談が見つかりません" : "商談がありません"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>企業名</TableHead>
                    <TableHead>担当者</TableHead>
                    <TableHead>メール</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead>紹介日</TableHead>
                    <TableHead>繋いだ担当者</TableHead>
                    <TableHead>アクション</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.map((lead: Lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className="font-medium">
                        {lead.companyName}
                      </TableCell>
                      <TableCell>{lead.contactPerson}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {lead.email}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={lead.status}
                          onValueChange={(value) => handleStatusChange(lead.id, value)}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="進行中">進行中</SelectItem>
                            <SelectItem value="商談実施済み">商談実施済み</SelectItem>
                            <SelectItem value="失注">失注</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {new Date(lead.introducedAt).toLocaleDateString('ja-JP')}
                      </TableCell>
                      <TableCell>{lead.connectedContact || "未設定"}</TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditLead(lead.id)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteLead(lead.id)}
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
