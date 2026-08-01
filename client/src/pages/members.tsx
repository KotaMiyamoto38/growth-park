import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Header } from "@/components/layout/header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, User, Building2, Star } from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function MembersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rankFilter, setRankFilter] = useState<string>("all");

  const { data: connectors = [], isLoading } = useQuery({
    queryKey: ["/api/admin/connectors"],
    enabled: user?.role === "AddBox",
    refetchInterval: 30000,
    staleTime: 0,
  });

  const updateRankMutation = useMutation({
    mutationFn: async ({ connectorId, rank }: { connectorId: number; rank: number }) => {
      const response = await fetch(`/api/admin/connectors/${connectorId}/rank`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("growth_park_token")}`
        },
        body: JSON.stringify({ rank }),
      });
      
      if (!response.ok) {
        throw new Error("ランクの更新に失敗しました");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/connectors"] });
      toast({
        title: "ランク更新完了",
        description: "コネクターのランクを更新しました",
      });
    },
    onError: (error) => {
      console.error("Rank update error:", error);
      toast({
        title: "エラー",
        description: "ランクの更新に失敗しました",
        variant: "destructive",
      });
    },
  });

  const renderStars = (rank: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`h-4 w-4 ${
          i < rank ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
        }`}
      />
    ));
  };

  const filteredConnectors = connectors.filter((connector: any) => {
    if (rankFilter === "all") return true;
    const connectorRank = connector.rank || 1;
    return connectorRank.toString() === rankFilter;
  });

  if (user?.role !== "AddBox") {
    return (
      <div className="space-y-6">
        <Header
          title="アクセス制限"
          subtitle="この機能はZETTAICHIユーザーのみ利用可能です"
        />
        <div className="px-6">
          <Alert>
            <AlertDescription>
              コネクター企業管理機能はZETTAICHIユーザーのみアクセス可能です。
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Header
          title="コネクター企業管理"
          subtitle="ZETTAICHIに登録されたコネクター企業の管理"
        />
        <div className="px-6">
          <Card>
            <CardContent className="p-6">
              <div className="text-center">読み込み中...</div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header
        title="コネクター企業管理"
        subtitle="ZETTAICHIに登録されたコネクター企業の管理"
      />

      <div className="px-6 space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                登録企業数
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(connectors as any[]).length}社</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                5つ星企業
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {(connectors as any[]).filter((c: any) => (c.rank || 1) === 5).length}社
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                平均ランク
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {(connectors as any[]).length > 0 
                  ? ((connectors as any[]).reduce((sum: number, c: any) => sum + (c.rank || 1), 0) / (connectors as any[]).length).toFixed(1)
                  : "0"
                } ★
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Connectors List */}
        <Card>
          <CardHeader>
            <CardTitle>コネクター企業一覧</CardTitle>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">ランクフィルター:</span>
                <Select value={rankFilter} onValueChange={setRankFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="ランクを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全て表示</SelectItem>
                    <SelectItem value="5">★★★★★</SelectItem>
                    <SelectItem value="4">★★★★☆</SelectItem>
                    <SelectItem value="3">★★★☆☆</SelectItem>
                    <SelectItem value="2">★★☆☆☆</SelectItem>
                    <SelectItem value="1">★☆☆☆☆</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredConnectors.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                条件に一致するコネクター企業はありません
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>お名前</TableHead>
                    <TableHead>メールアドレス</TableHead>
                    <TableHead>企業名</TableHead>
                    <TableHead>ランク</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredConnectors.map((connector: any) => (
                    <TableRow key={connector.id}>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{connector.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{connector.email}</TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span>{connector.companyName || "未設定"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            {renderStars(connector.rank || 1)}
                          </div>
                          <Select
                            value={(connector.rank || 1).toString()}
                            onValueChange={(value) => {
                              updateRankMutation.mutate({
                                connectorId: connector.id,
                                rank: parseInt(value),
                              });
                            }}
                          >
                            <SelectTrigger className="w-20">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">1</SelectItem>
                              <SelectItem value="2">2</SelectItem>
                              <SelectItem value="3">3</SelectItem>
                              <SelectItem value="4">4</SelectItem>
                              <SelectItem value="5">5</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Link href={`/admin/connectors/${connector.id}`}>
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
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