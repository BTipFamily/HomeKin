'use client'

import { useMemo, useState } from 'react'
import { Map, Marker, NavigationControl, Popup } from 'react-map-gl/mapbox'
import { Home } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'
import 'mapbox-gl/dist/mapbox-gl.css'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

type MapMember = {
  id: string
  name: string
  photo_url: string | null
  latitude: number
  longitude: number
}

type ReunionLocation = {
  name: string
  latitude: number
  longitude: number
}

interface TravelMapProps {
  members: MapMember[]
  reunionLocation: ReunionLocation | null
}

type Selected =
  | { type: 'member'; data: MapMember }
  | { type: 'reunion'; data: ReunionLocation }
  | null

export function TravelMap({ members, reunionLocation }: TravelMapProps) {
  const [selected, setSelected] = useState<Selected>(null)

  const initialViewState = useMemo(() => {
    const points = [
      ...members.map((m) => ({ lat: m.latitude, lng: m.longitude })),
      ...(reunionLocation ? [{ lat: reunionLocation.latitude, lng: reunionLocation.longitude }] : []),
    ]
    if (points.length === 0) {
      return { latitude: 39.8283, longitude: -98.5795, zoom: 3 }
    }
    const latitude = points.reduce((sum, p) => sum + p.lat, 0) / points.length
    const longitude = points.reduce((sum, p) => sum + p.lng, 0) / points.length
    return { latitude, longitude, zoom: 3 }
  }, [members, reunionLocation])

  if (!MAPBOX_TOKEN) {
    return (
      <div className="rounded-lg border bg-muted/20 px-6 py-16 text-center text-sm text-muted-foreground">
        Map isn&apos;t configured yet. Set{' '}
        <code className="rounded bg-muted px-1 py-0.5">NEXT_PUBLIC_MAPBOX_TOKEN</code> to enable it.
      </div>
    )
  }

  if (members.length === 0 && !reunionLocation) {
    return (
      <div className="rounded-lg border bg-muted/20 px-6 py-16 text-center text-sm text-muted-foreground">
        No locations to show yet. Add an address to your profile, or set this reunion&apos;s
        location from the Manage page.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Map
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={initialViewState}
        style={{ width: '100%', height: 520 }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
      >
        <NavigationControl position="top-right" />

        {members.map((m) => (
          <Marker
            key={m.id}
            latitude={m.latitude}
            longitude={m.longitude}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation()
              setSelected({ type: 'member', data: m })
            }}
          >
            <Avatar className="h-8 w-8 cursor-pointer border-2 border-background shadow-md">
              {m.photo_url && <AvatarImage src={m.photo_url} alt={m.name} />}
              <AvatarFallback className="text-[10px]">{getInitials(m.name)}</AvatarFallback>
            </Avatar>
          </Marker>
        ))}

        {reunionLocation && (
          <Marker
            latitude={reunionLocation.latitude}
            longitude={reunionLocation.longitude}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation()
              setSelected({ type: 'reunion', data: reunionLocation })
            }}
          >
            <div className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-md">
              <Home className="h-4 w-4" />
            </div>
          </Marker>
        )}

        {selected && (
          <Popup
            latitude={selected.data.latitude}
            longitude={selected.data.longitude}
            anchor="top"
            onClose={() => setSelected(null)}
            closeOnClick={false}
          >
            <p className="text-sm font-medium">
              {selected.type === 'reunion' ? `This year: ${selected.data.name}` : selected.data.name}
            </p>
          </Popup>
        )}
      </Map>
    </div>
  )
}
