import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Website, CreateWebsiteDto } from '../../shared/models/website.model';
import { environment } from '../../../environments/enviroment';

@Injectable({ providedIn: 'root' })
export class WebsiteService {
  private http = inject(HttpClient);
  private api  = environment.apiUrl;

  getAll(): Observable<Website[]> {
    return this.http.get<Website[]>(`${this.api}/scanner/websites`);
  }

  create(dto: CreateWebsiteDto): Observable<Website> {
    return this.http.post<Website>(`${this.api}/scanner/websites`, dto);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/scanner/websites/${id}`);
  }
}