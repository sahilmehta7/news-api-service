export interface ArticleDocument {
  id: string;
  feed_id: string;
  source_url: string;
  canonical_url: string | null;
  title: string;
  summary: string | null;
  content: string | null;
  author: string | null;
  language: string | null;
  keywords: string[];
  published_at: string | null;
  fetched_at: string;
  story_id: string | null;
  content_hash: string | null;
  has_embedding?: boolean;
  embedding?: number[];
}

export interface StoryDocument {
  story_id: string;
  title_rep: string | null;
  summary: string | null;
  keywords: string[];
  sources: string[];
  time_range_start: string | null;
  time_range_end: string | null;
  centroid_embedding?: number[];
}

export interface IndexHealth {
  exists: boolean;
  documentCount?: number;
  health?: string;
}

