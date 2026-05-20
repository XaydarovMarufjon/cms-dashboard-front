import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AuditEntry {
  id:        string;
  userId:    string | null;
  username:  string | null;
  action:    string;
  method:    string | null;
  path:      string | null;
  targetId:  string | null;
  metadata:  any;
  ip:        string | null;
  userAgent: string | null;
  device:    string | null;
  createdAt: string;
}

export interface AuditList {
  items: AuditEntry[];
  total: number;
  page:  number;
  limit: number;
}

export interface SessionEntry {
  id:           string;
  userId:       string;
  jti:          string;
  ip:           string | null;
  userAgent:    string | null;
  device:       string | null;
  lastActiveAt: string;
  createdAt:    string;
  expiresAt:    string;
  revokedAt:    string | null;
  user:         { id: string; username: string; role: string };
}

export interface AuditFilter {
  from?:    string;
  to?:      string;
  userId?:  string;
  action?:  string;
  page?:    number;
  limit?:   number;
}

@Injectable({ providedIn: 'root' })
export class LogsService {
  private http = inject(HttpClient);
  private api  = environment.apiUrl;

  getActivity(filter: AuditFilter = {}): Observable<AuditList> {
    let p = new HttpParams();
    if (filter.from)   p = p.set('from',   filter.from);
    if (filter.to)     p = p.set('to',     filter.to);
    if (filter.userId) p = p.set('userId', filter.userId);
    if (filter.action) p = p.set('action', filter.action);
    if (filter.page)   p = p.set('page',   String(filter.page));
    if (filter.limit)  p = p.set('limit',  String(filter.limit));
    return this.http.get<AuditList>(`${this.api}/logs/activity`, { params: p });
  }

  getSessions(): Observable<SessionEntry[]> {
    return this.http.get<SessionEntry[]>(`${this.api}/logs/sessions`);
  }

  revokeSession(id: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.api}/logs/sessions/${id}/revoke`, {});
  }
}
