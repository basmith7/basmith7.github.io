# basmith.net

Source for [basmith.net](https://basmith.net) — Brian Smith's personal site and resume,
served as a static GitHub Pages site. It includes a small client-side neural-net demo
("Ask a tiny model about Brian") that trains a tiny language model in the browser on
resume text.

## Running locally

Serve the site with the included dev server (it strips Jekyll front matter from
`assets/main.scss` so the CSS loads correctly without running Jekyll):

```
python3 scripts/dev-server.py
```

Then open http://127.0.0.1:8765.

## Tests

The neural-net demo's corpus parsing and model code have node tests:

```
node --test tests/*.test.js
```
