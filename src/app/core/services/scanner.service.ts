import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Observable, Subject } from 'rxjs';
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
  sourceMode?:     'default' | 'env';
  intervalMinutes: number;
  maxProxies:      number;
  candidateLimit?: number;
  validationTarget?: number;
  manualCount?:    number;
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
    proxyFetchTimeoutMs?: number;
  };
}

export type BulkScanMode = 'FAST' | 'FULL';
export type BulkScanStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
export type BulkScanItemStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'SKIPPED';

export interface BulkScanJobItem {
    id:           string;
    jobId:        string;
    websiteId:    string;
    url:          string;
    status:       BulkScanItemStatus;
    scanResultId: string | null;
    errorMessage: string | null;
    startedAt:    string | null;
    finishedAt:   string | null;
    updatedAt:    string;
    website?:     { url: string; label: string | null };
}

export interface BulkScanJob {
    id:                       string;
    status:                   BulkScanStatus;
    mode:                     BulkScanMode;
    concurrency:              number;
    timeoutMs:                number;
    includeRecentlyScanned:   boolean;
    skipRecentHours:          number;
    total:                    number;
    pending:                  number;
    running:                  number;
    completed:                number;
    failed:                   number;
    skipped:                  number;
    progressPercent:          number;
    errorMessage:             string | null;
    startedAt:                string | null;
    finishedAt:               string | null;
    createdAt:                string;
    updatedAt:                string;
    items:                    BulkScanJobItem[];
}

export interface LiveScanActivityItem {
    id:         string;
    websiteId:  string;
    url:        string;
    label?:     string | null;
    source:     string;
    mode?:      string;
    status:     'RUNNING' | 'DONE' | 'FAILED' | string;
    startedAt?: string | null;
    updatedAt?: string | null;
    finishedAt?: string | null;
    durationMs?: number | null;
    error?:      string | null;
    cms?:        string | null;
    httpStatus?: number | null;
}

export interface LiveScanActivity {
    generatedAt: string;
    active:      LiveScanActivityItem[];
    recent:      LiveScanActivityItem[];
    lastScanDurationMs?: number | null;
    bulkJob:     BulkScanJob | null;
    autoScan:    {
        intervalMinutes:     number;
        lastStatus:          string | null;
        scannedInLastWindow: number;
        totalAtLastWindow:   number;
        lastStartedAt:       string | null;
        lastFinishedAt:      string | null;
    } | null;
}

