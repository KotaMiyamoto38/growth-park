import { Header } from "@/components/layout/header";
import { SupporterList } from "@/components/supporters/supporter-list";

export default function SupportersPage() {
  return (
    <div className="space-y-6">
      <Header
        title="支援先情報"
        subtitle="サービス提供企業の管理と情報確認"
      />
      <div className="px-6">
        <SupporterList />
      </div>
    </div>
  );
}
