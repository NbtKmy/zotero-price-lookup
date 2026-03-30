declare const Zotero: any;

class ZoteroPriceLookup {
  private rootURI: string;
  private menuRegistered = false;

  constructor(rootURI: string) {
    this.rootURI = rootURI;
  }

  startup() {
    Zotero.log("ZoteroPriceLookup: startup");
  }

  shutdown() {
    Zotero.log("ZoteroPriceLookup: shutdown");
    this.menuRegistered = false;
  }

  onMainWindowLoad(win: Window) {
    Zotero.log("ZoteroPriceLookup: onMainWindowLoad called");
    const _win = win as any;

    // Load plugin FTL into this window's l10n context.
    // Zotero auto-registers plugin locale files but does not load them into
    // document l10n automatically (MenuManager TODO). We call insertFTLIfNeeded
    // ourselves, mirroring the planned MenuManager behavior.
    try {
      _win.MozXULElement.insertFTLIfNeeded("zotero-price-lookup.ftl");
      Zotero.log("ZoteroPriceLookup: FTL inserted");
    } catch (e) {
      Zotero.log("ZoteroPriceLookup: FTL insert error: " + e);
    }

    if (this.menuRegistered) return;
    this.menuRegistered = true;
    Zotero.MenuManager.registerMenu({
      menuID: "zotero-price-lookup-action",
      pluginID: "zotero-price-lookup@nbtkmy.org",
      target: "main/library/item",
      menus: [
        {
          menuType: "menuitem",
          l10nID: "zotero-price-lookup-menu-label",
          onCommand: (_event: any, context: any) => {
            const items: any[] = context.items || [];
            this.lookupPrices(items);
          },
        },
      ],
    });
    Zotero.log("ZoteroPriceLookup: menu registered via MenuManager");
  }

  onMainWindowUnload(_win: Window) {
    Zotero.log("ZoteroPriceLookup: onMainWindowUnload called");
  }

  private async lookupPrices(items: any[]) {
    const books = items.filter((item) => item.itemType === "book");

    if (books.length === 0) {
      this.notify(["No book items selected."], [""]);
      return;
    }

    let found = 0;
    let notFound = 0;
    let skipped = 0;
    const lines: string[] = [];
    const icons: string[] = [];

    for (const item of books) {
      const isbn = this.getISBN(item);
      Zotero.log(`ZoteroPriceLookup: itemType=${item.itemType}, isbn=${isbn}, rawISBN=${item.getField("ISBN")}`);
      if (!isbn) {
        skipped++;
        lines.push(`${item.getField("title") || "Unknown"}: no ISBN`);
        icons.push("");
        continue;
      }

      try {
        const price = await this.fetchPrice(isbn);
        if (price === null) {
          notFound++;
          lines.push(`${item.getField("title") || isbn}: not found`);
          icons.push("");
        } else {
          found++;
          this.setExtraField(item, "Price", price);
          await item.saveTx();
          lines.push(`${item.getField("title") || isbn}: ${price}`);
          icons.push("");
        }
      } catch (e) {
        skipped++;
        lines.push(`${item.getField("title") || isbn}: error: ${e}`);
        icons.push("");
        Zotero.log(`ZoteroPriceLookup error: ${e}`);
      }
    }

    lines.unshift(`Found: ${found} / Not found: ${notFound} / Skipped: ${skipped}`);
    icons.unshift("");
    this.notify(lines, icons);
  }

  private getISBN(item: any): string | null {
    const isbn = item.getField("ISBN");
    if (!isbn) return null;
    // Normalize: remove hyphens and spaces, take first ISBN if multiple
    const normalized = isbn.split(/[\s,;]/)[0].replace(/-/g, "").trim();
    return normalized || null;
  }

  private async fetchPrice(isbn: string): Promise<string | null> {
    const url = `https://api.openbd.jp/v1/get?isbn=${isbn}`;
    const response = await Zotero.HTTP.request("GET", url, { timeout: 10000 });
    const data = JSON.parse(response.responseText);
    const priceObj = data[0]?.onix?.ProductSupply?.SupplyDetail?.Price?.[0];
    if (!priceObj) return null;
    const amount = Number(priceObj.PriceAmount);
    return `¥${amount.toLocaleString()}`;
  }

  private getExtraField(item: any, key: string): string | null {
    const extra = item.getField("extra") || "";
    const match = extra.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
    return match ? match[1].trim() : null;
  }

  private setExtraField(item: any, key: string, value: string) {
    let extra = item.getField("extra") || "";
    const line = `${key}: ${value}`;
    const regex = new RegExp(`^${key}:.*$`, "m");
    extra = regex.test(extra)
      ? extra.replace(regex, line)
      : extra
      ? `${extra}\n${line}`
      : line;
    item.setField("extra", extra);
  }

  private notify(lines: string[], icons: string[]) {
    const win = new Zotero.ProgressWindow({ closeOnClick: true });
    win.changeHeadline("Zotero Price Lookup");
    win.addLines(lines, icons);
    win.show();
    win.startCloseTimer(3000);
  }
}

(globalThis as any).ZoteroPriceLookup = ZoteroPriceLookup;
