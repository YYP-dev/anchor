"use client";

import { create } from "zustand";
import type { Note } from "@/features/notes";

interface EditNoteModalState {
  isOpen: boolean;
  noteId: string | null;
  /** List/card payload for instant UI before GET completes */
  seedNote: Note | null;
  open: (noteId: string, seedNote?: Note | null) => void;
  close: () => void;
}

export const useEditNoteModalStore = create<EditNoteModalState>((set) => ({
  isOpen: false,
  noteId: null,
  seedNote: null,
  open: (noteId, seedNote = null) =>
    set({ isOpen: true, noteId, seedNote: seedNote ?? null }),
  close: () => set({ isOpen: false, noteId: null, seedNote: null }),
}));
