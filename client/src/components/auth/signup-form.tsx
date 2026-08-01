import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Rocket } from "lucide-react";
import { Link } from "wouter";
import { TermsDialog } from "./terms-dialog";

const signupSchema = z.object({
  name: z.string().min(1, "氏名を入力してください"),
  email: z.string().email("有効なメールアドレスを入力してください"),
  password: z.string().min(6, "パスワードは6文字以上で入力してください"),
  role: z.enum(["AddBox", "Connector"], { required_error: "ロールを選択してください" }),
  companyName: z.string().optional(),
  companyWebsite: z.string().optional(),
  industry: z.string().optional(),
  address: z.string().optional(),
  agreeToTerms: z.boolean().refine(val => val === true, "利用規約に同意してください"),
});

type SignupForm = z.infer<typeof signupSchema>;

export function SignupForm() {
  const [, setLocation] = useLocation();
  const { register } = useAuth();
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: "Connector",
      companyName: "",
      companyWebsite: "",
      industry: undefined,
      address: "",
      agreeToTerms: false,
    },
  });

  const watchRole = form.watch("role");

  const onSubmit = async (data: SignupForm) => {
    setIsLoading(true);
    setError("");

    try {
      await register(data);
      setLocation("/");
    } catch (err: any) {
      setError(err.message || "登録に失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

  const industries = [
    "IT・ソフトウェア",
    "製造業",
    "小売・卸売",
    "金融・保険",
    "不動産",
    "医療・福祉",
    "教育",
    "建設・土木",
    "運輸・物流",
    "サービス業",
    "その他",
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
            <Rocket className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">Growth Park</CardTitle>
            <CardDescription>
              新規アカウントを作成してください
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="max-h-[70vh] overflow-y-auto">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="role">ロール</Label>
              <Select value={form.watch("role")} onValueChange={(value) => form.setValue("role", value as "AddBox" | "Connector")}>
                <SelectTrigger>
                  <SelectValue placeholder="ロールを選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Connector">コネクター</SelectItem>
                  <SelectItem value="AddBox">ZETTAICHI管理者</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">氏名</Label>
              <Input
                id="name"
                placeholder="田中 太郎"
                {...form.register("name")}
                autoComplete="off"
              />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                placeholder="example@company.co.jp"
                {...form.register("email")}
                autoComplete="off"
              />
              {form.formState.errors.email && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">パスワード</Label>
              <Input
                id="password"
                type="password"
                {...form.register("password")}
                autoComplete="off"
              />
              {form.formState.errors.password && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>

            {watchRole === "Connector" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="companyName">会社名</Label>
                  <Input
                    id="companyName"
                    placeholder="株式会社〇〇"
                    {...form.register("companyName")}
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="companyWebsite">企業HP（任意）</Label>
                  <Input
                    id="companyWebsite"
                    placeholder="https://www.example.com"
                    {...form.register("companyWebsite")}
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="industry">業種</Label>
                  <Select value={form.watch("industry") || ""} onValueChange={(value) => form.setValue("industry", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="業種を選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {industries.map((industry) => (
                        <SelectItem key={industry} value={industry}>
                          {industry}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">住所（任意）</Label>
                  <Input
                    id="address"
                    placeholder="東京都渋谷区..."
                    {...form.register("address")}
                    autoComplete="off"
                  />
                </div>
              </>
            )}

            <div className="flex items-center space-x-2">
              <Checkbox
                id="terms"
                checked={form.watch("agreeToTerms")}
                onCheckedChange={(checked) => form.setValue("agreeToTerms", checked as boolean)}
              />
              <Label htmlFor="terms" className="text-sm">
                <TermsDialog type="terms">
                  <button type="button" className="text-primary hover:underline">
                    利用規約
                  </button>
                </TermsDialog>
                と
                <TermsDialog type="privacy">
                  <button type="button" className="text-primary hover:underline">
                    プライバシーポリシー
                  </button>
                </TermsDialog>
                に同意します
              </Label>
            </div>
            {form.formState.errors.agreeToTerms && (
              <p className="text-sm text-destructive">
                {form.formState.errors.agreeToTerms.message}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? "登録中..." : "アカウント作成"}
            </Button>

            <div className="text-center text-sm">
              <span className="text-muted-foreground">すでにアカウントをお持ちの方は </span>
              <Link href="/login" className="text-primary hover:underline">
                ログイン
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