export interface PortScanResult {
    id:        string;
    websiteId: string;
    host:      string;
    port:      number;
    protocol:  string;
    status:    'OPEN' | 'CLOSED' | 'FILTERED' | string;
    service:   string | null;
    latencyMs: number | null;
    error:     string | null;
    scanId:    string;
    scannedAt: string;
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

export interface NucleiScanState {
    running:     boolean;
    done:        boolean;
    results:     NucleiResult[];
    error:       string;
    startedAt:   string | null;
    completedAt: string | null;
}

export interface SubdomainResult {
    subdomain:    string;
    alive:        boolean;
    source:       string[];
    statusCode?:  number;
    title?:       string;
    cached?:      boolean;
    discoveredAt?: string;
}

export interface SubdomainDiscoveryState {
    running:     boolean;
    done:        boolean;
    results:     SubdomainResult[];
    error:       string;
    startedAt:   string | null;
    completedAt: string | null;
}

export interface SystemIssue {
    source:   'api' | 'scan' | 'bulk' | 'feed' | 'database' | 'network';
    severity: 'warning' | 'error';
    message:  string;
    detail:   string | null;
    target:   string | null;
    path:     string | null;
    at:       string | null;
}

export interface SystemStatus {
    generatedAt: string;
    status:      'OK' | 'WARN' | 'ERROR';
    score:       number;
    runtime: {
        nodeVersion:     string;
        env:             string;
        pid:             number;
        uptimeSec:       number;
        systemUptimeSec: number;
        startedAt:       string;
    };
    host: {
        hostname:     string;
        platform:     string;
        arch:         string;
        publicIp:     string | null;
        isp:          string | null;
        country:      string | null;
        city:         string | null;
        networkError: string | null;
        localIps:     string[];
    };
    resources: {
        cpu: {
            cores:   number;
            model:   string;
            load1m:  number;
            load5m:  number;
            load15m: number;
            loadPct: number;
        };
        memory: {
            totalBytes:      number;
            usedBytes:       number;
            freeBytes:       number;
            usedPct:         number;
            processRssBytes: number;
            heapUsedBytes:   number;
            heapTotalBytes:  number;
        };
        disk: {
            path:       string;
            totalBytes: number;
            usedBytes:  number;
            freeBytes:  number;
            usedPct:    number;
            error?:     string;
        };
        network?: {
            rxBytes:       number;
            txBytes:       number;
            rxBytesPerSec: number;
            txBytesPerSec: number;
            interfaceCount:number;
            sampledAt:     string;
            error:         string | null;
        };
    };
    database: {
        ok:               boolean;
        latencyMs:        number;
        provider:         string;
        error?:           string;
        websitesTotal:    number;
        scanResultsTotal: number;
    };
    scans: {
        websitesTotal:       number;
        scanResultsTotal:    number;
        scanResults24h:      number;
        scanErrors24h:       number;
        nucleiFindingsTotal: number;
        subdomainsTotal:     number;
        openPorts:           number;
        runningBulkJobs:     number;
        failedBulkJobs24h:   number;
        openTasks:           number;
        autoScan: {
            intervalMinutes:     number;
            lastStartedAt:       string | null;
            lastFinishedAt:      string | null;
            lastStatus:          string | null;
            lastError:           string | null;
            scannedInLastWindow: number;
            totalAtLastWindow:   number;
        } | null;
    };
    tokens: {
        activeSessions:       number;
        issued24h:            number;
        revoked24h:           number;
        trackedAiTokens24h:   number | null;
        trackingNote:         string;
    };
    activity: {
        writeEvents24h:  number;
        apiErrors24h:    number;
        loginFailures24h:number;
    };
    errors: {
        summary: {
            apiErrors24h:      number;
            scanErrors24h:     number;
            failedBulkJobs24h: number;
            feedErrors:        number;
            loginFailures24h:  number;
        };
        recent: SystemIssue[];
    };
}

export interface OverviewStats {
    generatedAt: string;
    scan: {
        totalSites:       number;
        scannedSites:     number;
        unscannedSites:   number;
        coveragePct:      number;
        scanResultsTotal: number;
        scans24h:         number;
        errors24h:        number;
        staleSites:       number;
        latestScanAt:     string | null;
    };
    cms: {
        detected:      number;
        unknown:       number;
        lowConfidence: number;
        changed24h:    number;
        top:           Array<{ label: string; count: number; pct: number }>;
        categories:    Array<{ label: string; count: number; pct: number }>;
    };
    cve: {
        total:         number;
        affectedSites: number;
        criticalHigh:  number;
        bySeverity:    Array<{ label: string; count: number; pct: number }>;
        byStatus:      Array<{ label: string; count: number; pct: number }>;
    };
    defacement: {
        monitored:       number;
        stable:          number;
        changed:         number;
        suspected:       number;
        baselineMissing: number;
        lastChangedAt:   string | null;
        recent:          Array<{
            websiteId:     string;
            domain:        string;
            url:           string;
            label:         string | null;
            status:        string;
            score:         number;
            reasons:       string[];
            keywordHits:   string[];
            lastChangedAt: string | null;
            lastCheckedAt: string;
        }>;
    };
    imageModeration: {
        monitoredSites: number;
        unscannedSites: number;
        coveragePct:    number;
        scansTotal:     number;
        scans24h:       number;
        running:        number;
        failed24h:      number;
        totalImages:    number;
        scannedImages:  number;
        flaggedImages:  number;
        cleanImages:    number;
        sexual:         number;
        violent:        number;
        religious:      number;
        flaggedPct:     number;
        latestScanAt:   string | null;
    };
    subdomains: {
        aliveSaved:     number;
        deadTracked:    number;
        totalTracked:   number;
        domainsTracked: number;
        topDomains:     Array<{ domain: string; count: number }>;
        note:           string;
    };
    ports: {
        open:         number;
        riskyOpen:    number;
        affectedSites:number;
        topOpenPorts: Array<{ port: number; service: string; count: number }>;
    };
    tasks: {
        open:        number;
        inProgress:  number;
        critical:    number;
        overdue:     number;
        unassigned:  number;
        byAssignee:  Array<{ name: string; count: number }>;
    };
    alerts: {
        total:    number;
        urgent:   number;
        critical: number;
        warning:  number;
        notice:   number;
    };
    mitre: {
        total:          number;
        monitoredSites: number;
        byTactic:       Array<{ tacticId: string; tactic: string; count: number }>;
        techniques:     Array<{
            tacticId:    string;
            tactic:      string;
            techniqueId: string;
            technique:   string;
            count:       number;
            severity:    'critical' | 'high' | 'medium' | 'low' | string;
            sources:     string[];
        }>;
    };
    executive: {
        postureScore:        number;
        postureLabel:        string;
        criticalOpen:        number;
        highPrioritySites:   number;
        scanCoveragePct:     number;
        cveCriticalHigh:     number;
        defacementSuspected: number;
        riskyOpenPorts:      number;
        overdueTasks:        number;
        recommendations:     Array<{ severity: 'critical' | 'high' | 'medium' | 'low' | string; title: string; detail: string }>;
    };
    process: {
        autoScan: {
            intervalMinutes:     number;
            lastStartedAt:       string | null;
            lastFinishedAt:      string | null;
            lastStatus:          string | null;
            scannedInLastWindow: number;
            totalAtLastWindow:   number;
        } | null;
        bulkJob: {
            id:          string;
            status:      string;
            mode:        string;
            total:       number;
            done:        number;
            running:     number;
            pending:     number;
            progressPct: number;
            startedAt:   string | null;
            updatedAt:   string;
        } | null;
    };
    trends: {
        scans:      Array<{ date: string; count: number }>;
        scanErrors: Array<{ date: string; count: number }>;
        cve:        Array<{ date: string; count: number }>;
        newSites:   Array<{ date: string; count: number }>;
    };
    risk: {
        score:    number;
        label:    string;
        topSites: Array<{
            websiteId:  string;
            url:        string;
            label:      string | null;
            score:      number;
            reasons:    string[];
            cveCount:   number;
            riskyPorts: number;
            subdomains: number;
            defacementStatus: string | null;
            lastScanAt: string | null;
        }>;
    };
}

@Injectable({ providedIn: 'root' })
export class ScannerService {
    private http = inject(HttpClient); // DI — NestJS kabi
    private api = environment.apiUrl;

