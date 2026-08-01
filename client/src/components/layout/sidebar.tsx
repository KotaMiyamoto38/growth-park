import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Handshake,
  Building,
  Users,
  FileText,
  File,
  Settings,
  LogOut,
  Rocket,
  DollarSign,
} from "lucide-react";

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  if (!user) return null;

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "AddBox":
        return <Badge className="bg-primary/10 text-primary">Master</Badge>;
      case "Connector":
        return <Badge variant="secondary">Connector</Badge>;
      case "Supporter":
        return <Badge variant="outline">Supporter</Badge>;
      default:
        return <Badge variant="outline">Client</Badge>;
    }
  };

  const getPageTitle = (role: string) => {
    switch (role) {
      case "AddBox":
        return "Master画面";
      case "Connector":
        return "Connector画面";
      default:
        return "Growth Park";
    }
  };

  const getNavigationItems = () => {
    if (user.role === "Connector") {
      return [
        {
          name: "ダッシュボード",
          href: `/connectors/${user.id}`,
          icon: LayoutDashboard,
          roles: ["Connector"],
        },
        {
          name: "商談管理",
          href: `/connectors/${user.id}/leads`,
          icon: Handshake,
          roles: ["Connector"],
        },
        {
          name: "支援先情報",
          href: "/supporters",
          icon: Building,
          roles: ["Connector"],
        },
        {
          name: "月末請求",
          href: `/connectors/${user.id}/billing`,
          icon: () => <span className="h-5 w-5 flex items-center justify-center text-lg">¥</span>,
          roles: ["Connector"],
        },
        {
          name: "設定",
          href: "/settings",
          icon: Settings,
          roles: ["Connector"],
        },
      ];
    }
    
    return [
      {
        name: "ダッシュボード",
        href: "/",
        icon: LayoutDashboard,
        roles: ["AddBox", "Supporter"],
      },
      {
        name: "商談管理",
        href: "/leads",
        icon: Handshake,
        roles: ["AddBox", "Supporter"],
      },
      {
        name: "支援先情報",
        href: "/supporters",
        icon: Building,
        roles: ["AddBox"],
      },
      {
        name: "月末請求",
        href: "/billing",
        icon: () => <span className="h-5 w-5 flex items-center justify-center text-lg">¥</span>,
        roles: ["AddBox"],
      },
      {
        name: "設定",
        href: "/settings",
        icon: Settings,
        roles: ["AddBox", "Supporter"],
      },
    ];
  };

  const navigation = getNavigationItems();

  const filteredNavigation = navigation.filter((item) =>
    item.roles.includes(user.role)
  );

  return (
    <aside className={`w-64 bg-sidebar border-r border-sidebar-border flex flex-col fixed h-screen ${className}`}>
      {/* Logo Section */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Rocket className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-sidebar-foreground">Growth Park</h1>
            <p className="text-sm text-muted-foreground">by ZETTAICHI</p>
          </div>
        </div>
      </div>

      {/* User Info */}
      <div className="px-6 py-4 border-b border-sidebar-border">
        <div className="flex items-center space-x-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary text-primary-foreground">
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {user.name}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {user.companyName || (user.role === "AddBox" ? "ZETTAICHI" : user.role)}
            </p>
          </div>

        </div>
        {/* Logout Button */}
        <div className="mt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="w-full justify-start text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4 mr-2" />
            ログアウト
          </Button>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
        {filteredNavigation.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href;
          
          return (
            <Link key={item.name} href={item.href}>
              <a
                className={`sidebar-item ${
                  isActive ? "sidebar-item-active" : "sidebar-item-inactive"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{item.name}</span>
              </a>
            </Link>
          );
        })}
      </nav>


    </aside>
  );
}
