// src/app/core/services/website.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Website, CreateWebsiteDto } from '../../shared/models/website.model';
import { environment } from '../../../environments/enviroment.prod';

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

  // ✅ YANGI: tahrirlash
  update(id: string, dto: Partial<CreateWebsiteDto>): Observable<Website> {
    return this.http.patch<Website>(`${this.api}/scanner/websites/${id}`, dto);
  }

  // ✅ YANGI: o'chirish
  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/scanner/websites/${id}`);
  }
}

// <img src="csec_logo.png" alt="CMS Radar Logo" style="width:82px;">
//       <!-- </div> -->
//       <div>
//         <div class="brand-name">CMS <span>Monitoring</span></div>
//         <div class="brand-sub">v1.2 detektor</div>
//       </div>