    // Singleton state — navigation'da yo'qolmaydi
    nextPollAt = 0;
    pollIntervalMs = 60 * 60 * 1000;
    autoRefreshEnabled = false;
    private scanBadgeRefreshSubject = new Subject<void>();
    scanBadgeRefresh$ = this.scanBadgeRefreshSubject.asObservable();
    private nucleiScanStates = signal<Record<string, NucleiScanState>>({});
    private nucleiScanPromises = new Map<string, Promise<NucleiResult[]>>();
    private subdomainDiscoveryStates = signal<Record<string, SubdomainDiscoveryState>>({});
    private subdomainDiscoveryPromises = new Map<string, Promise<SubdomainResult[]>>();

    private readonly emptyNucleiScanState: NucleiScanState = {
        running: false,
        done: false,
        results: [],
        error: '',
        startedAt: null,
        completedAt: null,
    };

    private readonly emptySubdomainDiscoveryState: SubdomainDiscoveryState = {
        running: false,
        done: false,
        results: [],
        error: '',
        startedAt: null,
        completedAt: null,
    };

    notifyScanBadgesChanged() {
        this.scanBadgeRefreshSubject.next();
    }

    getNucleiScanState(websiteId: string): NucleiScanState {
        const states = this.nucleiScanStates();
        return states[websiteId] ?? this.emptyNucleiScanState;
    }

