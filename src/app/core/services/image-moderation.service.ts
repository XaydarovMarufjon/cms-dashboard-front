import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type ImageScanStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface ImageScan {
  id:             string;
  websiteId:      string;
  status:         ImageScanStatus;
  totalImages:    number;
  scannedImages:  number;
  flaggedCount:   number;
  sexualCount:    number;
  violentCount:   number;
  religiousCount: number;
  errorMessage:   string | null;
  startedAt:      string;
  finishedAt:     string | null;
}

export interface ImageResult {
  id:             string;
  scanId:         string;
  imageUrl:       string;
  pageUrl:        string | null;
  sexualScore:    number;
  violentScore:   number;
  religiousScore: number;
  categories:     string[];
  flagged:        boolean;
  errorMessage:   string | null;
  scannedAt:      string;
}

export interface SiteOverviewEntry {
  id:         string;
  url:        string;
  label:      string | null;
  latestScan: ImageScan | null;
}

export interface ScanDetail {
  scan: ImageScan & {
    website: { id: string; url: string; label: string | null };
  };
  results: ImageResult[];
}

export interface ModerationStatus {
  running:          boolean;
  configured:       boolean;
  maxPages?:        number;
  maxImages?:       number;
  crawlPageDelayMs?: number;
}

@Injectable({ providedIn: 'root' })
export class ImageModerationService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  getStatus(): Observable<ModerationStatus> {
    return this.http.get<ModerationStatus>(`${this.api}/image-moderation/status`);
  }

  getOverview(): Observable<SiteOverviewEntry[]> {
    return this.http.get<SiteOverviewEntry[]>(`${this.api}/image-moderation/overview`);
  }

  getSiteScans(websiteId: string): Observable<ImageScan[]> {
    return this.http.get<ImageScan[]>(`${this.api}/image-moderation/site/${websiteId}/scans`);
  }

  getScanDetail(scanId: string): Observable<ScanDetail> {
    return this.http.get<ScanDetail>(`${this.api}/image-moderation/scan/${scanId}`);
  }

  scanOne(websiteId: string, url: string): Observable<ImageScan> {
    return this.http.post<ImageScan>(`${this.api}/image-moderation/scan`, { websiteId, url });
  }

  scanAll(): Observable<{ scanned: number; skipped: number }> {
    return this.http.post<{ scanned: number; skipped: number }>(
      `${this.api}/image-moderation/scan-all`,
      {},
    );
  }
}
