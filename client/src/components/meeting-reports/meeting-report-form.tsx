import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const meetingReportSchema = z.object({
  leadId: z.number(),
  connectorId: z.number(),
  attendedMeeting: z.boolean({ required_error: "商談同席を選択してください" }),
  meetingContent: z.string().min(1, "商談内容を選択してください"),
  problemReason: z.string().optional(),
  notes: z.string().optional(),
});

type MeetingReportForm = z.infer<typeof meetingReportSchema>;

interface MeetingReportFormProps {
  leadId: number;
  companyName: string;
  contactPerson: string;
  onSuccess?: () => void;
}

export function MeetingReportForm({ leadId, companyName, contactPerson, onSuccess }: MeetingReportFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: existingReport } = useQuery({
    queryKey: [`/api/meeting-reports/lead/${leadId}`],
  });

  const form = useForm<MeetingReportForm>({
    resolver: zodResolver(meetingReportSchema),
    defaultValues: {
      leadId,
      connectorId: user?.id || 0,
      attendedMeeting: undefined,
      meetingContent: "",
      problemReason: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (existingReport && typeof existingReport === 'object') {
      const report = existingReport as any;
      form.setValue("attendedMeeting", report.attendedMeeting);
      form.setValue("meetingContent", report.meetingContent || "");
      form.setValue("problemReason", report.problemReason || "");
      form.setValue("notes", report.notes || "");
    }
  }, [existingReport, form]);

  const createMutation = useMutation({
    mutationFn: async (data: MeetingReportForm) => {
      const response = await apiRequest("POST", "/api/meeting-reports", data);
      return response;
    },
    onSuccess: () => {
      toast({
        title: "成功",
        description: "商談報告書を提出しました",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/meeting-reports"] });
      queryClient.invalidateQueries({ queryKey: [`/api/meeting-reports/lead/${leadId}`] });
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: "エラー",
        description: error.message || "商談報告書の提出に失敗しました",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: MeetingReportForm) => {
      const reportId = (existingReport as any)?.id;
      const response = await apiRequest("PUT", `/api/meeting-reports/${reportId}`, data);
      return response;
    },
    onSuccess: () => {
      toast({
        title: "成功",
        description: "商談報告書を更新しました",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/meeting-reports"] });
      queryClient.invalidateQueries({ queryKey: [`/api/meeting-reports/lead/${leadId}`] });
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: "エラー",
        description: error.message || "商談報告書の更新に失敗しました",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: MeetingReportForm) => {
    if (existingReport) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const watchMeetingContent = form.watch("meetingContent");

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>商談報告書</CardTitle>
        <div className="text-sm text-muted-foreground">
          <p>企業名: {companyName}</p>
          <p>担当者: {contactPerson}</p>
        </div>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="attendedMeeting"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>商談同席 <span className="text-red-500">*</span></FormLabel>
                  <Select
                    onValueChange={(value) => {
                      if (value === "undefined") {
                        field.onChange(undefined);
                      } else {
                        field.onChange(value === "true");
                      }
                    }}
                    value={field.value === undefined ? "undefined" : field.value.toString()}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="選択してください" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="undefined">未選択</SelectItem>
                      <SelectItem value="true">あり</SelectItem>
                      <SelectItem value="false">なし</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="meetingContent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>商談内容 <span className="text-red-500">*</span></FormLabel>
                  <Select
                    onValueChange={(value) => {
                      if (value === "none") {
                        field.onChange("");
                      } else {
                        field.onChange(value);
                      }
                    }}
                    value={field.value === "" ? "none" : field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="選択してください" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">未選択</SelectItem>
                      <SelectItem value="問題なし">問題なし</SelectItem>
                      <SelectItem value="問題あり">問題あり</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {watchMeetingContent === "問題あり" && (
              <FormField
                control={form.control}
                name="problemReason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>問題理由</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="そもそも予算がないという話になってしまった"
                        {...field}
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>備考（任意）</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="その他の情報があれば記載してください"
                      {...field}
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-2">
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {existingReport ? "更新" : "提出"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}