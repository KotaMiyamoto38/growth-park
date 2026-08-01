import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileUpload } from "@/components/ui/file-upload";
import { Loader2 } from "lucide-react";

const supporterSchema = z.object({
  companyName: z.string().min(1, "企業名を入力してください"),
  companyUrl: z.string().url("有効なURLを入力してください").optional().or(z.literal("")),
  logoUrl: z.string().optional(),
  serviceName: z.string().min(1, "サービス名を入力してください"),
  serviceUrl: z.string().url("有効なURLを入力してください").optional().or(z.literal("")),
  servicePrice: z.string().optional(),
  serviceOverview: z.string().min(1, "サービス概要を入力してください"),
  status: z.enum(["アクティブ", "ストップ"]).default("アクティブ"),
  targetCompanySize: z.string().optional(),
  targetAttributes: z.string().optional(),
  targetOthers: z.string().optional(),
  addboxFee: z.string().optional(),
});

type SupporterForm = z.infer<typeof supporterSchema>;

interface SupporterFormProps {
  onSuccess?: () => void;
  supporterId?: number;
}

export function SupporterFormWithAttachment({ onSuccess, supporterId }: SupporterFormProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { data: supporterData, isLoading: isLoadingSupporter } = useQuery({
    queryKey: ["/api/supporters", supporterId],
    queryFn: async () => {
      if (!supporterId) return null;
      const response = await apiRequest("GET", `/api/supporters/${supporterId}`);
      return response.json();
    },
    enabled: !!supporterId,
  });

  const form = useForm<SupporterForm>({
    resolver: zodResolver(supporterSchema),
    defaultValues: {
      companyName: "",
      companyUrl: "",
      logoUrl: "",
      serviceName: "",
      serviceUrl: "",
      servicePrice: "",
      serviceOverview: "",
      status: "アクティブ",
      targetCompanySize: "",
      targetAttributes: "",
      targetOthers: "",
      addboxFee: "",
    },
  });

  useEffect(() => {
    if (supporterData && supporterId) {
      form.reset({
        companyName: supporterData.companyName || "",
        companyUrl: supporterData.companyUrl || "",
        logoUrl: supporterData.logoUrl || "",
        serviceName: supporterData.serviceName || "",
        serviceUrl: supporterData.serviceUrl || "",
        servicePrice: supporterData.servicePrice || "",
        serviceOverview: supporterData.serviceOverview || "",
        status: supporterData.status || "アクティブ",
        targetCompanySize: supporterData.targetCompanySize || "",
        targetAttributes: supporterData.targetAttributes || "",
        targetOthers: supporterData.targetOthers || "",
        addboxFee: supporterData.addboxFee || "",
      });
      setSelectedFile(null);
    }
  }, [supporterData, supporterId, form]);

  const createMutation = useMutation({
    mutationFn: async (data: SupporterForm) => {
      const formData = new FormData();
      
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, value.toString());
        }
      });

      if (selectedFile) {
        formData.append('attachment', selectedFile);
      }

      const response = await fetch("/api/supporters", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to create supporter");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supporters"] });
      onSuccess?.();
    },
    onError: (error: any) => {
      setError(error.message || "支援先の作成に失敗しました");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: SupporterForm) => {
      const formData = new FormData();
      
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, value.toString());
        }
      });

      if (selectedFile) {
        formData.append('attachment', selectedFile);
      }

      const response = await fetch(`/api/supporters/${supporterId}`, {
        method: "PUT",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to update supporter");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supporters"] });
      onSuccess?.();
    },
    onError: (error: any) => {
      setError(error.message || "支援先の更新に失敗しました");
    },
  });

  const onSubmit = async (data: SupporterForm) => {
    setError("");
    
    if (supporterId) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending || isLoadingSupporter;

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>
          {supporterId ? "支援先編集" : "新規支援先登録"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">企業名 <span className="text-red-500">*</span></Label>
              <Input
                id="companyName"
                placeholder="株式会社〇〇"
                {...form.register("companyName")}
              />
              {form.formState.errors.companyName && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.companyName.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="companyUrl">企業HP（任意）</Label>
              <Input
                id="companyUrl"
                type="url"
                placeholder="https://example.com"
                {...form.register("companyUrl")}
              />
              {form.formState.errors.companyUrl && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.companyUrl.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="serviceName">サービス名 <span className="text-red-500">*</span></Label>
              <Input
                id="serviceName"
                placeholder="マーケティング支援サービス"
                {...form.register("serviceName")}
              />
              {form.formState.errors.serviceName && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.serviceName.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="servicePrice">導入単価</Label>
              <Input
                id="servicePrice"
                placeholder="30万円〜"
                {...form.register("servicePrice")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="serviceOverview">サービス概要 <span className="text-red-500">*</span></Label>
            <Textarea
              id="serviceOverview"
              placeholder="サービスの概要を詳しく説明してください"
              rows={4}
              {...form.register("serviceOverview")}
            />
            {form.formState.errors.serviceOverview && (
              <p className="text-sm text-destructive">
                {form.formState.errors.serviceOverview.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>資料添付</Label>
            <FileUpload
              onFileSelect={setSelectedFile}
              currentFile={supporterData?.attachmentName}
              maxSize={50}
            />
          </div>

          <div className="space-y-4">
            <Label className="text-base font-semibold">推定リードターゲット</Label>
            
            <div className="space-y-2">
              <Label htmlFor="targetCompanySize">企業規模</Label>
              <Input
                id="targetCompanySize"
                placeholder="中小企業、年商1億円以上など"
                {...form.register("targetCompanySize")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="targetAttributes">属性</Label>
              <Input
                id="targetAttributes"
                placeholder="IT業界、製造業、サービス業など"
                {...form.register("targetAttributes")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="targetOthers">その他</Label>
              <Input
                id="targetOthers"
                placeholder="その他の条件があれば入力してください"
                {...form.register("targetOthers")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="addboxFee">商談フィー（ZETTAICHI渡し）</Label>
            <Input
              id="addboxFee"
              placeholder="40000"
              {...form.register("addboxFee")}
            />
            <p className="text-sm text-muted-foreground">
              コネクター画面では表示されません。コネクターへの報酬は登録されたコネクター情報の手数料に基づき自動算出されます。
            </p>
          </div>

          <div className="flex justify-end space-x-4">
            <Button type="button" variant="outline" onClick={() => onSuccess?.()}>
              キャンセル
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {supporterId ? "更新" : "登録"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}