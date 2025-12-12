# MarkDown For What 🎵

**MarkDown For What** is a Figma plugin that synchronizes Markdown content directly into your Figma text layers. It supports rich text formatting, code blocks, and batch operations, making it the perfect tool for maintaining design system documentation, changelogs, or content-heavy prototypes.

![Plugin Preview](./doc-assets/preview.png)

## Features

- **Rich Text Rendering**: Automatically parses Markdown syntax for:
  - **Bold** (`**text**`) and *Italic* (`*text*`)
  - **Headers** (`# H1`, `## H2`, etc.) with mapped font scaling
  - **Lists** (Bulleted lists)
  - **Code Blocks** (Renders in `Roboto Mono` for contrast)
- **Smart Font Management**:
  - Uses `Inter` as the default typeface.
  - Automatically loads and applies `Roboto Mono` for code snippets.
  - Handles mixed font styles gracefully.
- **Batch Operations**:
  - **Drag & Drop**: Simply drag multiple markdown files into the plugin window.
  - **Auto-Mapping**: Matches file names to text layer names (e.g., `button-docs.md` updates layer `button-docs`).
- **Content Cleaning**: Automatically strips YAML front matter (`--- ... ---`) to keep your designs clean.

## Installation

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or later recommended)
- Figma Desktop App

### Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/kocheck/MarkDown-For-What.git
   cd MarkDown-For-What/figma-markdown-sync
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the plugin**:
   ```bash
   npm run build
   ```
   This generates a `dist/` folder containing `ui.html` and `code.js`.

### Loading into Figma

1. Open Figma and navigate to **plugins > Development > Import plugin from manifest...**
2. Select the `manifest.json` file located in `figma-markdown-sync/`.
3. The plugin "MarkDown For What" is now available in your plugins list!

## Usage

### Single Layer Import
1. Select a **Text Layer** in your Figma file.
2. Run the plugin (**CMD+/ search "MarkDown For What"**).
3. Drag & drop a markdown file or click to browse.
4. Click **"Import to Selected Layers"**.

### Batch Import (Magic Mode 🪄)
1. Ensure your Figma Text Layers are named exactly like your markdown files (e.g., Layer Name: `Usage`, File Name: `Usage.md`).
2. Run the plugin **without selecting any layers**.
3. Drag & drop multiple markdown files.
4. Click **"Import X Files"**.
5. The plugin will automatically find the matching layers and update their content!

## Development

To run the plugin in watch mode during development:

```bash
npm run watch
```

This will automatically rebuild the `dist/` files whenever you make changes to `src/` or `code.ts`.

---

**Troubleshooting Notes**:
- **Fonts**: Ensure you have `Inter` and `Roboto Mono` available in Figma (Google Fonts are available by default).
- **Security**: The plugin runs entirely locally in your Figma instance. No data is sent to external servers.
