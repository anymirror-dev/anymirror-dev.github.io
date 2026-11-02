# anymirror.dev

The website of [anymirror](https://github.com/anymirror-dev/anymirror):
verified content over dumb hosts.

A static site: hand-written pages in `src/pages`, one layout, one stylesheet
on the brand tokens, and a small build that copies the code samples and
tables from the READMEs of the pinned `@anymirror/core` and `veritiles`
releases, so the site shows exactly what a release documents. Fonts are
self-hosted; the pages load nothing from another origin, except the live
map on `/maps`, which reads the map demo's files from GitHub Pages once a
visitor asks for it.

```sh
npm ci
npm run build    # → dist/
npm test         # one h1 a page, links and anchors, origins, samples, colours
npm run serve    # http://localhost:8080/, resolving paths as GitHub Pages does
```

A push to `main` deploys to GitHub Pages. After an anymirror release, bump
`@anymirror/core` and `veritiles` in `package.json` and rebuild: the samples
follow.

The brand (logos, tokens, voice) comes from the anymirror brand kit; the
fonts are Inter Tight and JetBrains Mono (OFL), through Fontsource.

## License

[MIT](LICENSE) for the code.
