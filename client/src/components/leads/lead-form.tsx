import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Copy } from "lucide-react";

const createFormSchema = (userRole?: string, isEdit?: boolean) => z.object({
  connectorId: z.number(),
  supporterId: z.number().min(1, "支援先は必須です"),
  companyName: z.string().min(1, "企業名は必須です"),
  companyWebsite: isEdit ? z.string().optional() : z.string().min(1, "HPは必須です"),
  businessContent: z.string().min(1, "事業内容は必須です"),
  position: z.string().min(1, "役職は必須です"),
  contactPerson: z.string().min(1, "担当者は必須です"),
  contactInfo: z.string().optional(),
  meetingFee: z.number().min(1, "商談フィーは必須です"),
  status: z.enum(["進行中", "商談実施済み", "失注"]),
  assignedPerson: userRole === "AddBox" ? z.string().min(1, "繋いだ担当者は必須です") : z.string().optional(),
  assignedPersonSub: userRole === "AddBox" ? z.string().min(1, "繋いだ担当者（サブ）は必須です") : z.string().optional(),
  needs: z.string().min(1, "ニーズは必須です"),
  source: z.enum(["リファラル", "交流会", "テレアポ", "SNS", "そのほか"]),
  meetingDate: z.string().optional(),
});

type LeadForm = z.infer<ReturnType<typeof createFormSchema>>;

interface LeadFormProps {
  onSuccess?: () => void;
  leadId?: number;
  readOnly?: boolean;
  connectorId?: number;
}

