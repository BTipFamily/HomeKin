import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canViewField } from '@/lib/visibility'
import { TravelMap } from './travel-map'

interface MapPageProps {
  params: Promise<{ id: string }>
}

export default async function MapPage({ params }: MapPageProps) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single()
  if (!member) redirect('/login')

  const { data: reunion } = await supabase
    .from('reunions')
    .select('id, name, location_name, address, latitude, longitude')
    .eq('id', id)
    .single()
  if (!reunion) notFound()

  const { data: members } = await supabase
    .from('members')
    .select('id, name, photo_url, latitude, longitude, visibility_settings')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)

  const visibleMembers = (members ?? [])
    .filter(
      (m) => m.id === member.id || canViewField(m.visibility_settings, 'address', member.role)
    )
    .map((m) => ({
      id: m.id,
      name: m.name,
      photo_url: m.photo_url,
      latitude: m.latitude as number,
      longitude: m.longitude as number,
    }))

  const reunionLocation =
    reunion.latitude != null && reunion.longitude != null
      ? {
          name: reunion.location_name || reunion.name,
          latitude: reunion.latitude,
          longitude: reunion.longitude,
        }
      : null

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Travel Map</h1>
        <p className="text-sm text-muted-foreground">
          Where the family is coming from{reunionLocation ? ` — and this year's reunion location` : ''}
        </p>
      </div>

      <TravelMap members={visibleMembers} reunionLocation={reunionLocation} />
    </div>
  )
}
