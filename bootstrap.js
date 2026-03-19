var addon;

function startup({ id, version, rootURI }, reason) {
  try {
    Zotero.log("ZoteroPriceLookup: startup begin, rootURI=" + rootURI);
    Services.scriptloader.loadSubScript(`${rootURI}addon/content/index.js`);
    Zotero.log("ZoteroPriceLookup: script loaded");
    addon = new ZoteroPriceLookup(rootURI);
    addon.startup();
    Zotero.log("ZoteroPriceLookup: startup done");

    Zotero.initializationPromise.then(() => {
      Zotero.log("ZoteroPriceLookup: Zotero ready, registering menu");
      const win = Services.wm.getMostRecentWindow("navigator:browser");
      Zotero.log("ZoteroPriceLookup: main window = " + win);
      if (win) {
        addon.onMainWindowLoad(win);
      }
    });
  } catch (e) {
    Zotero.log("ZoteroPriceLookup: startup ERROR: " + e);
  }
}

function shutdown({ id, version, rootURI }, reason) {
  try {
    const win = Services.wm.getMostRecentWindow("navigator:browser");
    if (win) addon?.onMainWindowUnload(win);
    addon?.shutdown();
    addon = undefined;
  } catch (e) {
    Zotero.log("ZoteroPriceLookup: shutdown ERROR: " + e);
  }
}

function install(data, reason) {}
function uninstall(data, reason) {}

function onMainWindowLoad({ window: win }) {
  Zotero.log("ZoteroPriceLookup: onMainWindowLoad called");
  try {
    addon?.onMainWindowLoad(win);
  } catch (e) {
    Zotero.log("ZoteroPriceLookup: onMainWindowLoad ERROR: " + e);
  }
}

function onMainWindowUnload({ window: win }) {
  try {
    addon?.onMainWindowUnload(win);
  } catch (e) {
    Zotero.log("ZoteroPriceLookup: onMainWindowUnload ERROR: " + e);
  }
}
