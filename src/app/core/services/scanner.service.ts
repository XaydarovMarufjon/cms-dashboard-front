import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ScanResult } from '../../shared/models/website.model';
import { environment } from '../../../environments/enviroment';

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
}