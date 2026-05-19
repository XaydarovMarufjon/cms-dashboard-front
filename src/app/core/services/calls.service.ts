import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type CategoryColor = 'normal' | 'green';

export interface CallCategory {
  id:        string;
  name:      string;
  color:     CategoryColor;
  createdAt: string;
}

export interface CallRow {
  id:          string;
  category:    string;
  phoneNumber: string | null;
  note:        string | null;
  createdAt:   string;
  updatedAt:   string;
}

export interface CallFilter {
  month?:    string;   // 'YYYY-MM'
  from?:     string;   // 'YYYY-MM-DD'
  to?:       string;   // 'YYYY-MM-DD'
  category?: string;
}

@Injectable({ providedIn: 'root' })
export class CallsService {
  private http = inject(HttpClient);
  private api  = environment.apiUrl;

  // ── Categories ──
  getCategories(): Observable<CallCategory[]> {
    return this.http.get<CallCategory[]>(`${this.api}/call-categories`);
  }

  createCategory(name: string, color: CategoryColor = 'normal'): Observable<CallCategory> {
    return this.http.post<CallCategory>(`${this.api}/call-categories`, { name, color });
  }

  updateCategory(id: string, data: { name?: string; color?: CategoryColor }): Observable<CallCategory> {
    return this.http.patch<CallCategory>(`${this.api}/call-categories/${id}`, data);
  }

  deleteCategory(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.api}/call-categories/${id}`);
  }

  // ── Calls ──
  getCalls(filter: CallFilter = {}): Observable<CallRow[]> {
    let params = new HttpParams();
    if (filter.month)    params = params.set('month', filter.month);
    if (filter.from)     params = params.set('from', filter.from);
    if (filter.to)       params = params.set('to', filter.to);
    if (filter.category) params = params.set('category', filter.category);
    return this.http.get<CallRow[]>(`${this.api}/calls`, { params });
  }

  createCall(category: string): Observable<CallRow> {
    return this.http.post<CallRow>(`${this.api}/calls`, { category });
  }

  updateCall(id: string, data: { phoneNumber?: string | null; category?: string; note?: string | null; createdAt?: string }): Observable<CallRow> {
    return this.http.patch<CallRow>(`${this.api}/calls/${id}`, data);
  }

  deleteCall(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.api}/calls/${id}`);
  }
}
