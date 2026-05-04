import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ScanResult } from '../../shared/models/website.model';
import { environment } from '../../../environments/environment';

export interface WhoisData {
  domainName:     string | null;
  registrar:      string | null;
  nameServers:    string[];
  status:         string | null;
  creationDate:   string | null;
  updatedDate:    string | null;
  expirationDate: string | null;
  ipAddresses:    string[];
  phone:          string | null;
  raw:            string | null;
}

@Injectable({ providedIn: 'root' })
export class ScannerService {
    private http = inject(HttpClient); // DI — NestJS kabi
    private api = environment.apiUrl;

    // Singleton state — navigation'da yo'qolmaydi
    nextPollAt = 0;
    pollIntervalMs = 60 * 60 * 1000;
    autoRefreshEnabled = false;

    // GET /api/scanner/results
    getLatestResults(): Observable<ScanResult[]> {
        return this.http.get<ScanResult[]>(`${this.api}/scanner/results`);
    }

    // POST /api/scanner/scan
    scanOne(websiteId: string, url: string): Observable<ScanResult> {
        return this.http.post<ScanResult>(
            `${this.api}/scanner/scan`,
            { websiteId, url }
        );
    }

    // POST /api/scanner/scan-all
    scanAll(): Observable<void> {
        return this.http.post<void>(`${this.api}/scanner/scan-all`, {});
    }

    setInterval(minutes: number): Observable<any> {
        return this.http.post(`${this.api}/scanner/interval`, { minutes });
    }

    getInterval(): Observable<{ interval: number }> {
        return this.http.get<{ interval: number }>(`${this.api}/scanner/interval`);
    }

    checkCanEmbed(url: string): Observable<{ canEmbed: boolean }> {
        return this.http.get<{ canEmbed: boolean }>(`${this.api}/scanner/can-embed`, { params: { url } });
    }

    discoverSubdomains(domain: string): Observable<Array<{ subdomain: string; alive: boolean; source: string[]; statusCode?: number; title?: string }>> {
        return this.http.get<Array<{ subdomain: string; alive: boolean; source: string[]; statusCode?: number; title?: string }>>(
            `${this.api}/scanner/subdomains`, { params: { domain } }
        );
    }

    createWebsite(url: string, label?: string): Observable<{ id: string; url: string; label?: string }> {
        return this.http.post<{ id: string; url: string; label?: string }>(
            `${this.api}/scanner/websites`, { url, label }
        );
    }

    getWhois(domain: string): Observable<WhoisData> {
        return this.http.get<WhoisData>(`${this.api}/scanner/whois`, { params: { domain } });
    }

    getSiteInfo(url: string, websiteId?: string): Observable<SiteInfoData> {
        const params: Record<string, string> = { url };
        if (websiteId) params['websiteId'] = websiteId;
        return this.http.get<SiteInfoData>(`${this.api}/scanner/site-info`, { params });
    }

    getAlerts(): Observable<Alert[]> {
        return this.http.get<Alert[]>(`${this.api}/alerts`);
    }

    getAlertCount(): Observable<{ count: number }> {
        return this.http.get<{ count: number }>(`${this.api}/alerts/count`);
    }

    dismissAlert(id: string): Observable<Alert> {
        return this.http.patch<Alert>(`${this.api}/alerts/${id}/dismiss`, {});
    }

    exportCsv(): Observable<string> {
        return this.http.get(`${this.api}/scanner/export`, { responseType: 'text' });
    }
}

export interface SslInfo {
    valid:       boolean;
    issuer:      string | null;
    subject:     string | null;
    validFrom:   string | null;
    validTo:     string | null;
    daysLeft:    number | null;
    selfSigned:  boolean;
}
export interface GeoInfo {
    country:     string | null;
    countryCode: string | null;
    city:        string | null;
    region:      string | null;
    isp:         string | null;
    org:         string | null;
    timezone:    string | null;
}
export interface SecHeadersInfo {
    hsts:                boolean;
    csp:                 boolean;
    xFrameOptions:       boolean;
    xContentTypeOptions: boolean;
    xXssProtection:      boolean;
    referrerPolicy:      boolean;
    permissionsPolicy:   boolean;
    score:               number;
    grade:               string;
    present:             string[];
    missing:             string[];
}
export interface SiteInfoData {
    ssl:     SslInfo     | null;
    geo:     GeoInfo     | null;
    headers: SecHeadersInfo | null;
}

export type AlertType =
    'expiry_urgent'     | 'expiry_critical'     | 'expiry_warning'     | 'expiry_notice' |
    'ssl_expiry_urgent' | 'ssl_expiry_critical'  | 'ssl_expiry_warning' | 'ssl_expiry_notice' |
    'cms_change' | 'site_down';

export interface Alert {
    id:          string;
    domain:      string;
    websiteId:   string | null;
    type:        AlertType;
    message:     string;
    dueDate:     string;
    dismissed:   boolean;
    createdAt:   string;
}