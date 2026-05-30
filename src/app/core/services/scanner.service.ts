import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ScanResult } from '../../shared/models/website.model';
import { environment } from '../../../environments/environment';

export interface ProxyEntry {
  index:     number;
  protocol:  string;
  host:      string;
  port:      string;
  hasAuth:   boolean;
  active:    boolean;
  dead:      boolean;
  fails:     number;
  deadUntil: string | null;
}

export interface ProxySourceStatus {
  url:       string;
  protocol:  string;
  ok:        boolean;
  count:     number;
  error?:    string;
  fetchedAt: string;
}

export interface ProxyAutoRefresh {
  enabled:         boolean;
  available:       boolean;
  intervalMinutes: number;
  maxProxies:      number;
  lastRefresh:     string | null;
  refreshing:      boolean;
  sources:         ProxySourceStatus[];
}

export interface ProxyTestResult {
  mode:       'proxy' | 'own-ip';
  proxy:      { protocol: string; host: string; port: string; hasAuth: boolean } | null;
  working:    boolean;
  latencyMs:  number;
  outboundIp: string | null;
  error?:     string;
}

export interface ProxyStats {
  total:        number;
  alive:        number;
  dead:         number;
  currentIndex: number;
  rotations:    number;
  proxies:      ProxyEntry[];
  autoRefresh:  ProxyAutoRefresh;
  domainCooldowns: { host: string; remainingSec: number }[];
  health: {
    deadAfterFails:    number;
    reviveMinutes:     number;
    domainCooldownSec: number;
  };
}

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

    getProxies(): Observable<ProxyStats> {
        return this.http.get<ProxyStats>(`${this.api}/scanner/proxies`);
    }

    refreshProxies(): Observable<ProxyStats> {
        return this.http.post<ProxyStats>(`${this.api}/scanner/proxies/refresh`, {});
    }

    setAutoRefreshEnabled(enabled: boolean): Observable<ProxyStats> {
        return this.http.post<ProxyStats>(`${this.api}/scanner/proxies/auto-refresh`, { enabled });
    }

    getIsp(): Observable<{ isp: string | null; ip: string | null; country: string | null; city: string | null }> {
        return this.http.get<{ isp: string | null; ip: string | null; country: string | null; city: string | null }>(
            `${this.api}/scanner/isp`,
        );
    }

    testProxy(input?: { proxy?: string; index?: number }): Observable<ProxyTestResult> {
        return this.http.post<ProxyTestResult>(`${this.api}/scanner/proxies/test`, input || {});
    }

    checkCanEmbed(url: string): Observable<{ canEmbed: boolean }> {
        return this.http.get<{ canEmbed: boolean }>(`${this.api}/scanner/can-embed`, { params: { url } });
    }

    getCachedSubdomains(domain: string): Observable<Array<{ subdomain: string; alive: boolean; source: string[]; statusCode?: number; title?: string; cached?: boolean; discoveredAt?: string }>> {
        return this.http.get<Array<{ subdomain: string; alive: boolean; source: string[]; statusCode?: number; title?: string; cached?: boolean; discoveredAt?: string }>>(
            `${this.api}/scanner/subdomains/cache`, { params: { domain } }
        );
    }

    discoverSubdomains(domain: string, websiteId?: string): Observable<Array<{ subdomain: string; alive: boolean; source: string[]; statusCode?: number; title?: string; cached?: boolean; discoveredAt?: string }>> {
        const params: Record<string, string> = { domain };
        if (websiteId) params['websiteId'] = websiteId;
        return this.http.get<Array<{ subdomain: string; alive: boolean; source: string[]; statusCode?: number; title?: string; cached?: boolean; discoveredAt?: string }>>(
            `${this.api}/scanner/subdomains`, { params }
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

    runNuclei(websiteId: string, subdomains: string[]): Observable<NucleiResult[]> {
        return this.http.post<NucleiResult[]>(
            `${this.api}/scanner/nuclei/${websiteId}`, { subdomains }
        );
    }

    getNucleiResults(websiteId: string): Observable<NucleiResult[]> {
        return this.http.get<NucleiResult[]>(`${this.api}/scanner/nuclei/${websiteId}`);
    }

    getAllNucleiResults(): Observable<NucleiResult[]> {
        return this.http.get<NucleiResult[]>(`${this.api}/scanner/nuclei-results`);
    }

    runNucleiAll(): Observable<{ total: number; findings: number }> {
        return this.http.post<{ total: number; findings: number }>(
            `${this.api}/scanner/nuclei-all`, {}
        );
    }

    getNucleiInterval(): Observable<{ interval: number }> {
        return this.http.get<{ interval: number }>(`${this.api}/scanner/nuclei-interval`);
    }

    setNucleiInterval(minutes: number): Observable<any> {
        return this.http.post(`${this.api}/scanner/nuclei-interval`, { minutes });
    }

    getNucleiProgress(): Observable<NucleiProgress> {
        return this.http.get<NucleiProgress>(`${this.api}/scanner/nuclei-progress`);
    }

    updateCveStatus(id: string, status: 'PENDING' | 'FALSE_POSITIVE' | 'CONFIRMED'): Observable<NucleiResult> {
        return this.http.patch<NucleiResult>(`${this.api}/scanner/nuclei-result/${id}/status`, { status });
    }

    getCveMonitoring(): Observable<NucleiResult[]> {
        return this.http.get<NucleiResult[]>(`${this.api}/scanner/nuclei-monitoring`);
    }

    getCveRejected(): Observable<NucleiResult[]> {
        return this.http.get<NucleiResult[]>(`${this.api}/scanner/nuclei-rejected`);
    }

    // ── Threat Intel Feeds ────────────────────────────────────────────────
    getFeeds(): Observable<ThreatFeed[]> {
        return this.http.get<ThreatFeed[]>(`${this.api}/scanner/threat-feeds`);
    }

    upsertFeed(data: { id?: string; name: string; type: string; url?: string; apiKey?: string; enabled?: boolean }): Observable<ThreatFeed> {
        return this.http.post<ThreatFeed>(`${this.api}/scanner/threat-feeds`, data);
    }

    toggleFeed(id: string, enabled: boolean): Observable<ThreatFeed> {
        return this.http.patch<ThreatFeed>(`${this.api}/scanner/threat-feeds/${id}/toggle`, { enabled });
    }

    configureFeed(id: string, data: { url?: string; apiKey?: string; name?: string }): Observable<ThreatFeed> {
        return this.http.patch<ThreatFeed>(`${this.api}/scanner/threat-feeds/${id}/configure`, data);
    }

    deleteFeed(id: string): Observable<ThreatFeed> {
        return this.http.delete<ThreatFeed>(`${this.api}/scanner/threat-feeds/${id}`);
    }

    syncFeed(id: string): Observable<{ synced: number; errors: number }> {
        return this.http.post<{ synced: number; errors: number }>(`${this.api}/scanner/threat-feeds/${id}/sync`, {});
    }

    syncAllFeeds(): Observable<Record<string, { synced: number; errors: number }>> {
        return this.http.post<any>(`${this.api}/scanner/threat-feeds/sync-all`, {});
    }

    enrichAll(): Observable<{ total: number; enriched: number; errors: number }> {
        return this.http.post<any>(`${this.api}/scanner/cve-enrich-all`, {});
    }
}

export interface NucleiProgress {
    scanning:     boolean;
    currentSite:  string | null;
    currentIndex: number;
    total:        number;
    completed: Array<{
        url:      string;
        label:    string | null;
        findings: number;
        error:    string | null;
    }>;
    startedAt: string | null;
}

export interface CveEnrichment {
    id:          string;
    cveId:       string;
    cvssScore:   number | null;
    cvssVector:  string | null;
    cvssVersion: string | null;
    epssScore:   number | null;
    epssPercent: number | null;
    isKev:       boolean;
    kevDueDate:  string | null;
    description: string | null;
    references:  string[];
    cweIds:      string[];
    otxPulses:   number | null;
    vtMalicious: number | null;
    mispEvents:  number | null;
    osvFound:    boolean;
    osvAliases:  string[];
    sources:     string[];
    enrichedAt:  string;
    updatedAt:   string;
}

export interface ThreatFeed {
    id:         string;
    name:       string;
    type:       'NVD' | 'CISA_KEV' | 'EPSS' | 'OSV' | 'CIRCL' | 'MITRE_CVE' | 'MISP' | 'OTX' | 'VIRUSTOTAL';
    url:        string | null;
    apiKey:     string | null;
    enabled:    boolean;
    lastSync:   string | null;
    lastStatus: string | null;
    lastError:  string | null;
    createdAt:  string;
}

export interface NucleiResult {
    id:          string;
    websiteId:   string;
    subdomain:   string;
    templateId:  string;
    cveId:       string | null;
    severity:    'critical' | 'high' | 'medium' | 'low' | 'info' | 'unknown';
    name:        string;
    description: string | null;
    matchedAt:   string | null;
    scannedAt:   string;
    status:      'PENDING' | 'FALSE_POSITIVE' | 'CONFIRMED';
    enrichment:  CveEnrichment | null;
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
    coopPolicy:          boolean;
    coepPolicy:          boolean;
    corpPolicy:          boolean;
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
