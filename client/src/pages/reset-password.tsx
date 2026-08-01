import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Rocket, ArrowLeft, CheckCircle, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const resetPasswordSchema = z.object({
  newPassword: z.string().min(6, "パスワードは6文字以上で入力してください"),
  confirmPassword: z.string().min(1, "パスワードを再入力してください"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "パスワードが一致しません",
  path: ["confirmPassword"],
});

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get("token");
    setToken(tokenParam);
  }, []);

  const form = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (data: ResetPasswordForm) => {
    if (!token) {
      setError("無効なリセットリンクです");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      await apiRequest("POST", "/api/auth/password-reset/confirm", {
        token,
        newPassword: data.newPassword,
      });
      setIsSuccess(true);
    } catch (err: any) {
      setError(err.message || "パスワードリセットに失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-4 text-center">
            <div className="mx-auto w-12 h-12 bg-red-500 rounded-lg flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold">無効なリンク</CardTitle>
              <CardDescription className="mt-2">
                パスワードリセットのリンクが無効です。
                もう一度パスワードリセットをリクエストしてください。
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Link href="/reset-password-request">
              <Button className="w-full" data-testid="button-request-again">
                パスワードリセットをリクエスト
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-4 text-center">
            <div className="mx-auto w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold">パスワードを変更しました</CardTitle>
              <CardDescription className="mt-2">
                パスワードが正常にリセットされました。
                新しいパスワードでログインしてください。
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Link href="/login">
              <Button className="w-full" data-testid="button-to-login">
                ログインする
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
            <CardTitle className="text-2xl font-bold">新しいパスワードを設定</CardTitle>
            <CardDescription>
              新しいパスワードを入力してください。
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
              <Label htmlFor="newPassword">新しいパスワード</Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="6文字以上"
                {...form.register("newPassword")}
                data-testid="input-new-password"
              />
              {form.formState.errors.newPassword && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.newPassword.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">パスワードを再入力</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="パスワードを再入力"
                {...form.register("confirmPassword")}
                data-testid="input-confirm-password"
              />
              {form.formState.errors.confirmPassword && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.confirmPassword.message}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-submit">
              {isLoading ? "変更中..." : "パスワードを変更"}
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
