export type SiteCategory = 'CMS' | 'Framework' | 'Headless' | 'Static' | 'Custom' | 'Unknown';

export interface Website {
  id: string;
  url: string;
  label?: string;    // ? = ixtiyoriy
  createdAt: string;
  scans?: ScanResult[];
}
export interface ScanResult {
  id: string;
  websiteId: string;
  cms: string | null;
  version: string | null;
  category: SiteCategory | null;
  confidence: number;
  detectionMethods: string[];
  serverTech: string[];
  jsFrameworks: string[];
  scannedAt: string;
  errorMessage?: string;
  website?: Website;
}

export interface CreateWebsiteDto {
  url: string;
  label?: string;
}

// ── RANGLAR ────────────────────────────────────
export const CMS_COLORS: Record<string, string> = {
  WordPress: '#2271b1',
  Joomla: '#f4a31a',
  Drupal: '#009cde',
  Bitrix: '#e03a3e',
  MODX: '#4a9e6b',
  Shopify: '#96bf48',
  Ghost: '#738a94',
  TYPO3: '#f49700',
  Wix: '#faad4d',
  Squarespace: '#222222',
  Webflow: '#4353ff',
  Tilda: '#ff4612',
  // Frameworks
  'Next.js': '#000000',
  'Nuxt.js': '#00dc82',
  SvelteKit: '#ff3e00',
  Remix: '#121212',
  Astro: '#ff5d01',
  Laravel: '#ff2d20',
  Django: '#092e20',
  'Ruby on Rails': '#cc0000',
  'Express.js': '#68a063',
  'ASP.NET': '#5c2d91',
  'Spring Boot': '#6db33f',
  FastAPI: '#009688',
  // Headless
  Contentful: '#2478cc',
  Sanity: '#f03e2f',
  Strapi: '#4945ff',
  Directus: '#6644ff',
  Prismic: '#5163ba',
  DatoCMS: '#ff7751',
  // Static
  Gatsby: '#663399',
  Hugo: '#ff4088',
  Jekyll: '#cc0000',
  Eleventy: '#222222',
  VitePress: '#646cff',
  Docusaurus: '#3ecc5f',
  Hexo: '#0e83cd',
  // Fallback
  unknown: '#6b6c80',
  Custom: '#6b6c80',
  Unknown: '#6b6c80',
};

// Kategoriya rangi va emoji
export const CATEGORY_META: Record<SiteCategory, { color: string; icon: string; label: string }> = {
  CMS: { color: '#2271b1', icon: '◈', label: 'CMS' },
  Framework: { color: '#7c6cff', icon: '⬡', label: 'Framework' },
  Headless: { color: '#00c9a7', icon: '◎', label: 'Headless CMS' },
  Static: { color: '#ffc84a', icon: '◇', label: 'Static Site' },
  Custom: { color: '#ff6b7a', icon: '✦', label: 'Custom' },
  Unknown: { color: '#6b6c80', icon: '?', label: 'Unknown' },
};