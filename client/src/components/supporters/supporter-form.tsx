import { useState, useEffect, useCallback } from "react";
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
import { Loader2, Upload, X } from "lucide-react";

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
  connectorFee: z.string().optional(),
});

type SupporterForm = z.infer<typeof supporterSchema>;

interface SupporterFormProps {
  onSuccess?: () => void;
  supporterId?: number;
}

export function SupporterForm({ onSuccess, supporterId }: SupporterFormProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState(false);

  const { data: supporterData, isLoading: isLoadingSupporter } = useQuery({
    queryKey: [`/api/supporters/${supporterId}`],
    queryFn: async () => {
      if (!supporterId) return null;
      const response = await apiRequest("GET", `/api/supporters/${supporterId}`);
      return response.json();
    },
    enabled: !!supporterId,
    staleTime: 0, // Always fetch fresh data
    gcTime: 0, // Don't cache the data (TanStack Query v5)
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
      connectorFee: "",
    },
  });

  useEffect(() => {
    if (supporterData && supporterId) {
      // Set form values using setValue for each field to ensure proper binding
      form.setValue("companyName", supporterData.companyName || "");
      form.setValue("companyUrl", supporterData.companyUrl || "");
      form.setValue("logoUrl", supporterData.logoUrl || "");
      form.setValue("serviceName", supporterData.serviceName || "");
      form.setValue("serviceUrl", supporterData.serviceUrl || "");
      form.setValue("servicePrice", supporterData.servicePrice || "");
      form.setValue("serviceOverview", supporterData.serviceOverview || "");
      form.setValue("status", supporterData.status || "アクティブ");
      form.setValue("targetCompanySize", supporterData.targetCompanySize || "");
      form.setValue("targetAttributes", supporterData.targetAttributes || "");
      form.setValue("targetOthers", supporterData.targetOthers || "");
      form.setValue("addboxFee", supporterData.addboxFee || "");
      
      // Set logo preview if exists
      if (supporterData.logoUrl) {
        setLogoPreview(supporterData.logoUrl);
      }
    } else if (!supporterId) {
      // Reset form for new supporter
      form.reset({
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
      });
      setLogoPreview("");
      setLogoFile(null);
    }
  }, [supporterData, supporterId, form]);

  const handleFileSelect = useCallback((file: File) => {
    if (file && file.type.startsWith('image/')) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setLogoPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const removeLogo = useCallback(() => {
    setLogoFile(null);
    setLogoPreview("");
    form.setValue("logoUrl", "");
  }, [form]);

  const createMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      try {
        const token = localStorage.getItem('growth_park_token');
        
        // Log FormData contents for debugging
        console.log('FormData contents:');
        formData.forEach((value, key) => {
          console.log(key, value);
        });
        
        const response = await fetch("/api/supporters", {
          method: "POST",
          headers: {
            'Authorization': `Bearer ${token}`
            // Note: Don't set Content-Type for FormData, let browser set it
          },
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: "Network error" }));
          throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        }

        return response.json();
      } catch (error) {
        console.error('Create supporter fetch error:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supporters"] });
      onSuccess?.();
    },
    onError: (error: any) => {
      console.error('Create supporter mutation error:', error);
      setError(error.message || "支援先の作成に失敗しました");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      try {
        const token = localStorage.getItem('growth_park_token');
        
        // Log FormData contents for debugging
        console.log('Update FormData contents:');
        formData.forEach((value, key) => {
          console.log(key, value);
        });
        
        const response = await fetch(`/api/supporters/${supporterId}`, {
          method: "PUT", // Changed from PATCH to PUT to match server route
          headers: {
            'Authorization': `Bearer ${token}`
            // Note: Don't set Content-Type for FormData, let browser set it
          },
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: "Network error" }));
          throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        }

        return response.json();
      } catch (error) {
        console.error('Update supporter fetch error:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supporters"] });
      onSuccess?.();
    },
    onError: (error: any) => {
      console.error('Update supporter mutation error:', error);
      setError(error.message || "支援先の更新に失敗しました");
    },
  });

  const onSubmit = async (data: SupporterForm) => {
    setError("");
    
    const formData = new FormData();
    
    // Add all form fields to FormData
    Object.keys(data).forEach(key => {
      const value = data[key as keyof SupporterForm];
      if (value !== undefined && value !== null) {
        formData.append(key, value);
      }
    });
    
    // Add files to FormData with correct field names
    if (logoFile) {
      formData.append("logo", logoFile);
    }
    
    if (selectedFile) {
      formData.append("attachment", selectedFile);
    }
    
    if (supporterId) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Card className="w-full max-w-2xl mx-auto">
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
              <Label htmlFor="companyName">企業名 *</Label>
              <Input
                id="companyName"
                placeholder="株式会社〇〇"
                {...form.register("companyName")}
                autoComplete="off"
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
                autoComplete="off"
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
              <Label htmlFor="serviceName">サービス名 *</Label>
              <Input
                id="serviceName"
                placeholder="マーケティング支援サービス"
                {...form.register("serviceName")}
                autoComplete="off"
              />
              {form.formState.errors.serviceName && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.serviceName.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="serviceUrl">サービスURL</Label>
              <Input
                id="serviceUrl"
                type="url"
                placeholder="https://example.com/service"
                {...form.register("serviceUrl")}
                autoComplete="off"
              />
              {form.formState.errors.serviceUrl && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.serviceUrl.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="servicePrice">サービス導入単価</Label>
              <Input
                id="servicePrice"
                placeholder="月額10万円〜"
                {...form.register("servicePrice")}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">ステータス</Label>
              <Select
                value={form.watch("status")}
                onValueChange={(value) => form.setValue("status", value as "アクティブ" | "ストップ")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="アクティブ">アクティブ</SelectItem>
                  <SelectItem value="ストップ">ストップ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="serviceOverview">
              サービス概要 <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="serviceOverview"
              placeholder="サービスの詳細な説明を入力してください"
              rows={3}
              {...form.register("serviceOverview")}
              autoComplete="off"
            />
            {form.formState.errors.serviceOverview && (
              <p className="text-sm text-destructive">
                {form.formState.errors.serviceOverview.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>企業ロゴ</Label>
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  isDragOver
                    ? "border-primary bg-primary/5"
                    : "border-gray-300 hover:border-gray-400"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById("logo-upload")?.click()}
              >
                {logoPreview ? (
                  <div className="space-y-2">
                    <img
                      src={logoPreview}
                      alt="ロゴプレビュー"
                      className="w-24 h-24 object-contain mx-auto rounded border"
                    />
                    <div className="flex justify-center space-x-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          document.getElementById("logo-upload")?.click();
                        }}
                      >
                        <Upload className="h-4 w-4 mr-1" />
                        変更
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeLogo();
                        }}
                      >
                        <X className="h-4 w-4 mr-1" />
                        削除
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-12 h-12 mx-auto text-gray-400" />
                    <div>
                      <p className="text-sm font-medium">ロゴをドラッグ&ドロップ</p>
                      <p className="text-xs text-muted-foreground">
                        またはクリックしてファイルを選択
                      </p>
                      <p className="text-xs text-muted-foreground">
                        PNG、JPG形式 (最大5MB)
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <input
                id="logo-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileInputChange}
              />
            </div>

            <div className="space-y-2">
              <Label>資料添付</Label>
              <FileUpload
                onFileSelect={setSelectedFile}
                currentFile={supporterData?.attachmentName}
                maxSize={50}
              />
            </div>
          </div>

          <div className="space-y-4">
            <Label className="text-base font-semibold">推定リードターゲット</Label>
            
            <div className="space-y-2">
              <Label htmlFor="targetCompanySize">企業規模</Label>
              <Input
                id="targetCompanySize"
                placeholder="中小企業、年商1億円以上など"
                {...form.register("targetCompanySize")}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="targetAttributes">属性</Label>
              <Input
                id="targetAttributes"
                placeholder="IT業界、製造業、サービス業など"
                {...form.register("targetAttributes")}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="targetOthers">その他</Label>
              <Input
                id="targetOthers"
                placeholder="その他の条件があれば入力してください"
                {...form.register("targetOthers")}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="addboxFee">商談フィー（ZETTAICHI渡し）</Label>
              <Input
                id="addboxFee"
                placeholder="40000"
                {...form.register("addboxFee")}
                autoComplete="off"
              />
              <p className="text-sm text-muted-foreground">
                マスター画面のみ表示されます
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="connectorFee">商談フィー（コネクター渡し）</Label>
              <Input
                id="connectorFee"
                placeholder="30000"
                {...form.register("connectorFee")}
                autoComplete="off"
              />
              <p className="text-sm text-muted-foreground">
                コネクター画面と請求に反映されます
              </p>
            </div>
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
