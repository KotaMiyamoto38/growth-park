import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { 
  User, 
  Bell, 
  Shield, 
  Mail, 
  Palette, 
  Database,
  Users,
  Settings as SettingsIcon,
  Info,
  Eye,
  EyeOff,
  Trash2,
  AlertTriangle,
  FileSpreadsheet
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface GoogleSheetsStatus {
  connected: boolean;
  ready: boolean;
  email?: string;
  message?: string;
}

const GOOGLE_SHEETS_ERROR_MESSAGES = {
  "api-disabled": "Google Sheets APIが有効になっていません。管理者に有効化を依頼してから、もう一度連携してください。",
  "destination-permission": "連携したGoogleアカウントから転記先を確認できません。両方のシートの共有設定で、編集権限があることを確認してください。",
  expired: "Googleの接続期限が切れています。設定画面からもう一度連携してください。",
  "missing-refresh-token": "Googleの連携許可を確認できませんでした。許可内容を確認して、もう一度連携してください。",
  "missing-scope": "スプレッドシートの編集権限が許可されていません。Googleの連携画面で編集権限を許可して、もう一度連携してください。",
  configuration: "Google連携の接続設定を確認できません。管理者に接続設定の確認を依頼してください。",
  "invalid-state": "接続操作の有効期限が切れたか、開始したブラウザーと異なります。設定画面からもう一度連携してください。",
  "admin-required": "Google連携には管理者権限が必要です。管理者アカウントでログインし直して、もう一度連携してください。",
  cancelled: "Googleの連携許可がキャンセルされました。連携する場合は、設定画面からもう一度開始してください。",
  "destination-changed": "転記先のシート構成が変更されています。管理者に確認してください。",
  "account-unverified": "Googleアカウントの確認が完了していません。確認済みのGoogleアカウントで、もう一度連携してください。",
  unknown: "Googleとの連携を完了できませんでした。時間をおいてもう一度連携し、解消しない場合は管理者に確認してください。",
} as const;

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const {
    data: googleSheetsStatus,
    isLoading: googleSheetsStatusLoading,
    isError: googleSheetsStatusError,
    refetch: refetchGoogleSheetsStatus,
  } = useQuery<GoogleSheetsStatus>({
    queryKey: ["/api/admin/google-sheets/status"],
    enabled: user?.role === "AddBox",
    staleTime: 0,
    retry: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [notifications, setNotifications] = useState({
    email: true,
    push: false,
    meetings: true,
    leads: false,
    reports: true,
    marketing: false,
  });

  const [profile, setProfile] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: "",
    company: user?.companyName || "",
  });

  const [security, setSecurity] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
    twoFactorEnabled: false,
    sessionTimeout: "30",
  });

  const [preferences, setPreferences] = useState({
    theme: "light",
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/auth/account");
      return response;
    },
    onSuccess: () => {
      toast({
        title: "アカウント削除完了",
        description: "アカウントが正常に削除されました。",
      });
      logout();
    },
    onError: (error: any) => {
      toast({
        title: "削除エラー",
        description: (() => {
          try { return JSON.parse(error.message.replace(/^\d+:\s*/, "")).message; }
          catch { return "アカウントの削除に失敗しました。"; }
        })(),
        variant: "destructive",
      });
    },
  });

  const slackTestMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/slack/test");
      return response.json();
    },
    onSuccess: (result: { message: string }) => {
      toast({ title: "テスト通知を送信しました", description: result.message });
    },
    onError: (error: Error) => {
      let description = "テスト通知を送信できませんでした。時間をおいて再度お試しください。";
      try {
        const result = JSON.parse(error.message.replace(/^\d+:\s*/, ""));
        if (typeof result.message === "string") description = result.message;
      } catch {}
      toast({ title: "Slack通知エラー", description, variant: "destructive" });
    },
  });

  const googleSheetsConnectMutation = useMutation({
    mutationFn: async (): Promise<{ url: string }> => {
      const response = await apiRequest("POST", "/api/admin/google-sheets/connect");
      return response.json();
    },
    retry: false,
    onSuccess: ({ url }) => {
      try {
        const destination = new URL(url);
        if (destination.protocol !== "https:" || destination.hostname !== "accounts.google.com") {
          throw new Error("Unexpected authorization destination");
        }
        window.location.assign(destination.toString());
      } catch {
        toast({
          title: "Google連携エラー",
          description: "Googleの連携画面を開けませんでした。再度お試しください。",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      let description = "Googleとの連携を開始できませんでした。再度お試しください。";
      try {
        const result = JSON.parse(error.message.replace(/^\d+:\s*/, ""));
        if (typeof result.message === "string") description = result.message;
      } catch {}
      toast({ title: "Google連携エラー", description, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!user) return;
    const url = new URL(window.location.href);
    const outcome = url.searchParams.get("googleSheets");
    if (!outcome) return;
    if (outcome === "connected") {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/google-sheets/status"] });
      toast({ title: "Googleスプレッドシートを連携しました", description: "転記先への接続を確認しました。転記には両方のシートの編集権限が必要です。" });
    } else {
      const reason = url.searchParams.get("googleSheetsReason") || "unknown";
      const description = Object.prototype.hasOwnProperty.call(GOOGLE_SHEETS_ERROR_MESSAGES, reason)
        ? GOOGLE_SHEETS_ERROR_MESSAGES[reason as keyof typeof GOOGLE_SHEETS_ERROR_MESSAGES]
        : GOOGLE_SHEETS_ERROR_MESSAGES.unknown;
      toast({
        title: "Google連携を完了できませんでした",
        description,
        variant: "destructive",
      });
    }
    url.searchParams.delete("googleSheets");
    url.searchParams.delete("googleSheetsReason");
    url.searchParams.delete("error");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [user, queryClient, toast]);

  // Load settings from localStorage
  useEffect(() => {
    const savedNotifications = localStorage.getItem("growth_park_notifications");
    const savedPreferences = localStorage.getItem("growth_park_preferences");
    const savedSecurity = localStorage.getItem("growth_park_security");

    if (savedNotifications) {
      setNotifications(JSON.parse(savedNotifications));
    }
    if (savedPreferences) {
      setPreferences(JSON.parse(savedPreferences));
    }
    if (savedSecurity) {
      setSecurity(prev => ({ ...prev, ...JSON.parse(savedSecurity) }));
    }
  }, []);

  const saveNotificationSettings = () => {
    localStorage.setItem("growth_park_notifications", JSON.stringify(notifications));
    toast({
      title: "設定を保存しました",
      description: "通知設定が更新されました",
    });
  };

  const saveSecuritySettings = () => {
    if (security.newPassword && security.newPassword !== security.confirmPassword) {
      toast({
        title: "エラー",
        description: "新しいパスワードが一致しません",
        variant: "destructive",
      });
      return;
    }
    
    const securityToSave = {
      twoFactorEnabled: security.twoFactorEnabled,
      sessionTimeout: security.sessionTimeout,
    };
    localStorage.setItem("growth_park_security", JSON.stringify(securityToSave));
    
    toast({
      title: "設定を保存しました",
      description: "セキュリティ設定が更新されました",
    });
    
    // Clear password fields
    setSecurity(prev => ({
      ...prev,
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    }));
  };

  const handleThemeChange = (newTheme: string) => {
    const updatedPreferences = { ...preferences, theme: newTheme };
    setPreferences(updatedPreferences);
    
    // Apply theme immediately
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    
    localStorage.setItem("growth_park_preferences", JSON.stringify(updatedPreferences));
    
    toast({
      title: "テーマを変更しました",
      description: `${newTheme === "dark" ? "ダーク" : "ライト"}テーマに切り替えました`,
    });
  };



  const savePreferences = () => {
    localStorage.setItem("growth_park_preferences", JSON.stringify(preferences));
    
    toast({
      title: "設定を保存しました",
      description: "表示設定が更新されました",
    });
  };

  return (
    <div className="space-y-6">
      <Header
        title="設定"
        subtitle="アカウント設定とシステム設定を管理します"
      />

      <div className="px-6 space-y-6">
        {user?.role === "AddBox" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Googleスプレッドシート連携
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                商談管理の転記ボタンから、支援先ごとのシートに追記します。対象の2枚のシートを編集できるGoogleアカウントで連携してください。
              </p>
              <ul className="list-disc pl-5 text-sm space-y-1">
                <li>株式会社Think UP：14行目以降に追記（役職欄は変更しません）</li>
                <li>Acroforce株式会社：4行目以降に追記</li>
              </ul>
              <div className="text-sm" role="status">
                {googleSheetsStatusLoading ? (
                  <p>連携状態を確認しています…</p>
                ) : googleSheetsStatusError ? (
                  <p className="text-destructive">連携状態を取得できませんでした。</p>
                ) : googleSheetsStatus?.connected ? (
                  <>
                    <p className={googleSheetsStatus.ready ? "text-green-700" : "text-amber-700"}>
                      {googleSheetsStatus.ready ? "転記先への接続を確認済み" : "連携の確認が必要です"}
                      {googleSheetsStatus.email ? `：${googleSheetsStatus.email}` : ""}
                    </p>
                    {googleSheetsStatus.ready && <p className="mt-1">転記には両方のシートの編集権限が必要です。</p>}
                    {googleSheetsStatus.message && <p className="mt-1">{googleSheetsStatus.message}</p>}
                  </>
                ) : (
                  <p>未連携です。最初にGoogleアカウントを連携してください。</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => googleSheetsConnectMutation.mutate()}
                  disabled={googleSheetsConnectMutation.isPending || googleSheetsStatusLoading}
                >
                  {googleSheetsConnectMutation.isPending ? "Googleの連携画面を開いています…" : googleSheetsStatus?.connected ? "Googleアカウントを再連携" : "Googleアカウントを連携"}
                </Button>
                {googleSheetsStatusError && (
                  <Button variant="outline" onClick={() => refetchGoogleSheetsStatus()}>状態を再確認</Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              プロフィール
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              通知設定
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              セキュリティ
            </TabsTrigger>
            <TabsTrigger value="preferences" className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              表示設定
            </TabsTrigger>
            <TabsTrigger value="account" className="flex items-center gap-2 text-red-600 hover:text-red-700 data-[state=active]:bg-red-600 data-[state=active]:text-white font-semibold">
              <Trash2 className="h-4 w-4" />
              アカウント削除
            </TabsTrigger>
          </TabsList>

          {/* プロフィール設定 */}
          <TabsContent value="profile" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>プロフィール情報</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">氏名</Label>
                    <Input
                      id="name"
                      value={profile.name}
                      onChange={(e) => setProfile({...profile, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">メールアドレス</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profile.email}
                      onChange={(e) => setProfile({...profile, email: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">電話番号</Label>
                    <Input
                      id="phone"
                      value={profile.phone}
                      onChange={(e) => setProfile({...profile, phone: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company">会社名</Label>
                    <Input
                      id="company"
                      value={profile.company}
                      onChange={(e) => setProfile({...profile, company: e.target.value})}
                    />
                  </div>
                </div>
                <Button>プロフィールを更新</Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 通知設定 */}
          <TabsContent value="notifications" className="space-y-6">
            {user?.role === "AddBox" && (
              <Card>
                <CardHeader>
                  <CardTitle>Slack通知の接続確認</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    設定済みのSlackチャンネルへテスト通知を送信します。商談データは作成されません。
                  </p>
                  <Button onClick={() => slackTestMutation.mutate()} disabled={slackTestMutation.isPending}>
                    {slackTestMutation.isPending ? "送信中…" : "Slackにテスト通知を送信"}
                  </Button>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader>
                <CardTitle>通知設定</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>メール通知</Label>
                      <p className="text-sm text-muted-foreground">
                        コネクターの新規商談登録、代表コネクターのアカウント作成・追加されたメンバーのアカウント作成時に通知
                      </p>
                    </div>
                    <Switch
                      checked={notifications.email}
                      onCheckedChange={(checked) =>
                        setNotifications({...notifications, email: checked})
                      }
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>商談通知</Label>
                      <p className="text-sm text-muted-foreground">
                        商談のスケジュールや更新を通知
                      </p>
                    </div>
                    <Switch
                      checked={notifications.meetings}
                      onCheckedChange={(checked) =>
                        setNotifications({...notifications, meetings: checked})
                      }
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>リード通知</Label>
                      <p className="text-sm text-muted-foreground">
                        新しいリードや更新を通知
                      </p>
                    </div>
                    <Switch
                      checked={notifications.leads}
                      onCheckedChange={(checked) =>
                        setNotifications({...notifications, leads: checked})
                      }
                    />
                  </div>

                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>レポート通知</Label>
                      <p className="text-sm text-muted-foreground">
                        月次レポートや分析結果を通知
                      </p>
                    </div>
                    <Switch
                      checked={notifications.reports}
                      onCheckedChange={(checked) =>
                        setNotifications({...notifications, reports: checked})
                      }
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>マーケティング通知</Label>
                      <p className="text-sm text-muted-foreground">
                        新機能やアップデート情報を受け取る
                      </p>
                    </div>
                    <Switch
                      checked={notifications.marketing}
                      onCheckedChange={(checked) =>
                        setNotifications({...notifications, marketing: checked})
                      }
                    />
                  </div>
                </div>
                <Button onClick={saveNotificationSettings}>通知設定を保存</Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* セキュリティ設定 */}
          <TabsContent value="security" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>パスワード変更</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current-password">現在のパスワード</Label>
                  <div className="relative">
                    <Input
                      id="current-password"
                      type={showPassword ? "text" : "password"}
                      value={security.currentPassword}
                      onChange={(e) => setSecurity({...security, currentPassword: e.target.value})}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">新しいパスワード</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={security.newPassword}
                    onChange={(e) => setSecurity({...security, newPassword: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">新しいパスワード（確認）</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={security.confirmPassword}
                    onChange={(e) => setSecurity({...security, confirmPassword: e.target.value})}
                  />
                </div>
                <Button onClick={saveSecuritySettings}>パスワードを変更</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>セキュリティ設定</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>二段階認証</Label>
                    <p className="text-sm text-muted-foreground">
                      アカウントのセキュリティを強化する
                    </p>
                  </div>
                  <Switch
                    checked={security.twoFactorEnabled}
                    onCheckedChange={(checked) =>
                      setSecurity({...security, twoFactorEnabled: checked})
                    }
                  />
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label htmlFor="session-timeout">セッションタイムアウト（分）</Label>
                  <Select 
                    value={security.sessionTimeout} 
                    onValueChange={(value) => setSecurity({...security, sessionTimeout: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15分</SelectItem>
                      <SelectItem value="30">30分</SelectItem>
                      <SelectItem value="60">1時間</SelectItem>
                      <SelectItem value="120">2時間</SelectItem>
                      <SelectItem value="480">8時間</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={saveSecuritySettings}>セキュリティ設定を保存</Button>
              </CardContent>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>二段階認証</Label>
                    <p className="text-sm text-muted-foreground">
                      ログイン時の追加セキュリティ
                    </p>
                  </div>
                  <Button variant="outline">設定</Button>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>ログイン履歴</Label>
                    <p className="text-sm text-muted-foreground">
                      最近のログイン活動を確認
                    </p>
                  </div>
                  <Button variant="outline">表示</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 表示設定 */}
          <TabsContent value="preferences" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>表示設定</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label>テーマ</Label>
                    <Select value={preferences.theme} onValueChange={handleThemeChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">ライト</SelectItem>
                        <SelectItem value="dark">ダーク</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={savePreferences}>設定を保存</Button>
              </CardContent>
            </Card>

          </TabsContent>

          {/* アカウント削除 */}
          <TabsContent value="account" className="space-y-6">
            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  危険な操作
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-destructive">アカウント削除</Label>
                  <p className="text-sm text-muted-foreground">
                    アカウントとパスワード再設定情報を削除します。商談・報告書・担当契約がある場合は削除できません。管理者への変更をご希望の場合は、管理者にご依頼ください。
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="flex items-center gap-2">
                      <Trash2 className="h-4 w-4" />
                      アカウントを削除
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-destructive">
                        アカウント削除の確認
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        本当にアカウントを削除しますか？この操作は取り消すことができません。
                        アカウントを削除するとログインできなくなります。企業情報や共有の業務データは削除されません。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>キャンセル</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => deleteAccountMutation.mutate()}
                        disabled={deleteAccountMutation.isPending}
                      >
                        {deleteAccountMutation.isPending ? "削除中..." : "削除実行"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
