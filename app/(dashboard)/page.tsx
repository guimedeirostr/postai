export const dynamic = "force-dynamic";

import { Sparkles, Users, ImageIcon, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const stats = [
  { label: "Clientes",        value: "0", icon: Users,      color: "text-violet-600", bg: "bg-violet-50" },
  { label: "Posts Gerados",   value: "0", icon: ImageIcon,  color: "text-blue-600",   bg: "bg-blue-50"   },
  { label: "Posts Aprovados", value: "0", icon: TrendingUp, color: "text-green-600",  bg: "bg-green-50"  },
];

export default function DashboardPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">Bem-vindo ao PostAI — seu designer de posts com IA</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">{label}</CardTitle>
              <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-slate-900">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-0 shadow-sm border-dashed border-2 border-violet-200 bg-violet-50/30">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center mb-4">
            <Sparkles className="w-7 h-7 text-violet-600" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Comece cadastrando um cliente</h2>
          <p className="text-slate-500 text-sm max-w-sm">
            Adicione o perfil de marca do seu cliente e a IA vai gerar posts no estilo exato da marca dele.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
