import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CreateUrlCheckerSiteDto, UrlCheckerSite } from '../../shared/models/website.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UrlCheckerSiteService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  getAll(): Observable<UrlCheckerSite[]> {
    return this.http.get<UrlCheckerSite[]>(`${this.api}/scanner/url-checker-sites`);
  }

  create(dto: CreateUrlCheckerSiteDto): Observable<UrlCheckerSite> {
    return this.http.post<UrlCheckerSite>(`${this.api}/scanner/url-checker-sites`, dto);
  }

  update(id: string, dto: Partial<CreateUrlCheckerSiteDto>): Observable<UrlCheckerSite> {
    return this.http.patch<UrlCheckerSite>(`${this.api}/scanner/url-checker-sites/${id}`, dto);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/scanner/url-checker-sites/${id}`);
  }
}
