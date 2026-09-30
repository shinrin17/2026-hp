export const siteInfo = {
  name: 'ICHIRINKA – MORIKAWA RYOHTA',
  description: 'フォトグラファー・映像ディレクター、森川亮太のポートフォリオ。写真撮影・映像演出・制作進行を通じて、表現者の持つ熱量と尊さを残します。芸能分野の人物撮影、メイキング・ドキュメンタリーなどの作品を紹介。',
  personName: '森川亮太',
  sameAs: ['https://www.instagram.com/m_ichirinka/', 'https://www.youtube.com/@tokyoshutters'],
  // Keep the supplied landscape artwork intact; its logo fits a centered square crop.
  socialImage: {
    path: '/assets/images/ichirinka-og.png',
    width: 1200,
    height: 630,
    type: 'image/png',
    alt: '白地に黒い花瓶のシンボルと「ICHIRINKA」の文字を配したロゴ',
  },
};

// Top-page order. Use the workId from each work's index.md.
export const featuredWorkIds = [
  'instagram-C_QJO0fJ_Z3',
  'instagram-DYMbnz-CX-M',
  'instagram-DZkZ7EkCSRh',
];

export const categoryLabels = {
  photo: 'PHOTO',
  movie: 'MOVIE',
  'production-staff': 'PRODUCTION STAFF',
} as const;
