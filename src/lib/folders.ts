import { Folder } from '@/types'

/** A folder enriched with its children and tree depth, ready to render. */
export interface FolderNode extends Folder {
  children: FolderNode[]
  depth: number
}

/** Minimal folder shape needed for hierarchy maths (works for server rows too). */
export type FolderRef = { id: string; parentId?: string | null }

/**
 * Builds a nested tree from a flat list of folders.
 * Siblings are sorted alphabetically (locale-aware). Folders whose parent is
 * missing from the list are treated as roots so nothing is ever hidden.
 */
export function buildFolderTree(folders: Folder[]): FolderNode[] {
  const ids = new Set(folders.map((f) => f.id))
  const byParent = new Map<string | null, Folder[]>()

  for (const f of folders) {
    const key = f.parentId && ids.has(f.parentId) ? f.parentId : null
    const bucket = byParent.get(key)
    if (bucket) bucket.push(f)
    else byParent.set(key, [f])
  }

  const build = (parentId: string | null, depth: number): FolderNode[] =>
    (byParent.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      .map((f) => ({ ...f, depth, children: build(f.id, depth + 1) }))

  return build(null, 0)
}

/** Returns the ids of every descendant of `folderId` (children, grandchildren…). */
export function getDescendantIds(folderId: string, folders: FolderRef[]): string[] {
  const childrenOf = new Map<string, string[]>()
  for (const f of folders) {
    if (!f.parentId) continue
    const bucket = childrenOf.get(f.parentId)
    if (bucket) bucket.push(f.id)
    else childrenOf.set(f.parentId, [f.id])
  }

  const result: string[] = []
  const stack = [...(childrenOf.get(folderId) ?? [])]
  while (stack.length) {
    const current = stack.pop()!
    result.push(current)
    const kids = childrenOf.get(current)
    if (kids) stack.push(...kids)
  }
  return result
}

/** True when `candidateId` is `folderId` itself or any folder nested inside it. */
export function isSelfOrDescendant(
  folderId: string,
  candidateId: string,
  folders: FolderRef[],
): boolean {
  if (folderId === candidateId) return true
  return getDescendantIds(folderId, folders).includes(candidateId)
}

/** Expands a list of folder ids to also include all of their descendants. */
export function expandWithDescendants(ids: string[], folders: FolderRef[]): Set<string> {
  const full = new Set(ids)
  for (const id of ids) {
    for (const d of getDescendantIds(id, folders)) full.add(d)
  }
  return full
}

/**
 * Given an item whose parent chain may pass through folders being deleted,
 * walks up until it finds a surviving ancestor (or returns null for the root).
 * Used to re-home leads/subfolders when their folder is deleted.
 */
export function resolveSurvivingParent(
  startParentId: string | null,
  deleteIds: Set<string>,
  folders: FolderRef[],
): string | null {
  const parentOf = new Map(folders.map((f) => [f.id, f.parentId ?? null]))
  let current: string | null = startParentId
  const seen = new Set<string>()
  while (current && deleteIds.has(current) && !seen.has(current)) {
    seen.add(current)
    current = parentOf.get(current) ?? null
  }
  return current ?? null
}

/** Returns the chain of folders from the root down to (and including) `folderId`. */
export function getFolderPath(folderId: string, folders: Folder[]): Folder[] {
  const byId = new Map(folders.map((f) => [f.id, f]))
  const path: Folder[] = []
  const seen = new Set<string>()
  let current: string | null | undefined = folderId

  while (current && !seen.has(current)) {
    seen.add(current)
    const folder = byId.get(current)
    if (!folder) break
    path.unshift(folder)
    current = folder.parentId ?? null
  }
  return path
}
