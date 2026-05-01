import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

@Pipe({
  name: 'safeUrl',
  standalone: true,
})
export class SafeUrlPipe implements PipeTransform {
  private sanitizer = inject(DomSanitizer);

  transform(url: string | null | undefined): any {
    if (!url) return '';
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }
}