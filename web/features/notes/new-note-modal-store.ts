"use client";

import { create } from "zustand";

interface NewNoteModalState {
  isOpen: boolean;
  tagId: string | null;
  open: (tagId?: string | null) => void;
  close: () => void;
}

export const useNewNoteModalStore = create<NewNoteModalState>((set) => ({
  isOpen: false,
  tagId: null,
  open: (tagId) => set({ isOpen: true, tagId: tagId ?? null }),
  close: () => set({ isOpen: false, tagId: null }),
}));
