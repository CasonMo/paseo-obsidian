import type { NoteSummary } from "../shared/contracts";

export interface TreeNode {
  name: string;
  path: string;
  kind: "folder" | "note";
  children: TreeNode[];
  note: NoteSummary | null;
  count: number;
}

export interface TreeRow {
  key: string;
  kind: "folder" | "note";
  depth: number;
  name: string;
  path: string;
  count: number;
  note: NoteSummary | null;
  expanded: boolean;
}

function sortNodes(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const node of nodes) {
    if (node.kind === "folder") sortNodes(node.children);
  }
}

function countNotes(node: TreeNode): number {
  if (node.kind === "note") return 1;
  node.count = node.children.reduce((total, child) => total + countNotes(child), 0);
  return node.count;
}

/** 由笔记的 vault 相对路径建目录树。只出现含笔记的目录。 */
export function buildTree(notes: NoteSummary[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", kind: "folder", children: [], note: null, count: 0 };
  const folders = new Map<string, TreeNode>([["", root]]);
  for (const note of notes) {
    const segments = note.path.split("/");
    let parent = root;
    let prefix = "";
    for (let index = 0; index < segments.length - 1; index += 1) {
      prefix = prefix ? `${prefix}/${segments[index]}` : segments[index];
      let folder = folders.get(prefix);
      if (!folder) {
        folder = { name: segments[index], path: prefix, kind: "folder", children: [], note: null, count: 0 };
        folders.set(prefix, folder);
        parent.children.push(folder);
      }
      parent = folder;
    }
    parent.children.push({
      name: segments[segments.length - 1].replace(/\.md$/i, ""),
      path: note.path,
      kind: "note",
      children: [],
      note,
      count: 1,
    });
  }
  sortNodes(root.children);
  countNotes(root);
  return root.children;
}

export function flattenTree(nodes: TreeNode[], expanded: ReadonlySet<string>, depth = 0): TreeRow[] {
  const rows: TreeRow[] = [];
  for (const node of nodes) {
    const isExpanded = node.kind === "folder" && expanded.has(node.path);
    rows.push({
      key: `${node.kind}:${node.path}`,
      kind: node.kind,
      depth,
      name: node.name,
      path: node.path,
      count: node.count,
      note: node.note,
      expanded: isExpanded,
    });
    if (isExpanded) rows.push(...flattenTree(node.children, expanded, depth + 1));
  }
  return rows;
}