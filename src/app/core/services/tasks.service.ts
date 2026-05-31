import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { User } from '../../shared/models/user.model';

export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type TaskSource = 'MANUAL' | 'CVE' | 'PORT' | 'SUBDOMAIN' | 'SSL' | 'CMS';

export interface SecurityTask {
  id:          string;
  title:       string;
  description: string | null;
  source:      TaskSource | string;
  status:      TaskStatus | string;
  priority:    TaskPriority | string;
  dueDate:     string | null;
  websiteId:   string | null;
  assigneeId:  string | null;
  createdById: string | null;
  createdAt:   string;
  updatedAt:   string;
  website?:    { id: string; url: string; label?: string | null } | null;
  assignee?:   Pick<User, 'id' | 'username' | 'role'> | null;
  createdBy?:  Pick<User, 'id' | 'username' | 'role'> | null;
}

export interface CreateTaskDto {
  title: string;
  description?: string;
  source?: TaskSource;
  priority?: TaskPriority;
  dueDate?: string | null;
  websiteId?: string | null;
  assigneeId?: string | null;
}

export type UpdateTaskDto = Partial<CreateTaskDto> & {
  status?: TaskStatus;
};

@Injectable({ providedIn: 'root' })
export class TasksService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/tasks`;

  getAll(filter?: { status?: string; assigneeId?: string; websiteId?: string }) {
    const params: Record<string, string> = {};
    if (filter?.status) params['status'] = filter.status;
    if (filter?.assigneeId) params['assigneeId'] = filter.assigneeId;
    if (filter?.websiteId) params['websiteId'] = filter.websiteId;
    return this.http.get<SecurityTask[]>(this.api, { params });
  }

  getAssignees() {
    return this.http.get<User[]>(`${this.api}/assignees`);
  }

  create(dto: CreateTaskDto) {
    return this.http.post<SecurityTask>(this.api, dto);
  }

  update(id: string, dto: UpdateTaskDto) {
    return this.http.patch<SecurityTask>(`${this.api}/${id}`, dto);
  }

  remove(id: string) {
    return this.http.delete<void>(`${this.api}/${id}`);
  }
}
