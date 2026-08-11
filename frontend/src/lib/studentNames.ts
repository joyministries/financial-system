import { studentsApi } from '@/api/client';

/**
 * Whole-school id → display-name map, fetched once per session.
 *
 * Tables, PDFs and statements use this to render "John Doe" instead of a raw
 * student UUID. The main students endpoint paginates (50 by default), which is
 * why resolving names from that list fails for everyone past the first page.
 */
let cachePromise: Promise<Map<string, { name: string; student_number: string }>> | null = null;

export function getStudentNames(): Promise<Map<string, { name: string; student_number: string }>> {
  if (!cachePromise) {
    cachePromise = studentsApi
      .names()
      .then((res) => {
        const map = new Map<string, { name: string; student_number: string }>();
        for (const s of res.data) {
          map.set(s.id, {
            name: `${s.first_name} ${s.last_name}`.trim(),
            student_number: s.student_number,
          });
        }
        return map;
      })
      .catch(() => {
        // Allow a retry on the next page load rather than failing the page.
        cachePromise = null;
        return new Map();
      });
  }
  return cachePromise;
}

export function clearStudentNamesCache() {
  cachePromise = null;
}
