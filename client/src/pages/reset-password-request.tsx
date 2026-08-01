import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Rocket, ArrowLeft, CheckCircle, ExternalLink } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const resetRequestSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください"),
});

type ResetRequestForm = z.infer<typeof resetRequestSchema>;

interface ResetResponse {
  message: string;
  resetUrl: string;
  userName: string;
}

export default function ResetPasswordRequestPage() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resetData, setResetData] = useState<ResetResponse | null>(null);

  const form = useForm<ResetRequestForm>({
    resolver: zodResolver(resetRequestSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async (data: ResetRequestForm) => {
    setIsLoading(true);
    setError("");

    try {
      const response = await apiRequest("POST", "/api/auth/password-reset/request", data);
      const result = await response.json();
      setResetData(result);
    } catch (err: any) {
      setError(err.message || "リクエストに失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

  if (resetData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-4 text-center">
            <div className="mx-auto w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold">リセットリンクを生成しました</CardTitle>
              <CardDescription className="mt-2">
                {resetData.userName}さんのパスワードリセットリンクです。
                下のボタンをクリックして新しいパスワードを設定してください。
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <a href={resetData.resetUrl}>
              <Button className="w-full" data-testid="button-reset-password">
                <ExternalLink className="h-4 w-4 mr-2" />
                パスワードを変更する
              </Button>
            </a>
            <Link href="/login">
              <Button variant="outline" className="w-full" data-testid="button-back-to-login">
                <ArrowLeft className="h-4 w-4 mr-2" />
                ログインに戻る
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
            <Rocket className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">パスワードをお忘れの方</CardTitle>
            <CardDescription>
              登録したメールアドレスを入力してください。
              パスワードリセット用のリンクをお送りします。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                placeholder="example@company.com"
                {...form.register("email")}
                data-testid="input-email"
              />
              {form.formState.errors.email && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-submit">
              {isLoading ? "送信中..." : "リセットリンクを送信"}
            </Button>

            <div className="text-center">
              <Link href="/login" className="text-sm text-primary hover:underline" data-testid="link-back-to-login">
                <ArrowLeft className="h-4 w-4 inline mr-1" />
                ログインに戻る
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
