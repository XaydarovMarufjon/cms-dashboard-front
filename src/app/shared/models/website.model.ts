// API dan keladigan ma'lumot shakli
export interface Website {
  id:        string;
  url:       string;
  label?:    string;    // ? = ixtiyoriy
  createdAt: string;
  scans?:    ScanResult[];
}

export interface ScanResult {
  id:               string;
  websiteId:        string;
  cms:              string | null;   // null bo'lishi mumkin
  version:          string | null;
  confidence:       number;          // 0-100
  detectionMethods: string[];
  scannedAt:        string;
  errorMessage?:    string;
  website?:         Website;         // include: { website: true }
}

// Sayt qo'shish uchun (faqat kerakli maydonlar)
export interface CreateWebsiteDto {
  url:    string;
  label?: string;
}

// CMS ranglari — badge uchun
export const CMS_COLORS: Record<string, string> = {
  WordPress:  '#2271b1',
  Joomla:     '#f4a31a',
  Drupal:     '#009cde',
  Bitrix:     '#e03a3e',
  MODX:       '#4a9e6b',
  Shopify:    '#96bf48',
  Ghost:      '#738a94',
  unknown:    '#6b6c80',
};