export function LeadForm({ onSuccess, leadId, readOnly = false, connectorId }: LeadFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [selectedSupporter, setSelectedSupporter] = useState<any>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({
        title: "コピーしました",
        description: `${label}をクリップボードにコピーしました`,
      });
    }).catch(() => {
      toast({
        title: "コピーに失敗しました",
        description: "クリップボードへのアクセスに失敗しました",
        variant: "destructive",
      });
    });
  };

  const { data: supporters } = useQuery({
    queryKey: ['/api/supporters'],
  });

  // Get connector profile for auto-filling
  const actualConnectorId = connectorId || user?.id;
  const { data: connectorProfile } = useQuery({
    queryKey: [`/api/connectors/${actualConnectorId}/profile`],
    enabled: !!actualConnectorId && (user?.role === "Connector" || user?.role === "AddBox"),
  });

  const { data: existingLead, refetch: refetchLead } = useQuery({
    queryKey: [`/api/leads/${leadId}`],
    enabled: !!leadId,
    staleTime: 0, // Always fetch fresh data
    gcTime: 0, // Don't cache the data (TanStack Query v5)
  });

  const formSchema = createFormSchema(user?.role, !!leadId);
  
  const form = useForm<LeadForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      connectorId: actualConnectorId || 0,
      supporterId: undefined,
      companyName: "",
      companyWebsite: "",
      businessContent: "",
      position: "",
      contactPerson: "",
      contactInfo: "",
      meetingFee: undefined,
      status: "進行中",
      assignedPerson: "",
      assignedPersonSub: "なし",
      needs: "",
      source: "そのほか",
      meetingDate: "",
    },
  });

  // Auto-fill company name and contact person from connector profile
  useEffect(() => {
    if (connectorProfile && user?.role === "Connector" && !leadId) {
      // For connectors, leave company name and contact person empty for client info
      form.setValue("companyName", "");
      form.setValue("contactPerson", "");
      // Set assigned person to connector's name/company format
      if (connectorProfile.companyName && connectorProfile.companyName !== "個人") {
        form.setValue("assignedPerson", `${connectorProfile.name}（${connectorProfile.companyName}）`);
      } else {
        form.setValue("assignedPerson", connectorProfile.name || "");
      }
    }
  }, [connectorProfile, form, user, leadId]);

  // Auto-populate meeting fee when supporter is selected
  useEffect(() => {
    if (selectedSupporter) {
      // Use AddBox fee for AddBox users, connector fee for connector users
      if (user?.role === "AddBox") {
        form.setValue("meetingFee", selectedSupporter.addboxFee || 0);
      } else {
        form.setValue("meetingFee", selectedSupporter.connectorFee || 0);
      }
    }
  }, [selectedSupporter, form, user]);

  // Update connectorId when user data loads
  useEffect(() => {
    if (actualConnectorId) {
      form.setValue("connectorId", actualConnectorId);
    }
  }, [actualConnectorId, form]);

  // Set form values when editing existing lead
  useEffect(() => {
    if (existingLead && supporters) {
      form.reset({
        connectorId: existingLead.connectorId || actualConnectorId || 0,
        supporterId: existingLead.supporterId,
        companyName: existingLead.companyName || "",
        companyWebsite: existingLead.companyWebsite || "",
        businessContent: existingLead.businessContent || "",
        position: existingLead.position || "",
        contactPerson: existingLead.contactPerson || "",
        contactInfo: existingLead.contactInfo || "",
        meetingFee: existingLead.meetingFee,
        status: existingLead.status || "進行中",
        assignedPerson: existingLead.assignedPerson || "",
        assignedPersonSub: existingLead.assignedPersonSub || "なし",
        needs: existingLead.needs || "",
        source: existingLead.source || "そのほか",
      });
      
      // Set selected supporter for editing
      if (existingLead.supporterId) {
        const supporter = supporters.find((s: any) => s.id === existingLead.supporterId);
        if (supporter) {
          setSelectedSupporter(supporter);
        }
      }
    }
  }, [existingLead, supporters, form, user]);

  const createMutation = useMutation({
    mutationFn: async (data: LeadForm) => {
      const response = await apiRequest("POST", "/api/leads", data);
      return response;
    },
    onSuccess: () => {
      toast({
        title: "成功",
        description: "リードが作成されました",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: [`/api/connectors/${actualConnectorId}/leads`] });
      form.reset();
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: "エラー",
        description: error.message || "リードの作成に失敗しました",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: LeadForm) => {
      const response = await apiRequest("PUT", `/api/leads/${leadId}`, data);
      return response;
    },
    onSuccess: () => {
      toast({
        title: "成功",
        description: "リードが更新されました",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: [`/api/connectors/${actualConnectorId}/leads`] });
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: "エラー",
        description: error.message || "リードの更新に失敗しました",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: LeadForm) => {
    if (leadId) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="supporterId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>支援先 <span className="text-red-500">*</span></FormLabel>
              <Select
                onValueChange={(value) => {
                  const supporterId = parseInt(value);
                  field.onChange(supporterId);
                  const supporter = supporters?.find((s: any) => s.id === supporterId);
                  setSelectedSupporter(supporter);
                }}
                value={field.value?.toString()}
                disabled={readOnly}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="支援先を選択してください" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {supporters?.filter((supporter: any) => supporter.status !== 'ストップ').map((supporter: any) => (
                    <SelectItem key={supporter.id} value={supporter.id.toString()}>
                      {supporter.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="meetingFee"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                商談フィー <span className="text-red-500">*</span>
                {readOnly && field.value && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => copyToClipboard(`¥${Number(field.value).toLocaleString()}`, "商談フィー")}
                    title="商談フィーをコピー"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="商談フィー"
                  {...field}
                  value={field.value || ""}
                  onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                  disabled={readOnly}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="companyName"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                企業名（商談を受けていただく企業） <span className="text-red-500">*</span>
                {readOnly && field.value && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => copyToClipboard(field.value, "企業名")}
                    title="企業名をコピー"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </FormLabel>
              <FormControl>
                <Input 
                  placeholder="企業名を入力してください" 
                  {...field}
                  className={user?.role === "Connector" && connectorProfile ? "bg-gray-50" : ""} 
                  disabled={readOnly}
                  autoComplete="off"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="companyWebsite"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                HP（ない場合は法人番号がわかるサイトのURLを入れてください）{!leadId && !readOnly && <span className="text-red-500"> *</span>}
                {readOnly && field.value && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => copyToClipboard(field.value, "HP")}
                    title="HPをコピー"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </FormLabel>
              <FormControl>
                <Input 
                  placeholder="https://example.com" 
                  {...field}
                  disabled={readOnly}
                  autoComplete="off"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="businessContent"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                事業内容 <span className="text-red-500">*</span>
                {readOnly && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => copyToClipboard(field.value || "", "事業内容")}
                    title="事業内容をコピー"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </FormLabel>
              <FormControl>
                <Textarea
                  placeholder="事業内容を入力してください"
                  {...field}
                  disabled={readOnly}
                  autoComplete="off"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="position"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                役職 <span className="text-red-500">*</span>
                {readOnly && field.value && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => copyToClipboard(field.value, "役職")}
                    title="役職をコピー"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </FormLabel>
              <FormControl>
                <Input 
                  placeholder="役職を入力してください" 
                  {...field}
                  disabled={readOnly}
                  autoComplete="off"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="contactPerson"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                お名前（商談を受けていただく方） <span className="text-red-500">*</span>
                {readOnly && field.value && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => copyToClipboard(field.value, "お名前")}
                    title="お名前をコピー"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </FormLabel>
              <FormControl>
                <Input 
                  placeholder="お名前を入力してください" 
                  {...field}
                  className={user?.role === "Connector" && connectorProfile ? "bg-gray-50" : ""} 
                  disabled={readOnly}
                  autoComplete="off"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="contactInfo"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                連絡先（任意）
                {readOnly && field.value && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => copyToClipboard(field.value, "連絡先")}
                    title="連絡先をコピー"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </FormLabel>
              <FormControl>
                <Input placeholder="連絡先を入力してください" {...field} disabled={readOnly} autoComplete="off" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>ステータス</FormLabel>
              <Select onValueChange={field.onChange} value={field.value} disabled={readOnly}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="ステータスを選択してください" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="進行中">進行中</SelectItem>
                  <SelectItem value="商談実施済み">商談実施済み</SelectItem>
                  <SelectItem value="失注">失注</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="assignedPerson"
          render={({ field }) => (
            <FormItem>
              <FormLabel>繋いだ担当者{user?.role === "AddBox" && <span className="text-red-500"> *</span>}</FormLabel>
              {user?.role === "Connector" ? (
                <FormControl>
                  <Input 
                    {...field}
                    className="bg-gray-50"
                    readOnly
                    placeholder="コネクター情報から自動設定"
                  />
                </FormControl>
              ) : (
                <Select onValueChange={field.onChange} value={field.value} disabled={readOnly}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="担当者を選択してください" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="宮本">
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        <span>宮本</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="芝本">
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                        <span>芝本</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="浜野">
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-teal-500 rounded-full"></div>
                        <span>浜野</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="阿久津">
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-indigo-500 rounded-full"></div>
                        <span>阿久津</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
              {user?.role === "Connector" && connectorProfile && (
                <p className="text-sm text-muted-foreground">
                  コネクター情報から自動設定されました
                </p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {user?.role === "AddBox" && (
          <FormField
            control={form.control}
            name="assignedPersonSub"
            render={({ field }) => (
              <FormItem>
                <FormLabel>繋いだ担当者（サブ）<span className="text-red-500"> *</span></FormLabel>
                <Select onValueChange={field.onChange} value={field.value} disabled={readOnly}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="サブ担当者を選択してください" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="なし">
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                        <span>なし</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="宮本">
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        <span>宮本</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="芝本">
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                        <span>芝本</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="浜野">
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-teal-500 rounded-full"></div>
                        <span>浜野</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="阿久津">
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-indigo-500 rounded-full"></div>
                        <span>阿久津</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="needs"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                ニーズ <span className="text-red-500">*</span>
                {readOnly && field.value && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => copyToClipboard(field.value, "ニーズ")}
                    title="ニーズをコピー"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </FormLabel>
              <FormControl>
                <Textarea
                  placeholder="ニーズを入力してください"
                  {...field}
                  disabled={readOnly}
                  autoComplete="off"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="source"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                流入元 <span className="text-red-500">*</span>
              </FormLabel>
              <Select
                disabled={readOnly}
                onValueChange={field.onChange}
                defaultValue={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="流入元を選択してください" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="リファラル">リファラル</SelectItem>
                  <SelectItem value="交流会">交流会</SelectItem>
                  <SelectItem value="テレアポ">テレアポ</SelectItem>
                  <SelectItem value="SNS">SNS</SelectItem>
                  <SelectItem value="そのほか">そのほか</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {!readOnly && (
          <Button 
            type="submit" 
            disabled={createMutation.isPending || updateMutation.isPending}
            className="w-full"
          >
            {createMutation.isPending || updateMutation.isPending ? "処理中..." : leadId ? "更新" : "作成"}
          </Button>
        )}
        
        {readOnly && (
          <div className="bg-gray-50 p-4 rounded-md border">
            <p className="text-sm text-gray-600 text-center">
              この商談はコネクター経由のため、閲覧のみ可能です。
            </p>
          </div>
        )}
      </form>
    </Form>
  );
}
