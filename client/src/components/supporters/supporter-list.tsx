import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Edit, Trash2, ExternalLink, FileDown, Download, FileText, Eye } from "lucide-react";
import { SupporterForm } from "./supporter-form";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

interface Supporter {
  id: number;
  companyName: string;
  companyUrl?: string;
  logoUrl?: string;
  serviceName: string;
  serviceUrl?: string;
  servicePrice?: string;
  serviceOverview: string;
  status: string;
  targetCompanySize?: string;
  targetAttributes?: string;
  targetOthers?: string;
  addboxFee?: number;
  connectorFee?: number;
  attachmentPath?: string;
  attachmentName?: string;
}

export function SupporterList() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingSupporter, setEditingSupporter] = useState<number | undefined>();
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedSupporter, setSelectedSupporter] = useState<Supporter | null>(null);

  const { data: supporters, isLoading, error } = useQuery({
    queryKey: ["/api/supporters"],
  });

  const { data: leads } = useQuery({
    queryKey: ["/api/leads"],
  });

  const getStatusBadge = (status: string) => {
    const statusMap = {
      "アクティブ": { variant: "default" as const, label: "アクティブ" },
      "ストップ": { variant: "destructive" as const, label: "ストップ" },
    };

    const config = statusMap[status as keyof typeof statusMap] || { variant: "secondary" as const, label: status };
    
    return (
      <Badge variant={config.variant}>
        {config.label}
      </Badge>
    );
  };

  const filteredSupporters = ((supporters as Supporter[]) || []).filter((supporter: Supporter) => {
    const matchesSearch = supporter.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         supporter.serviceName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const handleEditSupporter = (supporterId: number) => {
    setEditingSupporter(supporterId);
    setShowEditForm(true);
  };

  const handleDeleteSupporter = async (supporterId: number, companyName: string) => {
    if (confirm(`「${companyName}」を削除してもよろしいですか？`)) {
      try {
        await apiRequest("DELETE", `/api/supporters/${supporterId}`);
        queryClient.invalidateQueries({ queryKey: ["/api/supporters"] });
      } catch (error) {
        console.error("削除に失敗しました:", error);
      }
    }
  };

  const handleShowDetails = (supporter: Supporter) => {
    setSelectedSupporter(supporter);
    setShowDetailDialog(true);
  };

  const statusUpdateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      // Only update status, preserve all other fields
      return await apiRequest("PUT", `/api/supporters/${id}`, { 
        status,
        // Don't send addboxFee or connectorFee to prevent them from being cleared
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supporters"] });
    },
  });

  const handleStatusChange = (supporterId: number, newStatus: string) => {
    statusUpdateMutation.mutate({ id: supporterId, status: newStatus });
  };

  const handleFormSuccess = () => {
    setShowNewForm(false);
    setShowEditForm(false);
    setEditingSupporter(undefined);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-destructive">
            支援先の取得に失敗しました
          </div>
        </CardContent>
      </Card>
    );
  }

  const isAddBoxUser = user?.role === "AddBox";

  // Calculate supporter statistics
  const supporterStats = ((supporters as Supporter[]) || []).map(supporter => {
    const supporterLeads = ((leads as any[]) || []).filter((lead: any) => lead.supporterId === supporter.id);
    const totalLeads = supporterLeads.length;
    const completedLeads = supporterLeads.filter((lead: any) => lead.status === "商談実施済み").length;
    const inProgressLeads = supporterLeads.filter((lead: any) => lead.status === "進行中").length;
    const totalRevenue = supporterLeads
      .filter((lead: any) => lead.status === "商談実施済み")
      .reduce((sum: number, lead: any) => sum + (lead.meetingFee || 0), 0);
    
    return {
      ...supporter,
      totalLeads,
      completedLeads,
      inProgressLeads,
      totalRevenue
    };
  });

  // Calculate service-specific deal counts
  const serviceStats = supporterStats.reduce((acc: any, supporter: any) => {
    if (supporter.totalLeads > 0) {
      acc[supporter.serviceName] = (acc[supporter.serviceName] || 0) + supporter.totalLeads;
    }
    return acc;
  }, {});

  const totalSupporters = supporterStats.length;
  const activeSupporters = supporterStats.filter(s => s.status === "アクティブ").length;
  const totalAllLeads = supporterStats.reduce((sum, s) => sum + s.totalLeads, 0);
  const totalAllRevenue = supporterStats.reduce((sum, s) => sum + s.totalRevenue, 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(serviceStats).slice(0, 4).map(([serviceName, count], index) => {
          const colors = [
            "from-blue-600 to-blue-700",
            "from-green-600 to-green-700", 
            "from-purple-600 to-purple-700",
            "from-orange-600 to-orange-700"
          ];
          const textColors = [
            "text-blue-100",
            "text-green-100",
            "text-purple-100", 
            "text-orange-100"
          ];
          
          return (
            <Card key={serviceName} className={`bg-gradient-to-r ${colors[index]} text-white`}>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{count as number}件</div>
                <p className={`${textColors[index]} text-sm truncate`}>{serviceName}</p>
              </CardContent>
            </Card>
          );
        })}
        
        {/* Fill remaining slots if less than 4 services */}
        {Object.keys(serviceStats).length < 4 && Array.from({ length: 4 - Object.keys(serviceStats).length }).map((_, index) => {
          const actualIndex = Object.keys(serviceStats).length + index;
          const colors = [
            "from-blue-600 to-blue-700",
            "from-green-600 to-green-700", 
            "from-purple-600 to-purple-700",
            "from-orange-600 to-orange-700"
          ];
          const textColors = [
            "text-blue-100",
            "text-green-100",
            "text-purple-100", 
            "text-orange-100"
          ];
          
          return (
            <Card key={`empty-${index}`} className={`bg-gradient-to-r ${colors[actualIndex]} text-white opacity-50`}>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">0件</div>
                <p className={`${textColors[actualIndex]} text-sm`}>サービスなし</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>支援先情報</CardTitle>
            {isAddBoxUser && (
              <>
                <Dialog open={showNewForm} onOpenChange={setShowNewForm}>
                  <DialogTrigger asChild>
                    <Button onClick={() => setShowNewForm(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      新規支援先登録
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <SupporterForm
                      supporterId={undefined}
                      onSuccess={handleFormSuccess}
                    />
                  </DialogContent>
                </Dialog>

                <Dialog open={showEditForm} onOpenChange={setShowEditForm}>
                  <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <SupporterForm
                      supporterId={editingSupporter}
                      onSuccess={handleFormSuccess}
                    />
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="企業名またはサービス名で検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                autoComplete="off"
              />
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="text-center py-8">読み込み中...</div>
          ) : filteredSupporters.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? "条件に一致する支援先が見つかりません" : "支援先がありません"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="supporter-table">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="min-w-[60px] w-[60px]">ロゴ</TableHead>
                    <TableHead className="min-w-[150px] max-w-[180px]">企業名</TableHead>
                    <TableHead className="min-w-[150px] max-w-[180px]">サービス名</TableHead>
                    <TableHead className="min-w-[200px] max-w-[300px]">サービス概要</TableHead>
                    <TableHead className="min-w-[100px] w-[100px]">導入単価</TableHead>
                    {isAddBoxUser && <TableHead className="min-w-[110px] w-[110px]">ZETTAICHI商談フィー</TableHead>}
                    {isAddBoxUser && <TableHead className="min-w-[120px] w-[120px]">コネクター商談フィー</TableHead>}
                    {!isAddBoxUser && <TableHead className="min-w-[100px] w-[100px]">商談フィー</TableHead>}
                    <TableHead className="min-w-[80px] w-[80px]">ステータス</TableHead>
                    <TableHead className="min-w-[80px] w-[80px]">累積商談数</TableHead>
                    <TableHead className="min-w-[80px] w-[80px]">資料DL</TableHead>
                    <TableHead className="min-w-[150px] max-w-[200px]">ターゲット企業</TableHead>
                    {!isAddBoxUser && <TableHead className="min-w-[80px] w-[80px]">詳細</TableHead>}
                    {isAddBoxUser && <TableHead className="min-w-[100px] w-[100px]">アクション</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSupporters.map((supporter: Supporter) => (
                    <TableRow key={supporter.id} className="hover:bg-muted/30 border-b">
                      <TableCell className="w-16">
                        {supporter.logoUrl ? (
                          <div className="flex items-center justify-center">
                            <img
                              src={supporter.logoUrl.startsWith('/uploads/') ? supporter.logoUrl : `/uploads/${supporter.logoUrl}`}
                              alt={`${supporter.companyName} ロゴ`}
                              className="w-8 h-8 object-contain rounded border"
                              onError={(e) => {
                                console.log('Image load error:', supporter.logoUrl);
                                const imgElement = e.currentTarget as HTMLImageElement;
                                imgElement.style.display = 'none';
                                const parentDiv = imgElement.parentElement;
                                if (parentDiv) {
                                  parentDiv.innerHTML = '<div class="text-gray-400 text-xs">画像なし</div>';
                                }
                              }}
                              onLoad={() => {
                                console.log('Image loaded successfully:', supporter.logoUrl);
                              }}
                            />
                          </div>
                        ) : (
                          <div className="text-gray-400 text-center text-xs">-</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col space-y-1 company-info">
                          <span className="font-medium">{supporter.companyName}</span>
                          {supporter.companyUrl && (
                            <a
                              href={supporter.companyUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline flex items-center"
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              企業HP
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col space-y-1">
                          <span className="font-medium">{supporter.serviceName}</span>
                          {supporter.serviceUrl && (
                            <a
                              href={supporter.serviceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline flex items-center"
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              サービス詳細
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-md">
                        <div className="text-sm leading-tight service-overview">
                          {supporter.serviceOverview || "未設定"}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {supporter.servicePrice || "要相談"}
                      </TableCell>
                      {isAddBoxUser && (
                        <TableCell>
                          <span className="font-medium text-green-600">
                            {supporter.addboxFee ? `¥${supporter.addboxFee.toLocaleString()}` : "未設定"}
                          </span>
                        </TableCell>
                      )}
                      {isAddBoxUser && (
                        <TableCell>
                          <span className="font-medium text-blue-600">
                            {supporter.connectorFee ? `¥${supporter.connectorFee.toLocaleString()}` : "未設定"}
                          </span>
                        </TableCell>
                      )}
                      {!isAddBoxUser && (
                        <TableCell>
                          <span className="font-medium text-blue-600">
                            {supporter.connectorFee ? `¥${supporter.connectorFee.toLocaleString()}` : "未設定"}
                          </span>
                        </TableCell>
                      )}
                      <TableCell>
                        {isAddBoxUser ? (
                          <Select
                            value={supporter.status}
                            onValueChange={(value) => handleStatusChange(supporter.id, value)}
                            disabled={statusUpdateMutation.isPending}
                          >
                            <SelectTrigger className="w-28 text-xs h-8 min-w-[112px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="アクティブ">アクティブ</SelectItem>
                              <SelectItem value="ストップ">ストップ</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="w-28 min-w-[112px] whitespace-nowrap">
                            {getStatusBadge(supporter.status)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          const supporterStat = supporterStats.find(s => s.id === supporter.id);
                          return (
                            <div className="space-y-1">
                              <div className="text-lg font-bold text-blue-600">
                                {supporterStat?.totalLeads || 0}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                実施: {supporterStat?.completedLeads || 0} | 進行: {supporterStat?.inProgressLeads || 0}
                              </div>
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        {supporter.attachmentPath ? (
                          <div className="flex justify-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const filename = supporter.attachmentPath!.replace('/uploads/', '');
                                const downloadUrl = `/api/files/uploads/${encodeURIComponent(filename)}`;
                                
                                console.log('Downloading file:', filename);
                                console.log('Download URL:', downloadUrl);
                                
                                const link = document.createElement('a');
                                link.href = downloadUrl;
                                link.download = supporter.attachmentName || filename;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                              }}
                              className="p-2"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-gray-500 text-sm">なし</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="text-sm space-y-1 target-company">
                          {supporter.targetCompanySize && (
                            <div className="bg-blue-50 px-2 py-0.5 rounded text-blue-800 text-xs">
                              <span className="font-medium">規模:</span> {supporter.targetCompanySize}
                            </div>
                          )}
                          {supporter.targetAttributes && (
                            <div className="bg-green-50 px-2 py-0.5 rounded text-green-800 text-xs">
                              <span className="font-medium">属性:</span> {supporter.targetAttributes}
                            </div>
                          )}
                          {supporter.targetOthers && (
                            <div className="bg-purple-50 px-2 py-0.5 rounded text-purple-800 text-xs">
                              <span className="font-medium">その他:</span> {supporter.targetOthers}
                            </div>
                          )}
                          {!supporter.targetCompanySize && !supporter.targetAttributes && !supporter.targetOthers && (
                            <div className="text-muted-foreground italic text-xs">未設定</div>
                          )}
                        </div>
                      </TableCell>
                      {!isAddBoxUser && (
                        <TableCell>
                          <div className="flex justify-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleShowDetails(supporter)}
                              className="p-2"
                              title="詳細表示"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                      {isAddBoxUser && (
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                // Invalidate cache to ensure fresh data
                                queryClient.invalidateQueries({ queryKey: [`/api/supporters/${supporter.id}`] });
                                queryClient.invalidateQueries({ queryKey: ["/api/supporters"] });
                                handleEditSupporter(supporter.id);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDeleteSupporter(supporter.id, supporter.companyName)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
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

      {/* 支援先詳細ダイアログ */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          {selectedSupporter && (
            <div className="space-y-6">
              <div className="border-b pb-4">
                <h2 className="text-2xl font-bold text-gray-900">支援先詳細情報</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 基本情報 */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-800 border-b pb-2">基本情報</h3>
                  
                  <div className="space-y-3">
                    {selectedSupporter.logoUrl && (
                      <div>
                        <label className="text-sm font-medium text-gray-600">ロゴ</label>
                        <div className="mt-1">
                          <img
                            src={selectedSupporter.logoUrl.startsWith('/uploads/') ? selectedSupporter.logoUrl : `/uploads/${selectedSupporter.logoUrl}`}
                            alt={`${selectedSupporter.companyName} ロゴ`}
                            className="w-20 h-20 object-contain border rounded"
                          />
                        </div>
                      </div>
                    )}
                    
                    <div>
                      <label className="text-sm font-medium text-gray-600">企業名</label>
                      <p className="mt-1 text-gray-900">{selectedSupporter.companyName}</p>
                    </div>

                    {selectedSupporter.companyUrl && (
                      <div>
                        <label className="text-sm font-medium text-gray-600">企業URL</label>
                        <div className="mt-1">
                          <a
                            href={selectedSupporter.companyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline flex items-center"
                          >
                            <ExternalLink className="h-4 w-4 mr-1" />
                            {selectedSupporter.companyUrl}
                          </a>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="text-sm font-medium text-gray-600">ステータス</label>
                      <div className="mt-1">
                        {getStatusBadge(selectedSupporter.status)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* サービス情報 */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-800 border-b pb-2">サービス情報</h3>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-gray-600">サービス名</label>
                      <p className="mt-1 text-gray-900">{selectedSupporter.serviceName}</p>
                    </div>

                    {selectedSupporter.serviceUrl && (
                      <div>
                        <label className="text-sm font-medium text-gray-600">サービスURL</label>
                        <div className="mt-1">
                          <a
                            href={selectedSupporter.serviceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline flex items-center"
                          >
                            <ExternalLink className="h-4 w-4 mr-1" />
                            {selectedSupporter.serviceUrl}
                          </a>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="text-sm font-medium text-gray-600">サービス概要</label>
                      <p className="mt-1 text-gray-900 leading-relaxed">{selectedSupporter.serviceOverview}</p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-600">導入単価</label>
                      <p className="mt-1 text-gray-900">{selectedSupporter.servicePrice || "要相談"}</p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-600">商談フィー</label>
                      <p className="mt-1 text-blue-600 font-semibold">
                        {selectedSupporter.connectorFee ? `¥${selectedSupporter.connectorFee.toLocaleString()}` : "未設定"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ターゲット企業情報 */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-800 border-b pb-2">ターゲット企業</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">規模</label>
                    <div className="mt-1">
                      {selectedSupporter.targetCompanySize ? (
                        <div className="bg-blue-50 px-3 py-2 rounded text-blue-800">
                          {selectedSupporter.targetCompanySize}
                        </div>
                      ) : (
                        <p className="text-gray-500 italic">未設定</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-600">属性</label>
                    <div className="mt-1">
                      {selectedSupporter.targetAttributes ? (
                        <div className="bg-green-50 px-3 py-2 rounded text-green-800">
                          {selectedSupporter.targetAttributes}
                        </div>
                      ) : (
                        <p className="text-gray-500 italic">未設定</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-600">その他</label>
                    <div className="mt-1">
                      {selectedSupporter.targetOthers ? (
                        <div className="bg-purple-50 px-3 py-2 rounded text-purple-800">
                          {selectedSupporter.targetOthers}
                        </div>
                      ) : (
                        <p className="text-gray-500 italic">未設定</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 資料ダウンロード */}
              {selectedSupporter.attachmentPath && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-800 border-b pb-2">資料</h3>
                  
                  <div className="flex items-center space-x-3">
                    <Button
                      variant="outline"
                      onClick={() => {
                        const filename = selectedSupporter.attachmentPath!.replace('/uploads/', '');
                        const downloadUrl = `/api/files/uploads/${encodeURIComponent(filename)}`;
                        
                        const link = document.createElement('a');
                        link.href = downloadUrl;
                        link.download = selectedSupporter.attachmentName || filename;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                      className="flex items-center space-x-2"
                    >
                      <Download className="h-4 w-4" />
                      <span>{selectedSupporter.attachmentName || '資料をダウンロード'}</span>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
