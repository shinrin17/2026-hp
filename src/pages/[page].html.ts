import type { APIRoute, GetStaticPaths } from 'astro';

// Endpoints retain the exact .html filenames on static hosts such as GitHub Pages.
export const getStaticPaths: GetStaticPaths = () => [
  { params: { page: 'about' }, props: { title: 'ABOUT', target: '/about/' } },
  { params: { page: 'works' }, props: { title: 'WORKS', target: '/works/' } },
];

export const GET: APIRoute = ({ props, site }) => new Response(`<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${props.title} — ページを移動しました</title>
    <link rel="canonical" href="${new URL(props.target, site).href}">
    <meta http-equiv="refresh" content="0;url=${props.target}">
  </head>
  <body>
    <main>
      <h1>${props.title}</h1>
      <p>ページのURLが変わりました。<a href="${props.target}">新しいページを開く</a></p>
    </main>
  </body>
</html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
