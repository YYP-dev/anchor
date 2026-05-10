"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  archiveNote,
  deleteNote,
  getNote,
  isStoredContentEmpty,
  NoteBackground,
  ArchiveDialog,
  DeleteDialog,
  RestoreDialog,
  PermanentDeleteDialog,
  ReadOnlyBanner,
  NoteEditorContent,
  NoteEditorHeader,
  restoreNote,
  permanentDeleteNote,
  ShareDialog,
  unarchiveNote,
  updateNote,
} from "@/features/notes";
import type { Note, UpdateNoteDto } from "@/features/notes";
import type { RichTextEditorHandle } from "@/features/notes/components/editor";
import { useAuth } from "@/features/auth";
import { useEditNoteModalStore } from "@/features/notes/edit-note-modal-store";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  decryptNoteContentUtf8,
  encryptNoteContentUtf8,
  getDekFromSession,
} from "@/features/encryption";

function syncEditorSavedSnapshot(
  ref: MutableRefObject<{
    title: string;
    content: string;
    isPinned: boolean;
    tagIds: string[];
    background: string | null;
    isEncrypted: boolean;
  } | null>,
  snapshot: {
    title: string;
    content: string;
    isPinned: boolean;
    tagIds: string[];
    background: string | null;
    isEncrypted: boolean;
  },
) {
  ref.current = snapshot;
}