    setCachedNucleiResults(websiteId: string, results: NucleiResult[], done = results.length > 0) {
        if (!websiteId) return;
        const current = this.getNucleiScanState(websiteId);
        if (current.running) return;
        this.setNucleiScanState(websiteId, {
            ...current,
            done,
            results,
            error: '',
        });
    }

    startNucleiScan(websiteId: string, subdomains: string[]): Promise<NucleiResult[]> {
        if (!websiteId) return Promise.reject(new Error('Website ID topilmadi'));
        const running = this.nucleiScanPromises.get(websiteId);
        if (running) return running;

        const previous = this.getNucleiScanState(websiteId);
        this.setNucleiScanState(websiteId, {
            ...previous,
            running: true,
            done: false,
            error: '',
            startedAt: new Date().toISOString(),
            completedAt: null,
        });

        const request = firstValueFrom(this.runNuclei(websiteId, subdomains))
            .then(results => {
                this.setNucleiScanState(websiteId, {
                    running: false,
                    done: true,
                    results,
                    error: '',
                    startedAt: this.getNucleiScanState(websiteId).startedAt,
                    completedAt: new Date().toISOString(),
                });
                this.notifyScanBadgesChanged();
                return results;
            })
            .catch(error => {
                this.setNucleiScanState(websiteId, {
                    ...this.getNucleiScanState(websiteId),
                    running: false,
                    error: error?.error?.message ?? 'Nuclei skan muvaffaqiyatsiz tugadi',
                    completedAt: new Date().toISOString(),
                });
                throw error;
            })
            .finally(() => this.nucleiScanPromises.delete(websiteId));

        this.nucleiScanPromises.set(websiteId, request);
        return request;
    }

    private setNucleiScanState(websiteId: string, state: NucleiScanState) {
        this.nucleiScanStates.update(states => ({ ...states, [websiteId]: state }));
    }

    getSubdomainDiscoveryState(domain: string): SubdomainDiscoveryState {
        const key = this.normalizeDomainKey(domain);
        if (!key) return this.emptySubdomainDiscoveryState;
        const states = this.subdomainDiscoveryStates();
        return states[key] ?? this.emptySubdomainDiscoveryState;
    }

    setCachedSubdomainResults(domain: string, results: SubdomainResult[], done = results.length > 0) {
        const key = this.normalizeDomainKey(domain);
        if (!key) return;
        const current = this.getSubdomainDiscoveryState(key);
        if (current.running) return;
        this.setSubdomainDiscoveryState(key, {
            ...current,
            done,
            results,
            error: '',
        });
    }

    startSubdomainDiscovery(domain: string, websiteId?: string): Promise<SubdomainResult[]> {
        const key = this.normalizeDomainKey(domain);
        if (!key) return Promise.reject(new Error('Domen topilmadi'));
        const running = this.subdomainDiscoveryPromises.get(key);
        if (running) return running;

        this.setSubdomainDiscoveryState(key, {
            running: true,
            done: false,
            results: [],
            error: '',
            startedAt: new Date().toISOString(),
            completedAt: null,
        });

        const request = firstValueFrom(this.discoverSubdomains(key, websiteId))
            .then(results => {
                this.setSubdomainDiscoveryState(key, {
                    running: false,
                    done: true,
                    results,
                    error: '',
                    startedAt: this.getSubdomainDiscoveryState(key).startedAt,
                    completedAt: new Date().toISOString(),
                });
                this.notifyScanBadgesChanged();
                return results;
            })
            .catch(error => {
                this.setSubdomainDiscoveryState(key, {
                    ...this.getSubdomainDiscoveryState(key),
                    running: false,
                    error: error?.error?.message ?? 'Subdomen qidirish muvaffaqiyatsiz tugadi',
                    completedAt: new Date().toISOString(),
                });
                throw error;
            })
            .finally(() => this.subdomainDiscoveryPromises.delete(key));

        this.subdomainDiscoveryPromises.set(key, request);
        return request;
    }

