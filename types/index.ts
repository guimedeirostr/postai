import { Timestamp } from "firebase/firestore";

export interface Agency {
  id: string;
  name: string;
  email: string;
  photo_url: string | null;
  created_at: Timestamp;
}

export interface BrandProfile {
  id: string;
  agency_id: string;
  name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  fonts: string[];
  tone_of_voice: string;
  segment: string;
  target_audience: string;
  keywords: string[];
  avoid_words: string[];
  instagram_handle: string;
  bio: string;
  created_at: Timestamp;
}

export interface GeneratedPost {
  id: string;
  agency_id: string;
  client_id: string;
  client_name: string;
  theme: string;
  objective: string;
  format: "feed" | "stories" | "reels_cover";
  headline: string;
  caption: string;
  hashtags: string[];
  visual_prompt: string;
  image_url: string | null;
  status: "generating" | "ready" | "approved" | "rejected";
  created_at: Timestamp;
}
