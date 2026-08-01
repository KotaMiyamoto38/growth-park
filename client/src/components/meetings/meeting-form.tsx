import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";

const meetingSchema = z.object({
  leadId: z.number({ required_error: "リードを選択してください" }),
  supporterId: z.number().optional(),
  scheduledDate: z.string().optional(),
  locationOrLink: z.string().optional(),
  outcome: z.enum(["予定", "実施済み", "キャンセル"]).default("予定"),
  attendanceRequired: z.boolean().default(false),
  attendanceFee: z.number().optional(),
});

type MeetingForm = z.infer<typeof meetingSchema>;

interface MeetingFormProps {
  onSuccess?: () => void;
  meetingId?: number;
}

export function MeetingForm({ onSuccess, meetingId }: MeetingFormProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");

  const { data: leads, isLoading: leadsLoading } = useQuery({
    queryKey: ["/api/leads"],
  });

  const { data: supporters, isLoading: supportersLoading } = useQuery({
    queryKey: ["/api/supporters"],
  });

  const form = useForm<MeetingForm>({
    resolver: zodResolver(meetingSchema),
    defaultValues: {
      leadId: undefined,
      supporterId: undefined,
      scheduledDate: "",
      locationOrLink: "",
      outcome: "予定",
      attendanceRequired: false,
      attendanceFee: undefined,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: MeetingForm) => {
      const response = await apiRequest("POST", "/api/meetings", {
        ...data,
        scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });
      onSuccess?.();
    },
    onError: (error: any) => {
      setError(error.message || "商談の作成に失敗しました");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: MeetingForm) => {
      const response = await apiRequest("PUT", `/api/meetings/${meetingId}`, {
        ...data,
        scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });
      onSuccess?.();
    },
    onError: (error: any) => {
      setError(error.message || "商談の更新に失敗しました");
    },
  });

  const onSubmit = async (data: MeetingForm) => {
    setError("");
    
    if (meetingId) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;
  const attendanceRequired = form.watch("attendanceRequired");

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>
          {meetingId ? "商談編集" : "新規商談登録"}
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
              <Label htmlFor="leadId">リード *</Label>
              <Select
                value={form.watch("leadId")?.toString()}
                onValueChange={(value) => form.setValue("leadId", parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="リードを選択" />
                </SelectTrigger>
                <SelectContent>
                  {leadsLoading ? (
                    <SelectItem value="loading" disabled>読み込み中...</SelectItem>
                  ) : (
                    leads?.map((lead: any) => (
                      <SelectItem key={lead.id} value={lead.id.toString()}>
                        {lead.companyName} - {lead.contactPerson}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {form.formState.errors.leadId && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.leadId.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="supporterId">支援先</Label>
              <Select
                value={form.watch("supporterId")?.toString() || ""}
                onValueChange={(value) => form.setValue("supporterId", value === "none" ? undefined : parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="支援先を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">選択なし</SelectItem>
                  {supportersLoading ? (
                    <SelectItem value="loading" disabled>読み込み中...</SelectItem>
                  ) : (
                    supporters?.map((supporter: any) => (
                      <SelectItem key={supporter.id} value={supporter.id.toString()}>
                        {supporter.companyName}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="scheduledDate">商談日時</Label>
              <Input
                id="scheduledDate"
                type="datetime-local"
                {...form.register("scheduledDate")}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="outcome">ステータス</Label>
              <Select
                value={form.watch("outcome")}
                onValueChange={(value) => form.setValue("outcome", value as "予定" | "実施済み" | "キャンセル")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="予定">予定</SelectItem>
                  <SelectItem value="実施済み">実施済み</SelectItem>
                  <SelectItem value="キャンセル">キャンセル</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="locationOrLink">場所・リンク</Label>
            <Input
              id="locationOrLink"
              placeholder="会議室名またはオンライン会議リンク"
              {...form.register("locationOrLink")}
              autoComplete="off"
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="attendanceRequired"
                checked={attendanceRequired}
                onCheckedChange={(checked) => form.setValue("attendanceRequired", checked as boolean)}
              />
              <Label htmlFor="attendanceRequired">商談同席が必要</Label>
            </div>

            {attendanceRequired && (
              <div className="space-y-2 ml-6">
                <Label htmlFor="attendanceFee">同席費用（円）</Label>
                <Input
                  id="attendanceFee"
                  type="number"
                  placeholder="2000"
                  {...form.register("attendanceFee", { valueAsNumber: true })}
                  autoComplete="off"
                />
                <p className="text-sm text-muted-foreground">
                  商談同席には追加費用がかかります
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-4">
            <Button type="button" variant="outline" onClick={() => onSuccess?.()}>
              キャンセル
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {meetingId ? "更新" : "登録"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
