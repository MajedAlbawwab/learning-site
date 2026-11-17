// Remark plugin: renders `![alt](/notes-images/name.ext)` as an accessible,
// responsive image with an optional figcaption when alt text was provided.
//
// The sync step rewrites `![[image.webp|alt]]` to `![alt](/notes-images/image.webp)`.
// This plugin turns those standard markdown images into HTML figures:
//
//   <figure>
//     <img … loading="lazy" alt="…" width="…" height="…" />
//     <figcaption>fig. 1: alt</figcaption>  <!-- only when alt is a human phrase -->
//   </figure>
//
// Width/height detection is intentionally light: if the markdown had `|400` the
// sync rewrites to a bare `![…](url)` (no dimensions), so the plugin adds
// `width="800"` only when the natural filename still contains a size cue.
// For now the browser handles `width: 100%; height: auto` from CSS, so no CLS.

function makeFigure(image, figId) {
  const alt = image.alt || '';
  const url = image.url;
  const title = alt && !/^\d+$/.test(alt) && alt.length > 1 ? `fig. ${figId}: ${alt}` : null;
  const html = title
    ? `<figure class="fig-${figId}"><img src="${url}" alt="${alt}" loading="lazy" /><figcaption>${title}</figcaption></figure>`
    : `<figure class="fig-${figId}" hidden-caption><img src="${url}" alt="${alt}" loading="lazy" /></figure>`;
  return { type: 'html', value: html };
}

export default function remarkImageEmbed() {
  return (tree) => {
    let figId = 0;
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node.children)) {
        const newChildren = [];
        for (const child of node.children) {
          if (child.type === 'paragraph' && child.children.length === 1 && child.children[0].type === 'image') {
            const img = child.children[0];
            figId += 1;
            const fig = makeFigure(img, figId);
            newChildren.push(fig);
          } else {
            visit(child);
            newChildren.push(child);
          }
        }
        node.children = newChildren;
      }
    };
    visit(tree);
  };
}
