import type { FirestoreDataConverter, DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import type {
  PostV3, Flow, Asset, BrandKit, ClientMemory,
  GenerationJob, SlideV3, AssetEmbedding,
} from "@/types";

function make<T extends { id?: string }>(): FirestoreDataConverter<T> {
  return {
    toFirestore: (data: T): DocumentData => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, ...rest } = data as T & { id?: string };
      return rest as DocumentData;
    },
    fromFirestore: (snap: QueryDocumentSnapshot): T =>
      ({ id: snap.id, ...snap.data() }) as T,
  };
}

export const postV3Converter      = make<PostV3>();
export const flowConverter         = make<Flow>();
export const assetConverter        = make<Asset>();
export const brandKitConverter     = make<BrandKit>();
export const clientMemoryConverter = make<ClientMemory>();
export const jobConverter          = make<GenerationJob>();
export const slideV3Converter      = make<SlideV3>();
export const embeddingConverter    = make<AssetEmbedding>();
