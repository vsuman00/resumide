// In-memory store for the latest analysis(es). Replaces usePuterStore for
// the analysis path. Ponytail: persistence (Supabase) deferred until needed.
import { create } from "zustand";

interface AnalysisEntry {
  id: string;
  jobTitle: string;
  jobDescription: string;
  pdf: Blob;
  result: AnalysisResult;
}

interface AnalysisStore {
  entries: Record<string, AnalysisEntry>;
  set: (id: string, entry: AnalysisEntry) => void;
  get: (id: string) => AnalysisEntry | undefined;
  list: () => AnalysisEntry[];
}

export const useAnalysisStore = create<AnalysisStore>((set, get) => ({
  entries: {},
  set: (id, entry) => set((s) => ({ entries: { ...s.entries, [id]: entry } })),
  get: (id) => get().entries[id],
  list: () => Object.values(get().entries),
}));
