/**
 * Resolves screen URLs from the app menu (GET /security/menu/appmenu).
 *
 * Menu queryParams are the source of truth: the moduleId of a screen often differs
 * from the menu section it lives in (e.g. Cash Deposit -> moduleId=deposit), and a
 * wrong moduleId makes the app answer "Access Denied".
 */
export interface MenuItem {
  label: string;
  routerLink?: string;
  queryParams?: Record<string, string>;
  items?: MenuItem[];
}

interface AppMenu {
  moduleItems: Record<string, { orderNum: number; module: { label: string; items: MenuItem[] } }>;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

export class Menu {
  private readonly leaves = new Map<string, MenuItem>();

  constructor(raw: AppMenu) {
    const walk = (items: MenuItem[] | undefined, path: string[]) => {
      for (const it of items ?? []) {
        const p = [...path, it.label];
        if (it.items?.length) walk(it.items, p);
        else if (it.routerLink) this.leaves.set(p.map(norm).join(' > '), it);
      }
    };
    for (const m of Object.values(raw.moduleItems)) walk(m.module.items, [m.module.label]);
  }

  /** Hash URL for a menu path, e.g. "CRM > Operations > Registration > Individual Customer". */
  url(path: string): string {
    const key = path.split('>').map(norm).join(' > ');
    const item = this.leaves.get(key);
    if (!item) throw new Error(`Menu item not found: "${path}"`);
    const qs = new URLSearchParams(item.queryParams ?? {}).toString();
    return `/#${item.routerLink}${qs ? `?${qs}` : ''}`;
  }
}
