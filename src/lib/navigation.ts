import type { NavItem } from "@/types/navigation";

export function isNavItemActive(
  pathname: string,
  item: Pick<NavItem, "href" | "matchPrefix" | "exact">,
): boolean {
  if (item.exact) return pathname === item.href;
  const prefix = item.matchPrefix ?? item.href;

  if (
    prefix === "/" ||
    prefix === "/platform" ||
    prefix === "/me" ||
    prefix === "/manager" ||
    prefix === "/ld" ||
    prefix === "/org" ||
    prefix === "/talent"
  ) {
    return pathname === prefix;
  }

  return pathname === item.href || pathname.startsWith(`${prefix}/`) || pathname === prefix;
}

export function findActiveSectionItemIds(
  pathname: string,
  items: NavItem[],
): { activeId?: string; expandIds: string[] } {
  const expandIds: string[] = [];
  let activeId: string | undefined;
  let bestScore = -1;

  const claim = (id: string, item: NavItem, parentId?: string) => {
    if (!isNavItemActive(pathname, item)) return;
    const score = (item.matchPrefix ?? item.href).length;
    if (score <= bestScore) return;
    bestScore = score;
    activeId = id;
    expandIds.length = 0;
    if (parentId) expandIds.push(parentId);
    else if (item.children?.length) expandIds.push(item.id);
  };

  for (const item of items) {
    if (item.children?.length) {
      for (const child of item.children) claim(child.id, child, item.id);
    }
    claim(item.id, item);
  }

  return { activeId, expandIds };
}
