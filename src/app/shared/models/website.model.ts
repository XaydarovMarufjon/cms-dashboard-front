export type SiteCategory =
  | 'CMS'
  | 'E-commerce CMS'
  | 'Backend Framework'
  | 'Frontend Framework / SPA'
  | 'Fullstack Framework'
  | 'Static Website'
  | 'Static Site Generator (SSG)'
  | 'Jamstack'
  | 'Headless CMS'
  | 'Server-Side Rendered (SSR)'
  | 'Progressive Web App (PWA)'
  | 'Web Builder / No-Code Platform'
  | 'Forum Engine'
  | 'Wiki Engine'
  | 'Blog Engine'
  | 'Learning Management System (LMS)'
  | 'CRM / ERP Web System'
  | 'Custom / Proprietary System'
  | 'API-only Backend'
  | 'Unknown';

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
  httpStatus: number | null;
  pageTitle: string | null;
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
  // CMS
  WordPress:    '#2271b1',
  Joomla:       '#f4a31a',
  Drupal:       '#009cde',
  Bitrix:       '#e03a3e',
  MODX:         '#4a9e6b',
  OctoberCMS:   '#db6f39',
  Shopify:      '#96bf48',
  WooCommerce:  '#7f54b3',
  Ghost:        '#738a94',
  TYPO3:        '#f49700',
  Wix:          '#faad4d',
  Squarespace:  '#222222',
  Webflow:      '#4353ff',
  Tilda:        '#ff4612',
  OpenCart:     '#23adf0',
  PrestaShop:   '#df0067',
  Magento:      '#f26322',
  DLE:          '#1a6496',
  'UMI.CMS':    '#5b6abf',
  'CS-Cart':    '#e8334a',
  UzGovCMS:     '#1b6ca8',
  Laravel:      '#ff2d20',
  // Frameworks
  'Next.js':    '#e2e2e2',
  'Nuxt.js':    '#00dc82',
  SvelteKit:    '#ff3e00',
  Remix:        '#a78bfa',
  Astro:        '#ff5d01',
  Django:       '#2ba977',
  'Ruby on Rails': '#cc0000',
  'Express.js': '#68a063',
  'ASP.NET':    '#5c2d91',
  'Spring Boot':'#6db33f',
  FastAPI:      '#009688',
  // Headless
  Contentful:   '#2478cc',
  Sanity:       '#f03e2f',
  Strapi:       '#4945ff',
  Directus:     '#6644ff',
  Prismic:      '#5163ba',
  DatoCMS:      '#ff7751',
  // Static
  Gatsby:       '#663399',
  Hugo:         '#ff4088',
  Jekyll:       '#cc0000',
  Eleventy:     '#222222',
  VitePress:    '#646cff',
  Docusaurus:   '#3ecc5f',
  Hexo:         '#0e83cd',
  // Fallback
  unknown:      '#6b6c80',
  Custom:       '#6b6c80',
  Unknown:      '#6b6c80',
};

// Kategoriya rangi va emoji
export const CATEGORY_META: Record<SiteCategory, { color: string; icon: string; label: string }> = {
  'CMS':                              { color: '#2271b1', icon: '◈', label: 'CMS' },
  'E-commerce CMS':                   { color: '#22c55e', icon: '◉', label: 'E-commerce' },
  'Backend Framework':                { color: '#7c6cff', icon: '⬡', label: 'Backend' },
  'Frontend Framework / SPA':         { color: '#06b6d4', icon: '◇', label: 'Frontend SPA' },
  'Fullstack Framework':              { color: '#6366f1', icon: '⬡', label: 'Fullstack' },
  'Static Website':                   { color: '#94a3b8', icon: '◻', label: 'Static' },
  'Static Site Generator (SSG)':      { color: '#f59e0b', icon: '◇', label: 'SSG' },
  'Jamstack':                         { color: '#8b5cf6', icon: '✦', label: 'Jamstack' },
  'Headless CMS':                     { color: '#00c9a7', icon: '◎', label: 'Headless CMS' },
  'Server-Side Rendered (SSR)':       { color: '#3b82f6', icon: '▷', label: 'SSR' },
  'Progressive Web App (PWA)':        { color: '#ec4899', icon: '○', label: 'PWA' },
  'Web Builder / No-Code Platform':   { color: '#f97316', icon: '⬡', label: 'Web Builder' },
  'Forum Engine':                     { color: '#b45309', icon: '◈', label: 'Forum' },
  'Wiki Engine':                      { color: '#64748b', icon: '◈', label: 'Wiki' },
  'Blog Engine':                      { color: '#fb7185', icon: '◈', label: 'Blog' },
  'Learning Management System (LMS)': { color: '#10b981', icon: '◈', label: 'LMS' },
  'CRM / ERP Web System':             { color: '#d97706', icon: '◈', label: 'CRM/ERP' },
  'Custom / Proprietary System':      { color: '#ff6b7a', icon: '✦', label: 'Custom' },
  'API-only Backend':                 { color: '#0ea5e9', icon: '◎', label: 'API' },
  'Unknown':                          { color: '#6b6c80', icon: '?',  label: 'Unknown' },
};