"use strict";
(() => {
  // src/index.ts
  var ZoteroPriceLookup = class {
    constructor(rootURI) {
      this.menuRegistered = false;
      this.rootURI = rootURI;
    }
    startup() {
      Zotero.log("ZoteroPriceLookup: startup");
    }
    shutdown() {
      Zotero.log("ZoteroPriceLookup: shutdown");
      this.menuRegistered = false;
    }
    onMainWindowLoad(win) {
      Zotero.log("ZoteroPriceLookup: onMainWindowLoad called");
      const _win = win;
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
            onCommand: (_event, context) => {
              const items = context.items || [];
              this.lookupPrices(items);
            }
          }
        ]
      });
      Zotero.log("ZoteroPriceLookup: menu registered via MenuManager");
    }
    onMainWindowUnload(_win) {
      Zotero.log("ZoteroPriceLookup: onMainWindowUnload called");
    }
    async lookupPrices(items) {
      const books = items.filter((item) => item.itemType === "book");
      if (books.length === 0) {
        this.notify(["No book items selected."], [""]);
        return;
      }
      let found = 0;
      let notFound = 0;
      let skipped = 0;
      const lines = [];
      const icons = [];
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
    getISBN(item) {
      const isbn = item.getField("ISBN");
      if (!isbn) return null;
      const normalized = isbn.split(/[\s,;]/)[0].replace(/-/g, "").trim();
      return normalized || null;
    }
    async fetchPrice(isbn) {
      const url = `https://api.openbd.jp/v1/get?isbn=${isbn}`;
      const response = await Zotero.HTTP.request("GET", url, { timeout: 1e4 });
      const data = JSON.parse(response.responseText);
      const priceObj = data[0]?.onix?.ProductSupply?.SupplyDetail?.Price?.[0];
      if (!priceObj) return null;
      const amount = Number(priceObj.PriceAmount);
      return `\xA5${amount.toLocaleString()}`;
    }
    getExtraField(item, key) {
      const extra = item.getField("extra") || "";
      const match = extra.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
      return match ? match[1].trim() : null;
    }
    setExtraField(item, key, value) {
      let extra = item.getField("extra") || "";
      const line = `${key}: ${value}`;
      const regex = new RegExp(`^${key}:.*$`, "m");
      extra = regex.test(extra) ? extra.replace(regex, line) : extra ? `${extra}
${line}` : line;
      item.setField("extra", extra);
    }
    notify(lines, icons) {
      const win = new Zotero.ProgressWindow({ closeOnClick: true });
      win.changeHeadline("Zotero Price Lookup");
      win.addLines(lines, icons);
      win.show();
      win.startCloseTimer(3e3);
    }
  };
  globalThis.ZoteroPriceLookup = ZoteroPriceLookup;
})();
