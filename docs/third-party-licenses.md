# Third-party licenses

Components bundled or invoked by headroom-desktop that carry their own license.

## pxpipe (`pxpipe-proxy`)

Used by the optional imaging feature (plan 06): the desktop launches
`pxpipe-proxy` (via `npx`) as a sidecar that renders bulky request context as
images to cut input tokens. See docs/plans/06-pxpipe-imaging.md.

- Project: https://github.com/teamchong/pxpipe (npm: `pxpipe-proxy`)
- License: MIT

```
MIT License

Copyright (c) 2026 claude-image-proxy contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

If pxpipe is ever vendored in-tree (its built `dist/`) rather than fetched via
`npx`, keep this notice alongside the vendored files.
