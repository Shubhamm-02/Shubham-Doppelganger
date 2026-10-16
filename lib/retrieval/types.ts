export type RetrievedChunk = {
  documentId: number | null;
  kind: string;
  path: string;
  title: string;
  section: string;
  chunkIndex: number;
  url: string | null;
  content: string;
  score: number;
};
