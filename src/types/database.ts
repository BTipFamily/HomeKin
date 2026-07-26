// Database types matching the Supabase schema
// Run `supabase gen types typescript` to regenerate from a live project

export type Role = 'member' | 'committee' | 'admin'
export type SignupStatus = 'pending' | 'confirmed'
export type BalanceStatus = 'unpaid' | 'partially_paid' | 'paid' | 'pending_confirmation'
export type PaymentMethod = 'stripe' | 'zelle' | 'cashapp' | 'check' | 'other'
export type Gender = 'male' | 'female'
export type RelationshipType = 'parent_child' | 'partner' | 'custom'
export type ParentChildKind = 'biological' | 'step' | 'adoptive' | 'foster'
export type PartnerStatus =
  | 'married'
  | 'divorced'
  | 'separated'
  | 'partnered'
  | 'widowed'
  | 'engaged'

export type SocialLinks = {
  facebook?: string | null
  instagram?: string | null
  linkedin?: string | null
}

export type VisibilitySettings = {
  phone?: 'members' | 'committee' | 'none'
  address?: 'members' | 'committee' | 'none'
  email?: 'members' | 'committee' | 'none'
  date_of_birth?: 'members' | 'committee' | 'none'
}

export type Member = {
  id: string
  auth_user_id: string | null
  name: string
  email: string
  phone: string | null
  address: string | null
  family_branch: string | null
  /** ISO date (YYYY-MM-DD), or null when the member hasn't given one. */
  date_of_birth: string | null
  bio: string | null
  photo_url: string | null
  social_links: SocialLinks
  role: Role
  created_by_proxy: boolean
  visibility_settings: VisibilitySettings
  gender: Gender | null
  latitude: number | null
  longitude: number | null
  geocoded_address: string | null
  geocode_updated_at: string | null
  created_at: string
  updated_at: string
}

export type Reunion = {
  id: string
  name: string
  year: number
  description: string | null
  location_name: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  start_date: string | null
  end_date: string | null
  created_by: string | null
  created_at: string
}

export type BudgetCategoryKey =
  | 'venue'
  | 'catering'
  | 'activities'
  | 'entertainment'
  | 'heritage'
  | 'merchandise'
  | 'photography'
  | 'lodging'

export type BudgetEstimateType =
  | 'one_time'
  | 'per_person'
  | 'per_person_day'
  | 'per_adult_day'
  | 'per_room_night'

export type BudgetCategory = {
  key: BudgetCategoryKey
  label: string
  enabled: boolean
  estimate_type: BudgetEstimateType
  unit_amount: number
}

export type BudgetStyle = 'low' | 'average' | 'high'

export type LodgingType = 'hotel_resort' | 'vacation_rental' | 'mixed'

export type ReunionBudgetEstimate = {
  id: string
  reunion_id: string
  host_city: string | null
  nights: number
  budget_style: BudgetStyle
  adults_count: number
  youth_count: number
  toddlers_count: number
  lodging_type: LodgingType
  categories: BudgetCategory[]
  total_estimate: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export type TimelineItemCategory =
  | 'logistics'
  | 'venue'
  | 'lodging'
  | 'rsvp'
  | 'vendor'
  | 'merchandise'
  | 'heritage'
  | 'final'

export type ReunionTimelineItem = {
  id: string
  reunion_id: string
  title: string
  phase_label: string | null
  category: TimelineItemCategory
  due_date: string | null
  is_complete: boolean
  is_custom: boolean
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export type Relationship = {
  id: string
  member_id: string
  related_member_id: string
  relationship_type: RelationshipType
  parent_child_kind: ParentChildKind | null
  partner_status: PartnerStatus | null
  partner_start_date: string | null
  partner_end_date: string | null
  custom_label: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type SubEvent = {
  id: string
  reunion_id: string
  name: string
  description: string | null
  date: string
  time: string | null
  location_name: string | null
  address: string | null
  cost_per_person: number
  capacity: number | null
  duration_minutes: number | null
  latitude: number | null
  longitude: number | null
  geocoded_address: string | null
  geocode_updated_at: string | null
  created_by: string | null
  created_at: string
}

export type Signup = {
  id: string
  sub_event_id: string
  member_id: string
  headcount: number
  guest_names: string | null
  status: SignupStatus
  created_at: string
}

export type Balance = {
  id: string
  member_id: string
  reunion_id: string
  sub_event_id: string | null
  amount_owed: number
  amount_paid: number
  payment_method: PaymentMethod | null
  stripe_checkout_session_id: string | null
  status: BalanceStatus
  updated_at: string
}

export type Announcement = {
  id: string
  reunion_id: string
  title: string
  body: string
  pinned: boolean
  sent_via_email: boolean
  created_by: string | null
  created_at: string
}

export type Invitation = {
  id: string
  reunion_id: string
  sub_event_id: string | null
  member_id: string | null
  token: string
  sent_at: string | null
  opened_at: string | null
  responded_at: string | null
  created_at: string
}

export type InviteCode = {
  id: string
  code: string
  reunion_id: string | null
  created_by: string | null
  used_by: string | null
  used_at: string | null
  expires_at: string | null
  /** Address the signup link was emailed to, or null if shared manually. */
  sent_to: string | null
  /** Set only once the email actually went out. */
  sent_at: string | null
  created_at: string
}

export type Photo = {
  id: string
  reunion_id: string
  sub_event_id: string | null
  uploaded_by: string | null
  storage_path: string
  caption: string | null
  tagged_members: string[]
  created_at: string
}

export type Message = {
  id: string
  reunion_id: string
  sub_event_id: string | null
  sender_id: string | null
  body: string
  created_at: string
}

export type DirectMessage = {
  id: string
  sender_id: string | null
  recipient_id: string | null
  body: string
  created_at: string
  read_at: string | null
}

// Joined/enriched types used in UI
export type MemberWithSignup = Member & {
  signup?: Signup
}

export type SubEventWithSignupCount = SubEvent & {
  signup_count: number
  user_signup?: Signup
}

export type AnnouncementWithAuthor = Announcement & {
  author?: Pick<Member, 'id' | 'name' | 'photo_url'>
}

export type PhotoWithUploader = Photo & {
  uploader?: Pick<Member, 'id' | 'name' | 'photo_url'>
}

export type SurveyQuestion = {
  question: string
  type: 'free_text' | 'multiple_choice'
  options?: string[]
}

export type Survey = {
  id: string
  reunion_id: string
  title: string
  questions: SurveyQuestion[]
  created_by: string | null
  created_at: string
}

export type SurveyResponse = {
  id: string
  survey_id: string
  member_id: string
  answers: Record<string, string>
  submitted_at: string
}

export type MessageWithSender = Message & {
  sender?: Pick<Member, 'id' | 'name' | 'photo_url'>
}
