// Database types matching the Supabase schema
// Run `supabase gen types typescript` to regenerate from a live project

import type { ReunionPhase } from '@/lib/reunion-phase'

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
  /**
   * Lifecycle stage. Advisory — it drives what the app surfaces and suggests,
   * never what it permits. See `src/lib/reunion-phase.ts`.
   */
  status: ReunionPhase
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
  /**
   * The old free-text list of who is coming. Superseded by `attendees`, and
   * kept until the UI reads those instead — see migration 025.
   */
  guest_names: string | null
  status: SignupStatus
  created_at: string
}

export type AgeBand = 'adult' | 'senior' | 'teen' | 'child' | 'toddler'

/**
 * One named person on a signup. The signup's `headcount` stays authoritative
 * for numbers; these are the detail behind it, and the two are deliberately
 * allowed to disagree while a family is part-way through filling them in.
 */
export type Attendee = {
  id: string
  signup_id: string
  name: string
  age_band: AgeBand | null
  dietary_notes: string | null
  accessibility_notes: string | null
  created_at: string
}

/** The unit a family actually answers as. Groups members; does not own money. */
export type Household = {
  id: string
  name: string
  family_branch: string | null
  primary_contact_id: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  created_by: string | null
  created_at: string
}

/** A member belongs to at most one household — the member is the key. */
export type HouseholdMember = {
  household_id: string
  member_id: string
  created_at: string
}

export type Balance = {
  id: string
  member_id: string
  reunion_id: string
  sub_event_id: string | null
  amount_owed: number
  /** Derived by trigger from the confirmed rows in `payments` — never write it directly. */
  amount_paid: number
  payment_method: PaymentMethod | null
  stripe_checkout_session_id: string | null
  /** Derived by trigger from amount_owed, amount_paid and pending payments. */
  status: BalanceStatus
  updated_at: string
}

export type PaymentStatus = 'pending' | 'confirmed'

/** One payment against a balance. Negative amounts are refunds. */
export type Payment = {
  id: string
  balance_id: string
  member_id: string
  reunion_id: string
  amount: number
  method: PaymentMethod
  status: PaymentStatus
  paid_at: string
  note: string | null
  stripe_session_id: string | null
  /**
   * Which method Stripe actually charged: 'apple_pay', 'google_pay', 'cashapp',
   * 'card', … Null for manual payments and for Stripe payments taken before
   * this was captured. Deliberately a plain string, not a union — Stripe adds
   * methods, and a union here would turn each new one into a type error on a
   * value the database is happy to store. Use formatPaymentMethod() to render.
   */
  stripe_payment_method: string | null
  recorded_by: string | null
  created_at: string
}

/** How a deadline's amount is worked out for a given member. */
export type DeadlineAmountType = 'percent' | 'fixed_per_person' | 'remainder'

/**
 * A payment checkpoint on an event.
 *
 * What each member owes by this date is not stored — it is this row applied to
 * their balance and headcount. See `src/lib/payment-schedule.ts`.
 */
export type EventDeadline = {
  id: string
  sub_event_id: string
  label: string
  due_date: string
  amount_type: DeadlineAmountType
  /** Null exactly when `amount_type` is 'remainder'. */
  amount_value: number | null
  /** Days before `due_date` to email a reminder; one send per entry. */
  reminder_offsets: number[]
  sort_order: number
  created_at: string
}

export type EmailSendKind = 'statement' | 'deadline_reminder' | 'payment_receipt'

/** A record that we sent something, and the dedupe key that stops a repeat. */
export type EmailSend = {
  id: string
  kind: EmailSendKind
  member_id: string
  reunion_id: string
  deadline_id: string | null
  offset_days: number | null
  payment_id: string | null
  sent_at: string
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

/** One comment on a photo. Author is nullable: a deleted member's words stay. */
export type PhotoCommentRow = {
  id: string
  photo_id: string
  author_id: string | null
  body: string
  created_at: string
}

/**
 * One like. There is no id — the pair is the primary key, which is what makes
 * "one like per member per photo" true regardless of what the UI does.
 */
export type PhotoLike = {
  photo_id: string
  member_id: string
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

export type PhotoCommentWithAuthor = PhotoCommentRow & {
  author?: Pick<Member, 'id' | 'name' | 'photo_url'>
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
