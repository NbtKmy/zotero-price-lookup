declare const Zotero: any;

class ZoteroPriceLookup {
  private rootURI: string;
  private menuID = "zotero-price-lookup-action";

  constructor(rootURI: string) {
    this.rootURI = rootURI;
  }

  startup() {
    Zotero.log("ZoteroPriceLookup: startup");
  }

  shutdown() {
    Zotero.log("ZoteroPriceLookup: shutdown");
  }

  onMainWindowLoad(win: Window) {
    const _win = win as any;
    Zotero.log(`ZoteroPriceLookup: onMainWindowLoad called, readyState=${_win.document.readyState}`);
    if (_win.document.readyState === "complete") {
      this._registerMenu(_win.document);
    } else {
      _win.addEventListener("load", () => this._registerMenu(_win.document), { once: true });
    }
  }

  private _registerMenu(doc: any) {
    const itemmenu = doc.getElementById("zotero-itemmenu");
    if (!itemmenu) {
      Zotero.log("ZoteroPriceLookup: zotero-itemmenu not found");
      return;
    }

    const createEl = doc.createXULElement
      ? doc.createXULElement.bind(doc)
      : (tag: string) => doc.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", tag);

    const menuitem = createEl("menuitem");
    menuitem.id = this.menuID;
    menuitem.setAttribute("label", "Look up price");
    menuitem.addEventListener("command", () => {
      const items = Zotero.getActiveZoteroPane().getSelectedItems();
      this.lookupPrices(items);
    });
    itemmenu.appendChild(menuitem);
    Zotero.log("ZoteroPriceLookup: menu item registered");
  }

  onMainWindowUnload(win: Window) {
    const doc = (win as any).document;
    doc.getElementById(this.menuID)?.remove();
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
    win.startCloseTimer(5000);
    win.show();
  }
}

(globalThis as any).ZoteroPriceLookup = ZoteroPriceLookup;
