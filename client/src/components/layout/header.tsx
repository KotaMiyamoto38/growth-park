import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, Search, Filter } from "lucide-react";

interface HeaderProps {
  title: string;
  subtitle?: string;
  showFilters?: boolean;
  onFiltersChange?: (filters: any) => void;
}

export function Header({ title, subtitle, showFilters = false, onFiltersChange }: HeaderProps) {
  const { user } = useAuth();
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    connector: "",
    supporter: "",
    status: "",
  });

  // Fetch notifications for AddBox users
  const { data: notifications = [] } = useQuery({
    queryKey: ["/api/notifications"],
    enabled: user?.role === "AddBox",
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const unreadCount = notifications.filter((n: any) => !n.isRead).length;

  const handleFilterChange = (key: string, value: string) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFiltersChange?.(newFilters);
  };

  const applyFilters = () => {
    onFiltersChange?.(filters);
  };

  return (
    <header className="bg-background border-b border-border px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{title}</h2>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>

        <div className="flex items-center space-x-4">
          {/* Notification Bell - Only show for AddBox users */}
          {user?.role === "AddBox" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <Badge 
                      variant="destructive" 
                      className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                    >
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="end">
                <div className="p-4 border-b">
                  <h3 className="font-semibold">通知</h3>
                  <p className="text-sm text-muted-foreground">
                    {unreadCount > 0 ? `${unreadCount}件の未読通知があります` : "すべて既読です"}
                  </p>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">
                      通知はありません
                    </div>
                  ) : (
                    notifications.map((notification: any) => (
                      <div 
                        key={notification.id} 
                        className={`p-4 border-b hover:bg-muted cursor-pointer ${
                          !notification.isRead ? "bg-blue-50" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="text-sm font-medium">{notification.title}</p>
                            <p className="text-sm text-muted-foreground mt-1">
                              {notification.message}
                            </p>
                            <p className="text-xs text-muted-foreground mt-2">
                              {new Date(notification.createdAt).toLocaleString('ja-JP')}
                            </p>
                          </div>
                          {!notification.isRead && (
                            <div className="w-2 h-2 bg-blue-500 rounded-full ml-2 mt-1"></div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {/* Filters Section */}
      {showFilters && (
        <div className="mt-6 p-4 bg-card border border-border rounded-lg">
          <div className="flex items-center space-x-2 mb-4">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium text-foreground">フィルター</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start-date" className="text-sm">開始日</Label>
              <Input
                id="start-date"
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange("startDate", e.target.value)}
                autoComplete="off"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="end-date" className="text-sm">終了日</Label>
              <Input
                id="end-date"
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange("endDate", e.target.value)}
                autoComplete="off"
              />
            </div>
            
            {user?.role === "AddBox" && (
              <div className="space-y-2">
                <Label className="text-sm">コネクター</Label>
                <Select value={filters.connector} onValueChange={(value) => handleFilterChange("connector", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="全コネクター" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全コネクター</SelectItem>
                    <SelectItem value="1">株式会社A</SelectItem>
                    <SelectItem value="2">株式会社B</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <div className="space-y-2">
              <Label className="text-sm">支援先</Label>
              <Select value={filters.supporter} onValueChange={(value) => handleFilterChange("supporter", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="全支援先" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全支援先</SelectItem>
                  <SelectItem value="1">デジタルマーケティング</SelectItem>
                  <SelectItem value="2">クラウドソリューションズ</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-end">
              <Button onClick={applyFilters} className="w-full">
                <Filter className="h-4 w-4 mr-2" />
                フィルター適用
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
