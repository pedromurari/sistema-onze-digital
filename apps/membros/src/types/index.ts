import type { Database } from './database'

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Product = Database['public']['Tables']['products']['Row']
export type Module = Database['public']['Tables']['modules']['Row']
export type Lesson = Database['public']['Tables']['lessons']['Row']
export type Enrollment = Database['public']['Tables']['enrollments']['Row']
export type Progress = Database['public']['Tables']['progress']['Row']
export type CourseProgress = Database['public']['Views']['course_progress']['Row']

export type ModuleWithLessons = Module & { lessons: Lesson[] }
export type ProductWithModules = Product & { modules: ModuleWithLessons[] }
export type ProgressMap = Record<string, Progress>

export type PartnerTheme = Database['public']['Tables']['partner_themes']['Row']
export type Partner = Database['public']['Tables']['partners']['Row']
export type PartnerLink = Database['public']['Tables']['partner_links']['Row']
export type PartnerWithRelations = Partner & { theme: PartnerTheme | null; links: PartnerLink[] }
