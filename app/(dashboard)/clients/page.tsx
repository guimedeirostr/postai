import { Users } from "lucide-react";

export default function ClientsPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Clientes</h1>
        <p className="text-slate-500 mt-1">Gerencie os perfis de marca dos seus clientes</p>
      </div>
      <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400">
        <Users className="w-10 h-10 mb-3 text-slate-300" />
        <p className="font-medium">Nenhum cliente cadastrado</p>
        <p className="text-sm mt-1">Implementado na Story S2</p>
      </div>
    </div>
  );
}
