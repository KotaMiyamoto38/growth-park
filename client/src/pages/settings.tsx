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
  AlertTriangle
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
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
        description: error.message || "アカウントの削除に失敗しました。",
        variant: "destructive",
      });
    },
  });

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
                    アカウントを削除すると、すべてのデータが完全に削除されます。この操作は取り消すことができません。
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
                        すべてのデータが完全に削除され、ログインできなくなります。
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