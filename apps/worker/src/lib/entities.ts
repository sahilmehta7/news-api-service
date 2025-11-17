export interface ExtractedEntity {
  text: string;
  canonical?: string;
  type: "PERSON" | "ORG" | "GPE" | "PRODUCT" | "EVENT" | "WORK" | "OTHER";
  salience?: number;
  start?: number;
  end?: number;
}

export async function extractEntities(
  text: string,
  language?: string | null
): Promise<ExtractedEntity[]> {
  // Placeholder; integrate spaCy/transformer service later
  if (!text || text.length < 20) return [];
  return [];
}


