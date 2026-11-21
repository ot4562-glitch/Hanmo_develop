// 학사 기능만 위한 최소 계약 진입점이다. 계정 소유자·서버·개인 기록 계약은 포함하지 않는다.
export * from './academics/index.js';
export * from './self/major-what-if.js';
export * from './self/study-plan-check.js';
import {z} from 'zod';
export const OwnerWorkspaceValueSchema=z.strictObject({
  kind:z.literal('STUDY_PLAN'),
  dataMode:z.enum(['SYNTHETIC','OWNER_CONSENTED']),
  state:z.literal('DRAFT'),
  courseId:z.string().regex(/^[A-Za-z0-9_-]{1,90}$/),
  targetTerm:z.union([z.string().regex(/^20\d{2}-[12]$/),z.literal('UNDECIDED')]),
  planned:z.boolean(),
});
export type OwnerWorkspaceValue=z.infer<typeof OwnerWorkspaceValueSchema>;