export function EditNoteModal() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isOpen, noteId, seedNote, close } = useEditNoteModalStore();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [isArchived, setIsArchived] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [background, setBackground] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [permanentDeleteDialogOpen, setPermanentDeleteDialogOpen] =
    useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const contentEditorRef = useRef<RichTextEditorHandle | null>(null);
  const hydratedNoteIdRef = useRef<string | null>(null);
  const lastSavedRef = useRef<{
    title: string;
    content: string;
    isPinned: boolean;
    tagIds: string[];
    background: string | null;
    isEncrypted: boolean;
  } | null>(null);

  const queryEnabled = Boolean(isOpen && noteId);

  const { data: note, isPending, refetch: refetchNote } = useQuery({
    queryKey: ["notes", noteId],
    queryFn: () => getNote(noteId!),
    enabled: queryEnabled,
    placeholderData:
      seedNote && noteId && seedNote.id === noteId ? seedNote : undefined,
  });

  useEffect(() => {
    if (!isOpen || !noteId) return;
    hydratedNoteIdRef.current = null;
    lastSavedRef.current = null;
    setDeleteDialogOpen(false);
    setArchiveDialogOpen(false);
    setRestoreDialogOpen(false);
    setPermanentDeleteDialogOpen(false);
    setShareDialogOpen(false);
    setHasUnsavedChanges(false);
  }, [isOpen, noteId]);

  useEffect(() => {
    if (!note || hydratedNoteIdRef.current === note.id) return;

    let cancelled = false;
    const tagIds = note.tagIds || note.tags?.map((t) => t.id) || [];

    void (async () => {
      let displayContent = note.content || "";
      if (note.isEncrypted ?? false) {
        const dek = await getDekFromSession();
        if (!dek) {
          toast.error(
            "Unlock encrypted notes with your password using the banner first.",
          );
          displayContent = "";
        } else {
          try {
            displayContent = await decryptNoteContentUtf8(
              note.content || "",
              dek,
            );
          } catch {
            toast.error("Could not decrypt this note.");
            displayContent = "";
          }
        }
      }

      if (cancelled) return;

      setTitle(note.title);
      setContent(displayContent);
      setIsPinned(note.isPinned);
      setSelectedTagIds(tagIds);
      setBackground(note.background || null);
      setIsEncrypted(note.isEncrypted ?? false);
      syncEditorSavedSnapshot(lastSavedRef, {
        title: note.title,
        content: displayContent,
        isPinned: note.isPinned,
        tagIds,
        background: note.background ?? null,
        isEncrypted: note.isEncrypted ?? false,
      });
      hydratedNoteIdRef.current = note.id;
    })();

    return () => {
      cancelled = true;
    };
  }, [note]);

  useEffect(() => {
    if (note) {
      setIsArchived(note.isArchived);
    }
  }, [note]);

  const isOwner = note ? note.permission === "owner" : true;
  const isViewer = note ? note.permission === "viewer" : false;
  const isEditor = note ? note.permission === "editor" : false;
  const isReadOnly = note
    ? note.state === "trashed" || isViewer
    : false;
  const canUpload = (isOwner || isEditor) && !isEncrypted;
  const hasShares = (note?.shareIds?.length ?? 0) > 0;

  const getTitleForSave = useCallback(() => {
    return title.trim() === "" ? "Untitled" : title;
  }, [title]);

  const checkUnsavedChanges = useCallback(() => {
    if (!lastSavedRef.current) return false;
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
  }, [title, content, isPinned, selectedTagIds, background, isEncrypted]);

  const updateMutation = useMutation({
    mutationFn: (data: UpdateNoteDto) => updateNote(noteId!, data),
    onSuccess: (updatedNote) => {
      setIsEncrypted(updatedNote.isEncrypted ?? false);
      syncEditorSavedSnapshot(lastSavedRef, {
        title: updatedNote.title,
        content,
        isPinned: updatedNote.isPinned,
        tagIds: selectedTagIds,
        background: updatedNote.background ?? null,
        isEncrypted: updatedNote.isEncrypted ?? false,
      });
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.invalidateQueries({ queryKey: ["notes", noteId] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      setHasUnsavedChanges(false);
    },
    onError: () => {
      toast.error("Failed to save note");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteNote(noteId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      toast.success("Note moved to trash");
      close();
    },
    onError: () => {
      toast.error("Failed to delete note");
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveNote(noteId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.invalidateQueries({ queryKey: ["notes", "archive"] });
      queryClient.invalidateQueries({ queryKey: ["notes", noteId] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      toast.success("Note archived");
      close();
    },
    onError: () => {
      toast.error("Failed to archive note");
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: () => unarchiveNote(noteId!),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.invalidateQueries({ queryKey: ["notes", "archive"] });
      queryClient.invalidateQueries({ queryKey: ["notes", noteId] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      setIsArchived(false);
      hydratedNoteIdRef.current = null;
      await refetchNote();
      toast.success("Note unarchived");
    },
    onError: () => {
      toast.error("Failed to unarchive note");
    },
  });

  const restoreMutation = useMutation({
    mutationFn: () => restoreNote(noteId!),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.invalidateQueries({ queryKey: ["notes", "trash"] });
      queryClient.invalidateQueries({ queryKey: ["notes", noteId] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      hydratedNoteIdRef.current = null;
      await refetchNote();
      toast.success("Note restored");
    },
    onError: () => {
      toast.error("Failed to restore note");
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: () => permanentDeleteNote(noteId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.invalidateQueries({ queryKey: ["notes", "trash"] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      toast.success("Note permanently deleted");
      close();
    },
    onError: () => {
      toast.error("Failed to delete note");
    },
  });

  useEffect(() => {
    setHasUnsavedChanges(checkUnsavedChanges());
  }, [checkUnsavedChanges]);

  const save = useCallback(() => {
    if (!noteId || isReadOnly) return;
    if (updateMutation.isPending) return;
    if (!title.trim() && isStoredContentEmpty(content)) return;
    if (!checkUnsavedChanges()) return;

    void (async () => {
      let bodyContent = content || undefined;
      if (isEncrypted) {
        if (!user?.encryption) {
          toast.error("Your account does not have an encryption vault.");
          return;
        }
        const dek = await getDekFromSession();
        if (!dek) {
          toast.error("Unlock encrypted notes with your password using the banner first.");
          return;
        }
        bodyContent = await encryptNoteContentUtf8(content || "", dek);
      }

      updateMutation.mutate({
        title: getTitleForSave(),
        content: bodyContent,
        isPinned,
        background,
        tagIds: selectedTagIds,
        isEncrypted,
      });
    })();
  }, [
    noteId,
    isReadOnly,
    updateMutation.isPending,
    title,
    content,
    checkUnsavedChanges,
    getTitleForSave,
    isPinned,
    background,
    selectedTagIds,
    updateMutation,
    isEncrypted,
    user?.encryption,
  ]);

  useEffect(() => {
    if (!hasUnsavedChanges || isReadOnly || !queryEnabled) return;

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
  }, [hasUnsavedChanges, save, isReadOnly, queryEnabled]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      if (hasUnsavedChanges && !isReadOnly) {
        save();
      }
      close();
    }
  };

  const handleBack = () => {
    if (hasUnsavedChanges && !isReadOnly) {
      save();
    }
    close();
  };

  const togglePin = () => setIsPinned((prev) => !prev);

  const isSaving = updateMutation.isPending;
  const isSaved = !hasUnsavedChanges && !isSaving && !!note;
  const showLoading = queryEnabled && isPending && !note;

  return (
    <Dialog open={isOpen && !!noteId} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="!w-[80%] md:!w-[60%] xl:!w-[40%] !h-[70%] !max-w-none sm:!max-w-none p-0 overflow-hidden"
      >
        {showLoading ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 py-16">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
            <span className="text-sm text-muted-foreground">Loading note…</span>
          </div>
        ) : note ? (
          <div className="flex min-h-full flex-col relative">
            <NoteBackground
              styleId={background}
              className="absolute inset-0 z-0"
            />

            <div className="relative z-10 flex min-h-full flex-col overflow-hidden">
              <NoteEditorHeader
                isNew={false}
                isReadOnly={isReadOnly}
                isPinned={isPinned}
                isArchived={isArchived}
                background={background}
                isSaving={isSaving}
                hasUnsavedChanges={hasUnsavedChanges}
                isSaved={isSaved}
                isOwner={isOwner}
                permission={note.permission}
                isTrashed={note.state === "trashed"}
                hasShares={hasShares}
                shareAllowed={!(note.isEncrypted ?? false)}
                shareDisabledReason="Encrypted notes cannot be shared with collaborators."
                onBack={handleBack}
                onTogglePin={togglePin}
                onBackgroundChange={setBackground}
                onArchiveClick={() => setArchiveDialogOpen(true)}
                onDeleteClick={() => setDeleteDialogOpen(true)}
                onRestoreClick={() => setRestoreDialogOpen(true)}
                onPermanentDeleteClick={() => setPermanentDeleteDialogOpen(true)}
                onShareClick={() => setShareDialogOpen(true)}
                restorePending={restoreMutation.isPending}
                permanentDeletePending={permanentDeleteMutation.isPending}
              />

              {isReadOnly && (
                <ReadOnlyBanner
                  message={
                    note.state === "trashed"
                      ? "This note is in trash and cannot be edited. Restore it to make changes."
                      : "You have viewer access. Only the owner can edit this note."
                  }
                />
              )}

              <NoteEditorContent
                noteId={note.id}
                canUpload={canUpload}
                isOwner={isOwner}
                currentUserId={user?.id ?? null}
                title={title}
                content={content}
                selectedTagIds={selectedTagIds}
                attachmentCount={note.attachmentCount}
                isReadOnly={isReadOnly}
                isTrashed={note.state === "trashed"}
                editorWrapperClassName="h-[500px]"
                editorClassName="new-note-modal-editor min-h-0 h-full"
                titleInputRef={titleInputRef}
                contentEditorRef={contentEditorRef}
                onEnsureNoteIdForAttachmentUpload={async () => note.id}
                onTitleChange={setTitle}
                onContentChange={setContent}
                onTagsChange={setSelectedTagIds}
                belowAttachments={
                  isOwner && !isReadOnly && note.state === "active" ? (
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="edit-note-encrypt"
                        className="mt-0.5 border-border data-[disabled]:border-muted-foreground/50"
                        checked={isEncrypted}
                        disabled={
                          !user?.encryption ||
                          (!isEncrypted && hasShares)
                        }
                        onCheckedChange={(v) => {
                          const on = v === true;
                          if (on && !user?.encryption) {
                            toast.error(
                              "Encryption is only available for password sign-in accounts.",
                            );
                            return;
                          }
                          if (on && hasShares) {
                            toast.error(
                              "Remove all collaborators before enabling encryption.",
                            );
                            return;
                          }
                          setIsEncrypted(on);
                          setHasUnsavedChanges(true);
                        }}
                      />
                      <div className="space-y-1 min-w-0">
                        <Label
                          htmlFor="edit-note-encrypt"
                          className="text-sm font-medium cursor-pointer"
                        >
                          Encrypt note content
                        </Label>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          When enabled, the note body is encrypted with your vault before it leaves this browser.
                          Sharing and attachments are disabled for encrypted notes. Use your recovery key file if you
                          reset your password—without it, encrypted content cannot be restored.
                        </p>
                      </div>
                    </div>
                  ) : null
                }
              />

              <ArchiveDialog
                open={archiveDialogOpen}
                onOpenChange={setArchiveDialogOpen}
                isArchived={isArchived}
                onConfirm={() => {
                  if (isArchived) {
                    unarchiveMutation.mutate();
                  } else {
                    archiveMutation.mutate();
                  }
                  setArchiveDialogOpen(false);
                }}
                isPending={
                  archiveMutation.isPending || unarchiveMutation.isPending
                }
              />

              <RestoreDialog
                open={restoreDialogOpen}
                onOpenChange={setRestoreDialogOpen}
                onConfirm={() => {
                  restoreMutation.mutate();
                  setRestoreDialogOpen(false);
                }}
                isPending={restoreMutation.isPending}
              />

              <DeleteDialog
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
                onConfirm={() => {
                  deleteMutation.mutate();
                  setDeleteDialogOpen(false);
                }}
                isPending={deleteMutation.isPending}
              />

              <ShareDialog
                open={shareDialogOpen}
                onOpenChange={setShareDialogOpen}
                noteId={note.id}
              />

              <PermanentDeleteDialog
                open={permanentDeleteDialogOpen}
                onOpenChange={setPermanentDeleteDialogOpen}
                onConfirm={() => {
                  permanentDeleteMutation.mutate();
                  setPermanentDeleteDialogOpen(false);
                }}
                isPending={permanentDeleteMutation.isPending}
              />
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