    private setSubdomainDiscoveryState(domain: string, state: SubdomainDiscoveryState) {
        const key = this.normalizeDomainKey(domain);
        if (!key) return;
        this.subdomainDiscoveryStates.update(states => ({ ...states, [key]: state }));
    }

    private normalizeDomainKey(domain: string): string {
        return domain.trim().toLowerCase();
    }

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

    getPortScanResults(websiteId: string): Observable<PortScanResult[]> {
        return this.http.get<PortScanResult[]>(`${this.api}/scanner/ports/${websiteId}`);
    }

    scanPorts(websiteId: string, input: { host?: string; ports?: number[]; timeoutMs?: number }): Observable<PortScanResult[]> {
        return this.http.post<PortScanResult[]>(`${this.api}/scanner/ports/${websiteId}`, input);
    }

    // POST /api/scanner/scan-all
    scanAll(): Observable<void> {
        return this.http.post<void>(`${this.api}/scanner/scan-all`, {});
    }

    startBulkScan(input: {
        mode?: BulkScanMode;
        concurrency?: number;
        timeoutMs?: number;
        includeRecentlyScanned?: boolean;
        skipRecentHours?: number;
    }): Observable<BulkScanJob> {
        return this.http.post<BulkScanJob>(`${this.api}/scanner/bulk-scan/start`, input);
    }

    getCurrentBulkScan(): Observable<BulkScanJob | null> {
        return this.http.get<BulkScanJob | null>(`${this.api}/scanner/bulk-scan/current`);
    }

    getLiveScanActivity(): Observable<LiveScanActivity> {
        return this.http.get<LiveScanActivity>(`${this.api}/scanner/live-scan-activity`);
    }

    getBulkScan(id: string): Observable<BulkScanJob | null> {
        return this.http.get<BulkScanJob | null>(`${this.api}/scanner/bulk-scan/${id}`);
    }

    cancelBulkScan(id: string): Observable<BulkScanJob | null> {
        return this.http.post<BulkScanJob | null>(`${this.api}/scanner/bulk-scan/${id}/cancel`, {});
    }

    setInterval(minutes: number): Observable<any> {
        return this.http.post(`${this.api}/scanner/interval`, { minutes });
    }

    getInterval(): Observable<{ interval: number; dangerous?: boolean }> {
        return this.http.get<{ interval: number; dangerous?: boolean }>(`${this.api}/scanner/interval`);
    }

    getProxies(): Observable<ProxyStats> {
        return this.http.get<ProxyStats>(`${this.api}/scanner/proxies`);
    }

    getSystemStatus(): Observable<SystemStatus> {
        return this.http.get<SystemStatus>(`${this.api}/scanner/system-status`);
    }

    getOverviewStats(): Observable<OverviewStats> {
        return this.http.get<OverviewStats>(`${this.api}/scanner/overview-stats`);
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

    getCachedSubdomains(domain: string): Observable<SubdomainResult[]> {
        return this.http.get<SubdomainResult[]>(
            `${this.api}/scanner/subdomains/cache`, { params: { domain } }
        );
    }

    discoverSubdomains(domain: string, websiteId?: string): Observable<SubdomainResult[]> {
        const params: Record<string, string> = { domain };
        if (websiteId) params['websiteId'] = websiteId;
        return this.http.get<SubdomainResult[]>(
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
    getFeedSyncConfig(): Observable<ThreatFeedSyncConfig> {
        return this.http.get<ThreatFeedSyncConfig>(`${this.api}/scanner/threat-feeds/sync-config`);
    }

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

export interface ThreatFeedSyncConfig {
    autoEnabled: boolean;
    cron: string;
    scheduleLabel: string;
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
    source?:      'NUCLEI' | 'OSV' | 'NVD' | 'LOCAL_RULE' | string;
    confidence?:  number;
    referenceUrl?: string | null;
    evidence?:    Record<string, unknown>;
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
    'cms_change' | 'site_down' | 'defacement_change';

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
