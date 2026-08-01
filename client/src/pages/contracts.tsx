import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, File, Edit, Search, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const contractSchema = z.object({
  connectorCompanyId: z.number({ required_error: "コネクター企業を選択してください" }),
  signedDate: z.string().min(1, "締結日を入力してください"),
  representativeName: z.string().min(1, "代表者名を入力してください"),
  commissionRate: z.enum(["一律80%", "一律70%", "3件まで70%で3件から80%", "5件まで70%で6件から80%"]),
  addboxMemberId: z.number({ required_error: "ZETTAICHIメンバーを選択してください" }),
});

type ContractForm = z.infer<typeof contractSchema>;

export default function ContractsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingContract, setEditingContract] = useState<number | undefined>();

  const { data: contracts, isLoading } = useQuery({
    queryKey: ["/api/contracts"],
  });

  const { data: connectorCompanies } = useQuery({
    queryKey: ["/api/connector-companies"],
  });

  // Redirect if not AddBox user
  if (user?.role !== "AddBox") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">アクセス権限がありません</h2>
              <p className="text-muted-foreground">
                契約書管理機能はZETTAICHI管理者のみ利用可能です。
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Mock data for demonstration
  const mockContracts = [
    {
      id: 1,
      connectorCompanyId: 1,
      connectorCompanyName: "株式会社テックソリューション",
      signedDate: "2024-01-15",
      representativeName: "田中 太郎",
      commissionRate: "一律80%",
      addboxMemberId: 1,
      addboxMemberName: "森尾",
      createdAt: "2024-01-15",
    },
    {
      id: 2,
      connectorCompanyId: 2,
      connectorCompanyName: "株式会社マーケティングプロ",
      signedDate: "2024-02-20",
      representativeName: "佐藤 美樹",
      commissionRate: "3件まで70%で3件から80%",
      addboxMemberId: 2,
      addboxMemberName: "宮本",
      createdAt: "2024-02-20",
    },
    {
      id: 3,
      connectorCompanyId: 3,
      connectorCompanyName: "株式会社デジタルイノベーション",
      signedDate: "2024-03-10",
      representativeName: "山田 健一",
      commissionRate: "一律70%",
      addboxMemberId: 3,
      addboxMemberName: "林",
      createdAt: "2024-03-10",
    },
  ];

  const mockAddBoxMembers = [
    { id: 1, name: "森尾", email: "s.morio@addbox.co.jp" },
    { id: 2, name: "宮本", email: "k.miyamoto@addbox.co.jp" },
    { id: 3, name: "林", email: "k.hayashi@addbox.co.jp" },
    { id: 4, name: "福嶋", email: "r.fukushima@addbox.co.jp" },
  ];

  const form = useForm<ContractForm>({
    resolver: zodResolver(contractSchema),
    defaultValues: {
      connectorCompanyId: undefined,
      signedDate: new Date().toISOString().split('T')[0],
      representativeName: "",
      commissionRate: "一律80%",
      addboxMemberId: undefined,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: ContractForm) => {
      const response = await apiRequest("POST", "/api/contracts", {
        ...data,
        signedDate: new Date(data.signedDate),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      setShowForm(false);
      form.reset();
    },
  });

  const onSubmit = (data: ContractForm) => {
    createMutation.mutate(data);
  };

  const getCommissionBadge = (rate: string) => {
    const colorMap = {
      "一律80%": "default",
      "一律70%": "secondary",
      "3件まで70%で3件から80%": "outline",
      "5件まで70%で6件から80%": "outline",
    } as const;

    return (
      <Badge variant={colorMap[rate as keyof typeof colorMap] || "default"}>
        {rate}
      </Badge>
    );
  };

  const filteredContracts = mockContracts.filter((contract) => {
    const matchesSearch = contract.connectorCompanyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         contract.representativeName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      <Header
        title="契約書管理"
        subtitle="コネクター企業との契約情報の管理"
      />

      <div className="px-6 space-y-6">
        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                総契約数
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{mockContracts.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                今月の新規契約
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">2</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                平均手数料率
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">75%</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                アクティブ契約
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{mockContracts.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Contracts Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>契約一覧</CardTitle>
              <Dialog open={showForm} onOpenChange={setShowForm}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    新規契約登録
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>新規契約登録</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="signedDate">締結日 *</Label>
                        <Input
                          id="signedDate"
                          type="date"
                          {...form.register("signedDate")}
                          autoComplete="off"
                        />
                        {form.formState.errors.signedDate && (
                          <p className="text-sm text-destructive">
                            {form.formState.errors.signedDate.message}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="connectorCompanyId">コネクター企業 *</Label>
                        <Select
                          value={form.watch("connectorCompanyId")?.toString()}
                          onValueChange={(value) => form.setValue("connectorCompanyId", parseInt(value))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="企業を選択" />
                          </SelectTrigger>
                          <SelectContent>
                            {connectorCompanies?.map((company: any) => (
                              <SelectItem key={company.id} value={company.id.toString()}>
                                {company.companyName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {form.formState.errors.connectorCompanyId && (
                          <p className="text-sm text-destructive">
                            {form.formState.errors.connectorCompanyId.message}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="representativeName">代表者名 *</Label>
                        <Input
                          id="representativeName"
                          placeholder="田中 太郎"
                          {...form.register("representativeName")}
                        />
                        {form.formState.errors.representativeName && (
                          <p className="text-sm text-destructive">
                            {form.formState.errors.representativeName.message}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="commissionRate">手数料率 *</Label>
                        <Select
                          value={form.watch("commissionRate")}
                          onValueChange={(value) => form.setValue("commissionRate", value as any)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="一律80%">一律80%</SelectItem>
                            <SelectItem value="一律70%">一律70%</SelectItem>
                            <SelectItem value="3件まで70%で3件から80%">3件まで70%で3件から80%</SelectItem>
                            <SelectItem value="5件まで70%で6件から80%">5件まで70%で6件から80%</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="addboxMemberId">担当ZETTAICHIメンバー *</Label>
                      <Select
                        value={form.watch("addboxMemberId")?.toString()}
                        onValueChange={(value) => form.setValue("addboxMemberId", parseInt(value))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="メンバーを選択" />
                        </SelectTrigger>
                        <SelectContent>
                          {mockAddBoxMembers.map((member) => (
                            <SelectItem key={member.id} value={member.id.toString()}>
                              {member.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {form.formState.errors.addboxMemberId && (
                        <p className="text-sm text-destructive">
                          {form.formState.errors.addboxMemberId.message}
                        </p>
                      )}
                    </div>

                    <div className="flex justify-end space-x-4">
                      <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                        キャンセル
                      </Button>
                      <Button type="submit" disabled={createMutation.isPending}>
                        {createMutation.isPending ? "登録中..." : "登録"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {/* Search */}
            <div className="flex items-center space-x-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="企業名または代表者名で検索..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Table */}
            {isLoading ? (
              <div className="text-center py-8">読み込み中...</div>
            ) : filteredContracts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm ? "条件に一致する契約が見つかりません" : "契約がありません"}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>締結日</TableHead>
                      <TableHead>コネクター企業</TableHead>
                      <TableHead>代表者名</TableHead>
                      <TableHead>手数料率</TableHead>
                      <TableHead>担当者</TableHead>
                      <TableHead>アクション</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredContracts.map((contract) => (
                      <TableRow key={contract.id}>
                        <TableCell>
                          {new Date(contract.signedDate).toLocaleDateString('ja-JP')}
                        </TableCell>
                        <TableCell className="font-medium">
                          {contract.connectorCompanyName}
                        </TableCell>
                        <TableCell>{contract.representativeName}</TableCell>
                        <TableCell>
                          {getCommissionBadge(contract.commissionRate)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {contract.addboxMemberName}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Button variant="ghost" size="sm">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <File className="h-4 w-4" />
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
    </div>
  );
}
