import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Configurações</h1>
        <p className="text-slate-500 mt-1">Configurações da sua agência</p>
      </div>
      <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400">
        <Settings className="w-10 h-10 mb-3 text-slate-300" />
        <p className="font-medium">Em breve</p>
      </div>
    </div>
  );
}
