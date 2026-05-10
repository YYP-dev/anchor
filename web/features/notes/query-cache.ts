import type { QueryClient } from "@tanstack/react-query";
import type { Note } from "./types";

function getNotesQueryScope(queryKey: readonly unknown[]): "active" | "tag" | "archive" | "trash" | "other" {
  if (queryKey[0] !== "notes") return "other";
  if (queryKey.length < 2 || queryKey[1] == null) return "active";

  const scope = queryKey[1];
  if (scope === "archive") return "archive";
  if (scope === "trash") return "trash";
  if (typeof scope === "string") return "tag";
  return "other";
}

function shouldIncludeCreatedNoteInQuery(queryKey: readonly unknown[], note: Note): boolean {
  const scope = getNotesQueryScope(queryKey);

  if (scope === "active") {
    return note.state === "active" && !note.isArchived;
  }
  if (scope === "tag") {
    const tagId = queryKey[1];
    if (typeof tagId !== "string") return false;
    return (
      note.state === "active" &&
      !note.isArchived &&
      (note.tagIds?.includes(tagId) ?? false)
    );
  }
  return false;
}

export function addCreatedNoteToListCaches(queryClient: QueryClient, note: Note): void {
  const queries = queryClient.getQueryCache().findAll({ queryKey: ["notes"] });

  for (const query of queries) {
    const queryKey = query.queryKey;
    const current = query.state.data;
    if (!Array.isArray(current)) continue;
    if (!shouldIncludeCreatedNoteInQuery(queryKey, note)) continue;
    if (current.some((item) => item.id === note.id)) continue;

    queryClient.setQueryData<Note[]>(queryKey, [note, ...current]);
  }
}

export function removeNoteFromListCaches(
  queryClient: QueryClient,
  noteId: string,
): void {
  const queries = queryClient.getQueryCache().findAll({ queryKey: ["notes"] });

  for (const query of queries) {
    const queryKey = query.queryKey;
    const scope = getNotesQueryScope(queryKey);
    if (scope === "trash" || scope === "archive") continue;

    const current = query.state.data;
    if (!Array.isArray(current)) continue;

    queryClient.setQueryData<Note[]>(
      queryKey,
      current.filter((note) => note.id !== noteId),
    );
  }
}
