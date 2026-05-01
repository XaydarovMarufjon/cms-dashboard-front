import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ScanResult } from '../../shared/models/website.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ScannerService {
    private http = inject(HttpClient); // DI — NestJS kabi
    private api = environment.apiUrl;

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

    discoverSubdomains(domain: string): Observable<Array<{ subdomain: string; alive: boolean; source: string[] }>> {
        return this.http.get<Array<{ subdomain: string; alive: boolean; source: string[] }>>(
            `${this.api}/scanner/subdomains`, { params: { domain } }
        );
    }
}