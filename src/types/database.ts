// Database types matching the Supabase schema
// Run `supabase gen types typescript` to regenerate from a live project

export type Role = 'member' | 'committee' | 'admin'
export type SignupStatus = 'pending' | 'confirmed'
export type BalanceStatus = 'unpaid' | 'partially_paid' | 'paid' | 'pending_confirmation'
export type PaymentMethod = 'stripe' | 'zelle' | 'cashapp' | 'check' | 'other'

export type SocialLinks = {
  facebook?: string | null
  instagram?: string | null
  linkedin?: string | null
}

export type VisibilitySettings = {
  phone?: 'members' | 'committee' | 'none'
  address?: 'members' | 'committee' | 'none'
  email?: 'members' | 'committee' | 'none'
}

export type Member = {
  id: string
  auth_user_id: string | null
  name: string
  email: string
  phone: string | null
  address: string | null
  family_branch: string | null
  bio: string | null
  photo_url: string | null
  social_links: SocialLinks
  role: Role
  created_by_proxy: boolean
  visibility_settings: VisibilitySettings
  created_at: string
  updated_at: string
}

export type Reunion = {
  id: string
  name: string
  year: number
  description: string | null
  created_by: string | null
  created_at: string
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
