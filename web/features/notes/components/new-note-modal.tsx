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
  updateNote,
} from "@/features/notes";
import type { CreateNoteDto, Note, UpdateNoteDto } from "@/features/notes";
import type { RichTextEditorHandle } from "@/features/notes/components/editor";
import { useAuth } from "@/features/auth";
import { useNewNoteModalStore } from "@/features/notes/new-note-modal-store";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  encryptNoteContentUtf8,
  getDekFromSession,
} from "@/features/encryption";

export function NewNoteModal() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isOpen, tagId, close } = useNewNoteModalStore();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [background, setBackground] = useState<string | null>(null);
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingCreateNoteRef = useRef<Promise<Note> | null>(null);
  const createdNoteIdRef = useRef<string | null>(null);
  const lastSavedRef = useRef<{
    title: string;
    content: string;
    isPinned: boolean;
    tagIds: string[];
    background: string | null;
    isEncrypted: boolean;
  } | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const contentEditorRef = useRef<RichTextEditorHandle | null>(null);

  const [persistedNoteId, setPersistedNoteId] = useState<string | null>(null);

  const syncLastSavedFromNote = useCallback((note: Note) => {
    const tagIds = note.tagIds || note.tags?.map((t) => t.id) || [];
    lastSavedRef.current = {
      title: note.title,
      content: note.content || "",
      isPinned: note.isPinned,
      tagIds,
      background: note.background ?? null,
      isEncrypted: note.isEncrypted ?? false,
    };
    setIsEncrypted(note.isEncrypted ?? false);
  }, []);

  const createMutation = useMutation({
    mutationFn: (data: CreateNoteDto) => createNote(data),
    onSuccess: (newNote) => {
      createdNoteIdRef.current = newNote.id;
      setPersistedNoteId(newNote.id);
      setIsEncrypted(newNote.isEncrypted ?? false);
      syncLastSavedFromNote(newNote);
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      toast.success("Note created");
    },
    onError: () => {
      toast.error("Failed to create note");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: UpdateNoteDto & { id: string }) =>
      updateNote(id, data),
    onSuccess: (updatedNote) => {
      setIsEncrypted(updatedNote.isEncrypted ?? false);
      syncLastSavedFromNote(updatedNote);
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.invalidateQueries({ queryKey: ["notes", updatedNote.id] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      setHasUnsavedChanges(false);
    },
    onError: () => {
      toast.error("Failed to save note");
    },
  });

  useEffect(() => {
    if (!isOpen) return;

    setTitle("");
    setContent("");
    setIsPinned(false);
    setBackground(null);
    setIsEncrypted(false);
    setSelectedTagIds(tagId ? [tagId] : []);
    setHasUnsavedChanges(false);
    createdNoteIdRef.current = null;
    lastSavedRef.current = null;
    setPersistedNoteId(null);
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

    const run = async () => {
      let bodyContent = content || undefined;
      if (isEncrypted) {
        if (!user?.encryption) {
          toast.error("Encrypted notes need a password account with encryption.");
          throw new Error("no vault");
        }
        const dek = await getDekFromSession();
        if (!dek) {
          toast.error("Unlock encrypted notes with your password using the banner first.");
          throw new Error("no dek");
        }
        bodyContent = await encryptNoteContentUtf8(content || "", dek);
      }
      return createMutation.mutateAsync({
        title: getTitleForSave(),
        content: bodyContent,
        isPinned,
        background,
        tagIds: selectedTagIds,
        isEncrypted,
      });
    };

    const createPromise = run().finally(() => {
      pendingCreateNoteRef.current = null;
    });

    pendingCreateNoteRef.current = createPromise;
    return pendingCreateNoteRef.current;
  }, [
    background,
    content,
    createMutation,
    getTitleForSave,
    isEncrypted,
    isPinned,
    selectedTagIds,
    user?.encryption,
  ]);

  const checkUnsavedChanges = useCallback(() => {
    if (!persistedNoteId) {
      return (
        title.trim() !== "" ||
        !isStoredContentEmpty(content) ||
        isPinned ||
        selectedTagIds.length > 0 ||
        background !== null ||
        isEncrypted
      );
    }
    if (!lastSavedRef.current) return true;
    const saved = lastSavedRef.current;
    return (
      title !== saved.title ||
      content !== saved.content ||
      isPinned !== saved.isPinned ||
      background !== saved.background ||
      isEncrypted !== saved.isEncrypted ||
      JSON.stringify([...selectedTagIds].sort()) !==
        JSON.stringify([...saved.tagIds].sort())
    );
  }, [
    background,
    content,
    isEncrypted,
    isPinned,
    persistedNoteId,
    selectedTagIds,
    title,
  ]);

  const save = useCallback(() => {
    if (createMutation.isPending || updateMutation.isPending) return;

    const noteId = createdNoteIdRef.current;

    if (!noteId) {
      if (!title.trim() && isStoredContentEmpty(content)) return;
      void createNewNote();
      return;
    }

    if (!checkUnsavedChanges()) return;

    void (async () => {
      let bodyContent = content || undefined;
      if (isEncrypted) {
        const dek = await getDekFromSession();
        if (!dek) {
          toast.error("Unlock encrypted notes with your password using the banner first.");
          return;
        }
        bodyContent = await encryptNoteContentUtf8(content || "", dek);
      }
      updateMutation.mutate({
        id: noteId,
        title: getTitleForSave(),
        content: bodyContent,
        isPinned,
        background,
        tagIds: selectedTagIds,
        isEncrypted,
      });
    })();
  }, [
    checkUnsavedChanges,
    content,
    createMutation.isPending,
    createNewNote,
    getTitleForSave,
    isEncrypted,
    isPinned,
    background,
    selectedTagIds,
    title,
    updateMutation,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    setHasUnsavedChanges(checkUnsavedChanges());
  }, [checkUnsavedChanges, isOpen]);

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
      if (hasUnsavedChanges) {
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

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isSaved =
    !hasUnsavedChanges && !isSaving && !!createdNoteIdRef.current;

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
              noteId={persistedNoteId ?? undefined}
              canUpload={!isEncrypted}
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
              belowAttachments={
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="new-note-encrypt"
                    className="mt-0.5 border-border data-[disabled]:border-muted-foreground/50"
                    checked={isEncrypted}
                    disabled={!user?.encryption}
                    onCheckedChange={(v) => {
                      const on = v === true;
                      if (on && !user?.encryption) {
                        toast.error("Encryption is only available for password sign-in accounts.");
                        return;
                      }
                      setIsEncrypted(on);
                      setHasUnsavedChanges(true);
                    }}
                  />
                  <div className="space-y-1 min-w-0">
                    <Label htmlFor="new-note-encrypt" className="text-sm font-medium cursor-pointer">
                      Encrypt this note (optional)
                    </Label>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Encrypted notes use your account password (this session) and the same recovery key file you
                      downloaded at registration. Encrypted content is not searchable by body text, and sharing and
                      attachments are disabled. Store your recovery file offline; without it, a password reset cannot
                      unlock your encrypted notes.
                    </p>
                    {!user?.encryption && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        If this stays disabled after sign-up, refresh the page or sign out and back in so your session
                        includes vault metadata.
                      </p>
                    )}
                  </div>
                </div>
              }
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
