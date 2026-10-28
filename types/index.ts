// types/index.ts
import { TranslationKey } from '@/lib/translations'

export type ProjectStage =
  | 'quotation'
  | 'material_approval'
  | 'templating'
  | 'drawings_submission'
  | 'drawings_approval'
  | 'fabrication'
  | 'shipping'
  | 'delivery'
  | 'installation'
  | 'snagging'
  | 'handover'

export type ProjectStatus = 'active' | 'complete' | 'on_hold' | 'overdue'
export type TaskStatus = 'not_started' | 'in_progress' | 'waiting' | 'completed' | 'delayed'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type UserRole = 'admin' | 'manager' | 'member'

export interface User {
  id: string
  email: string
  full_name: string
  avatar_url?: string
  role: UserRole
  color: string
  phone?: string
  department?: string
  created_at: string
}

export interface Project {
  id: string
  name: string
  client: string
  architect?: string
  contractor?: string
  project_manager_id: string
  project_manager?: User
  team_members?: User[]
  value?: number
  start_date?: string
  completion_date?: string
  current_stage: ProjectStage
  status: ProjectStatus
  next_action?: string
  notes?: string
  address?: string
  reference?: string
  created_at: string
  updated_at: string
  milestones?: ProjectMilestone[]
  tasks?: Task[]
  documents?: Document[]
}

export interface ProjectMilestone {
  id: string
  project_id: string
  stage: ProjectStage
  status: 'complete' | 'active' | 'waiting' | 'overdue' | 'planned'
  planned_date?: string
  actual_date?: string
  notes?: string
}

export interface Task {
  id: string
  project_id: string
  project?: Project
  title: string
  description?: string
  assigned_to_id?: string
  assigned_to?: User
  created_by_id: string
  due_date?: string
  priority: TaskPriority
  status: TaskStatus
  comments?: TaskComment[]
  attachments?: string[]
  created_at: string
  updated_at: string
}

export interface TaskComment {
  id: string
  task_id: string
  user_id: string
  user?: User
  content: string
  created_at: string
}

export interface Document {
  id: string
  project_id: string
  name: string
  file_url: string
  file_type: string
  file_size: number
  uploaded_by_id: string
  uploaded_by?: User
  category: 'drawing' | 'quotation' | 'purchase_order' | 'photo' | 'meeting_minutes' | 'other'
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  title: string
  body: string
  type: 'task_assigned' | 'task_due' | 'task_overdue' | 'project_update' | 'mention'
  read: boolean
  link?: string
  created_at: string
}

export interface ActivityLog {
  id: string
  project_id?: string
  user_id: string
  user?: User
  action: string
  details?: string
  created_at: string
}

export const STAGE_CONFIG: Record<ProjectStage, { label: string; labelKey: TranslationKey; color: string; bg: string; order: number }> = {
  quotation:           { label: 'Quotation',                labelKey: 'proj_stage_quotation',           color: '#64748B', bg: '#F8FAFC', order: 1  },
  material_approval:   { label: 'Material Approval',        labelKey: 'proj_stage_material_approval',   color: '#F59E0B', bg: '#FFFBEB', order: 2  },
  templating:          { label: 'Templating',               labelKey: 'proj_stage_templating',          color: '#65A30D', bg: '#F7FEE7', order: 3  },
  drawings_submission: { label: 'Shop Drawings Submission',  labelKey: 'proj_stage_drawings_submission', color: '#0891B2', bg: '#ECFEFF', order: 4  },
  drawings_approval:   { label: 'Shop Drawings Approval',   labelKey: 'proj_stage_drawings_approval',   color: '#2563EB', bg: '#EFF6FF', order: 5  },
  fabrication:         { label: 'Fabrication',              labelKey: 'proj_stage_fabrication',         color: '#7C3AED', bg: '#F5F3FF', order: 6  },
  shipping:            { label: 'Shipping',                  labelKey: 'proj_stage_shipping',            color: '#DB2777', bg: '#FDF2F8', order: 7  },
  delivery:            { label: 'Delivery Onsite',           labelKey: 'proj_stage_delivery',            color: '#EA580C', bg: '#FFF7ED', order: 8  },
  installation:        { label: 'Installation',              labelKey: 'proj_stage_installation',        color: '#0D9488', bg: '#F0FDFA', order: 9  },
  snagging:            { label: 'Snagging',                  labelKey: 'proj_stage_snagging',            color: '#8C7F58', bg: '#F5F3EE', order: 10 },
  handover:            { label: 'Handover',                  labelKey: 'proj_stage_handover',             color: '#059669', bg: '#ECFDF5', order: 11 },
}

export const STAGES_IN_ORDER = Object.values(STAGE_CONFIG).sort((a, b) => a.order - b.order)

export const TASK_STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  not_started: { label: 'Not Started', color: '#6B7280', bg: '#F3F4F6' },
  in_progress: { label: 'In Progress', color: '#3B82F6', bg: '#EFF6FF' },
  waiting:     { label: 'Waiting',     color: '#F59E0B', bg: '#FFFBEB' },
  completed:   { label: 'Completed',   color: '#10B981', bg: '#ECFDF5' },
  delayed:     { label: 'Delayed',     color: '#EF4444', bg: '#FEF2F2' },
}

export const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string }> = {
  low:    { label: 'Low',    color: '#6B7280' },
  medium: { label: 'Medium', color: '#3B82F6' },
  high:   { label: 'High',   color: '#F59E0B' },
  urgent: { label: 'Urgent', color: '#EF4444' },
}
