"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  createNote,
  isStoredContentEmpty,
  NoteBackground,
  NoteEditorContent,
  NoteEditorHeader,
} from "@/features/notes";
import type { CreateNoteDto, Note } from "@/features/notes";
import type { RichTextEditorHandle } from "@/features/notes/components/editor";
import { useAuth } from "@/features/auth";
import { useNewNoteModalStore } from "@/features/notes/new-note-modal-store";

export function NewNoteModal() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isOpen, tagId, close } = useNewNoteModalStore();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [background, setBackground] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingCreateNoteRef = useRef<Promise<Note> | null>(null);
  const createdNoteIdRef = useRef<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const contentEditorRef = useRef<RichTextEditorHandle | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: CreateNoteDto) => createNote(data),
    onSuccess: (newNote) => {
      createdNoteIdRef.current = newNote.id;
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      toast.success("Note created");
    },
    onError: () => {
      toast.error("Failed to create note");
    },
  });

  useEffect(() => {
    if (!isOpen) return;

    setTitle("");
    setContent("");
    setIsPinned(false);
    setBackground(null);
    setSelectedTagIds(tagId ? [tagId] : []);
    setHasUnsavedChanges(false);
    createdNoteIdRef.current = null;
  }, [isOpen, tagId]);

  useEffect(() => {
    if (!isOpen) return;
    const frame = window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  const getTitleForSave = useCallback(() => {
    return title.trim() === "" ? "Untitled" : title;
  }, [title]);

  const createNewNote = useCallback(() => {
    if (pendingCreateNoteRef.current) {
      return pendingCreateNoteRef.current;
    }

    const createPromise = createMutation.mutateAsync({
      title: getTitleForSave(),
      content: content || undefined,
      isPinned,
      background,
      tagIds: selectedTagIds,
    });

    pendingCreateNoteRef.current = createPromise.finally(() => {
      pendingCreateNoteRef.current = null;
    });

    return pendingCreateNoteRef.current;
  }, [background, content, createMutation, getTitleForSave, isPinned, selectedTagIds]);

  const save = useCallback(() => {
    if (createMutation.isPending) return;
    if (createdNoteIdRef.current) return;
    if (!title.trim() && isStoredContentEmpty(content)) return;
    void createNewNote();
  }, [content, createMutation.isPending, createNewNote, title]);

  useEffect(() => {
    if (!isOpen) return;
    setHasUnsavedChanges(title.trim() !== "" || !isStoredContentEmpty(content));
  }, [content, isOpen, title]);

  useEffect(() => {
    if (!isOpen || !hasUnsavedChanges) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      save();
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [hasUnsavedChanges, isOpen, save]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      if (hasUnsavedChanges && !createdNoteIdRef.current) {
        save();
      }
      close();
    }
  };

  const ensureNoteIdForAttachmentUpload = useCallback(async () => {
    if (createdNoteIdRef.current) {
      return createdNoteIdRef.current;
    }
    const newNote = await createNewNote();
    return newNote?.id ?? null;
  }, [createNewNote]);

  const isSaving = createMutation.isPending;
  const isSaved = !hasUnsavedChanges && !isSaving && !!createdNoteIdRef.current;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="!w-[80%] md:!w-[60%] xl:!w-[40%] !h-[70%] !max-w-none sm:!max-w-none p-0 overflow-hidden"
      >
        <div className="min-h-full flex flex-col relative">
          <NoteBackground styleId={background} className="absolute inset-0 z-0" />

          <div className="relative z-10 flex min-h-full flex-col overflow-hidden">
            <NoteEditorHeader
              isNew
              isReadOnly={false}
              isPinned={isPinned}
              isArchived={false}
              background={background}
              isSaving={isSaving}
              hasUnsavedChanges={hasUnsavedChanges}
              isSaved={isSaved}
              onBack={close}
              onTogglePin={() => setIsPinned((prev) => !prev)}
              onBackgroundChange={setBackground}
              onArchiveClick={() => {}}
              onDeleteClick={() => {}}
              onRestoreClick={() => {}}
              onPermanentDeleteClick={() => {}}
            />

            <NoteEditorContent
              noteId={createdNoteIdRef.current ?? undefined}
              canUpload
              isOwner
              currentUserId={user?.id ?? null}
              title={title}
              content={content}
              selectedTagIds={selectedTagIds}
              isReadOnly={false}
              editorWrapperClassName="h-[500px]"
              editorClassName="new-note-modal-editor min-h-0 h-full"
              titleInputRef={titleInputRef}
              contentEditorRef={contentEditorRef}
              onEnsureNoteIdForAttachmentUpload={ensureNoteIdForAttachmentUpload}
              onTitleChange={setTitle}
              onContentChange={setContent}
              onTagsChange={setSelectedTagIds}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
