import type { NavItem } from "@/types/navigation";

export function isNavItemActive(
  pathname: string,
  item: Pick<NavItem, "href" | "matchPrefix">,
): boolean {
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

  for (const item of items) {
    if (item.children?.length) {
      const childHit = item.children.find((child) =>
        isNavItemActive(pathname, child),
      );
      if (childHit) {
        expandIds.push(item.id);
        activeId = childHit.id;
        continue;
      }
    }

    if (isNavItemActive(pathname, item)) {
      activeId = item.id;
      if (item.children?.length) {
        expandIds.push(item.id);
      }
    }
  }

  return { activeId, expandIds };
}
