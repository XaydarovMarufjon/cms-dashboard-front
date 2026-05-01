import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { User } from '../../shared/models/user.model';

export interface CreateUserDto {
  username: string;
  password: string;
  role:     'ADMIN' | 'WORKER' | 'MONITORING';
}

export interface UpdateUserDto {
  password?: string;
  role?:     'ADMIN' | 'WORKER' | 'MONITORING';
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);
  private api  = `${environment.apiUrl}/users`;

  getAll()                              { return this.http.get<User[]>(this.api); }
  create(dto: CreateUserDto)            { return this.http.post<User>(this.api, dto); }
  update(id: string, dto: UpdateUserDto){ return this.http.patch<User>(`${this.api}/${id}`, dto); }
  remove(id: string)                    { return this.http.delete<void>(`${this.api}/${id}`); }
}
