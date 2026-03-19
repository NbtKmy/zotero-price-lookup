# Zotero Price Lookup

A [Zotero 7](https://www.zotero.org/) plugin that looks up book prices by ISBN via the [OpenBD API](https://openbd.jp/) and writes the result to each item's Extra field.

## Features

- Right-click selected book items → **"Look up price"**
- Fetches retail price from OpenBD (free, no API key required)
- Writes result to the `Price` key in the Extra field (e.g. `Price: ¥1,300`)
- Skips items without an ISBN and reports results in a progress notification

## Requirements

- Zotero 7.0 or later

## Installation

1. Download the latest `.xpi` from the [Releases](https://github.com/NbtKmy/zotero-price-lookup/releases) page.
2. In Zotero: **Tools → Add-ons → Install Add-on from File** → select the `.xpi`.

## Usage

1. Select one or more book items in your Zotero library.
2. Right-click → **Look up price**.
3. The price is written to the Extra field of each item where a price was found.

## Notes

- OpenBD covers Japanese books only. Items not in the database will be reported as "not found".
- Prices are sourced from OpenBD and may not reflect the current market price.
- OpenBD is expected to remain available until approximately 2028.

## Building from Source

```bash
npm install
npm run build   # TypeScript → JS, bundle with esbuild
npm run zip     # package as .xpi
```

## License

[MIT](LICENSE)
