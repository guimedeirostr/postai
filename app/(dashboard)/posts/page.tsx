import { ImageIcon } from "lucide-react";

export default function PostsPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Posts Gerados</h1>
        <p className="text-slate-500 mt-1">Todos os posts criados pela IA para seus clientes</p>
      </div>
      <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400">
        <ImageIcon className="w-10 h-10 mb-3 text-slate-300" />
        <p className="font-medium">Nenhum post gerado ainda</p>
        <p className="text-sm mt-1">Implementado nas Stories S3 e S4</p>
      </div>
    </div>
  );
}
