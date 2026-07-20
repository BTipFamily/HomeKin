'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Map, Marker, NavigationControl, Popup } from 'react-map-gl/mapbox'
import { Calendar, Home, Layers, Map as MapIcon } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { cn, formatDate, getInitials } from '@/lib/utils'
import 'mapbox-gl/dist/mapbox-gl.css'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

const MAP_STYLES = {
  explore: 'mapbox://styles/mapbox/streets-v12',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
} as const

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

type MapEvent = {
  id: string
  name: string
  date: string
  location_name: string | null
  latitude: number
  longitude: number
}

interface TravelMapProps {
  members: MapMember[]
  reunionLocation: ReunionLocation | null
  events: MapEvent[]
  reunionId: string
}

type Selected =
  | { type: 'member'; data: MapMember }
  | { type: 'reunion'; data: ReunionLocation }
  | { type: 'event'; data: MapEvent }
  | null

export function TravelMap({ members, reunionLocation, events, reunionId }: TravelMapProps) {
  const [selected, setSelected] = useState<Selected>(null)
  const [styleMode, setStyleMode] = useState<'explore' | 'satellite'>('explore')

  const initialViewState = useMemo(() => {
    const points = [
      ...members.map((m) => ({ lat: m.latitude, lng: m.longitude })),
      ...events.map((e) => ({ lat: e.latitude, lng: e.longitude })),
      ...(reunionLocation ? [{ lat: reunionLocation.latitude, lng: reunionLocation.longitude }] : []),
    ]
    if (points.length === 0) {
      return { latitude: 39.8283, longitude: -98.5795, zoom: 3 }
    }
    const latitude = points.reduce((sum, p) => sum + p.lat, 0) / points.length
    const longitude = points.reduce((sum, p) => sum + p.lng, 0) / points.length
    return { latitude, longitude, zoom: 3 }
  }, [members, events, reunionLocation])

  if (!MAPBOX_TOKEN) {
    return (
      <div className="rounded-lg border bg-muted/20 px-6 py-16 text-center text-sm text-muted-foreground">
        Map isn&apos;t configured yet. Set{' '}
        <code className="rounded bg-muted px-1 py-0.5">NEXT_PUBLIC_MAPBOX_TOKEN</code> to enable it.
      </div>
    )
  }

  if (members.length === 0 && events.length === 0 && !reunionLocation) {
    return (
      <div className="rounded-lg border bg-muted/20 px-6 py-16 text-center text-sm text-muted-foreground">
        No locations to show yet. Add an address to your profile, set this reunion&apos;s location
        from the Manage page, or add an address to an event.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Map
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={initialViewState}
        style={{ width: '100%', height: 520 }}
        mapStyle={MAP_STYLES[styleMode]}
      >
        <NavigationControl position="top-right" />

        <div className="absolute left-2 top-2 z-10 flex overflow-hidden rounded-md border bg-background shadow-sm">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              'rounded-none gap-1.5',
              styleMode === 'explore' && 'bg-primary/10 text-primary'
            )}
            onClick={() => setStyleMode('explore')}
          >
            <MapIcon className="h-3.5 w-3.5" />
            Explore
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              'rounded-none gap-1.5 border-l',
              styleMode === 'satellite' && 'bg-primary/10 text-primary'
            )}
            onClick={() => setStyleMode('satellite')}
          >
            <Layers className="h-3.5 w-3.5" />
            Satellite
          </Button>
        </div>

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

        {events.map((e) => (
          <Marker
            key={e.id}
            latitude={e.latitude}
            longitude={e.longitude}
            anchor="bottom"
            onClick={(ev) => {
              ev.originalEvent.stopPropagation()
              setSelected({ type: 'event', data: e })
            }}
          >
            <div className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 border-background bg-secondary text-secondary-foreground shadow-md">
              <Calendar className="h-4 w-4" />
            </div>
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
            {selected.type === 'reunion' && (
              <p className="text-sm font-medium">This year: {selected.data.name}</p>
            )}
            {selected.type === 'member' && <p className="text-sm font-medium">{selected.data.name}</p>}
            {selected.type === 'event' && (
              <div className="text-sm">
                <p className="font-medium">{selected.data.name}</p>
                <p className="text-xs text-muted-foreground">{formatDate(selected.data.date)}</p>
                {selected.data.location_name && (
                  <p className="text-xs text-muted-foreground">{selected.data.location_name}</p>
                )}
                <Link
                  href={`/reunion/${reunionId}/events/${selected.data.id}`}
                  className="mt-1 inline-block text-xs text-primary hover:underline"
                >
                  View event
                </Link>
              </div>
            )}
          </Popup>
        )}
      </Map>
    </div>
  )
}
