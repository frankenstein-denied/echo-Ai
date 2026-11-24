'use client'

import { useEffect, useState } from 'react'
import { disconnectWeather, setWeatherLocation } from '@/lib/firestore'
import { fetchForecast, searchPlaces, type Place } from '@/lib/echo/weather'
import { weatherTileFacts } from '@/lib/echo/connector-tiles'
import { Button, Input, Skeleton } from '../ui'

/** Live temperature, condition and a rain/high-low hint for the saved location. Fetched once per location. */
export function WeatherLive({ place, lat, lon }: { place?: string; lat?: number; lon?: number }) {
  const [facts, setFacts] = useState<ReturnType<typeof weatherTileFacts> | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (typeof lat !== 'number' || typeof lon !== 'number') return
    let live = true
    setFacts(null)
    setFailed(false)
    fetchForecast(lat, lon)
      .then((data) => {
        if (live) setFacts(weatherTileFacts(data, new Date()))
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [lat, lon])

  const name = place || 'Your location'
  if (failed || typeof lat !== 'number' || typeof lon !== 'number') return <p className="mt-4 text-sm text-muted-foreground">{name}</p>
  if (!facts) return <Skeleton className="mt-4 h-16" />
  return (
    <div className="mt-4">
      <p className="text-3xl font-semibold text-foreground">{facts.temp}</p>
      <p className="mt-1 text-sm text-foreground">
        {name} · {facts.condition}
      </p>
      {facts.hint && <p className="mt-1 text-sm text-muted-foreground">{facts.hint}</p>}
    </div>
  )
}

/** One line for a connector row: "29° · Cloudy · Manila" (the place alone while loading or when the fetch fails). */
export function WeatherLine({ place, lat, lon }: { place?: string; lat?: number; lon?: number }) {
  const [facts, setFacts] = useState<ReturnType<typeof weatherTileFacts> | null>(null)

  useEffect(() => {
    if (typeof lat !== 'number' || typeof lon !== 'number') return
    let live = true
    setFacts(null)
    fetchForecast(lat, lon)
      .then((data) => {
        if (live) setFacts(weatherTileFacts(data, new Date()))
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [lat, lon])

  const name = place || 'Your location'
  if (!facts) return <>{name}</>
  return <>{[facts.temp, facts.condition, name].filter(Boolean).join(' · ')}</>
}

function geoMessage(code: number | undefined): string {
  if (code === 1) return 'Location access was blocked. Search for your city instead.'
  if (code === 3) return 'Finding your location took too long. Search for your city instead.'
  return 'Could not find your location. Search for your city instead.'
}

/** Weather card body: pick a location (browser geolocation or city search), or show and change/disconnect the saved one. */
export function WeatherBody({ uid, connected, place, showPlace = true }: { uid: string; connected: boolean; place?: string; showPlace?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [locating, setLocating] = useState(false)
  const [changing, setChanging] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[] | null>(null)
  const [message, setMessage] = useState('')

  async function save(loc: { place: string; lat: number; lon: number }) {
    try {
      await setWeatherLocation(uid, loc)
      setChanging(false)
      setResults(null)
      setQuery('')
      setMessage('')
    } catch {
      setMessage('Could not save your location. Please try again.')
    }
  }

  function useMyLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setMessage('Your browser can not share a location. Search for your city instead.')
      return
    }
    setBusy(true)
    setLocating(true)
    setMessage('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void save({ place: 'Your location', lat: pos.coords.latitude, lon: pos.coords.longitude }).finally(() => {
          setBusy(false)
          setLocating(false)
        })
      },
      (err) => {
        setMessage(geoMessage(err?.code))
        setBusy(false)
        setLocating(false)
      },
      { timeout: 10000, maximumAge: 600000 },
    )
  }

  async function search() {
    if (!query.trim()) return
    setBusy(true)
    setMessage('')
    try {
      const found = await searchPlaces(query)
      setResults(found.slice(0, 5))
      if (found.length === 0) setMessage('No places found. Try another spelling.')
    } catch {
      setResults(null)
      setMessage('Could not search right now. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    setMessage('')
    try {
      await disconnectWeather(uid)
      setChanging(false)
    } catch {
      setMessage('Could not disconnect. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const picking = !connected || changing
  return (
    <div className="mt-4 space-y-3">
      {connected && showPlace && (
        <p className="text-sm text-foreground">
          Showing weather for <span className="font-medium">{place || 'your location'}</span>
        </p>
      )}
      {picking ? (
        <>
          <Button variant="primary" loading={locating} disabled={busy} onClick={useMyLocation} className="w-full">
            Use my location
          </Button>
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault()
              void search()
            }}
          >
            <div className="min-w-0 flex-1">
              <Input label="Or search for a city" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Manila" maxLength={100} />
            </div>
            <Button type="submit" variant="secondary" disabled={busy || !query.trim()} className="w-full sm:w-auto">
              Search
            </Button>
          </form>
          {results && results.length > 0 && (
            <ul className="space-y-1" aria-label="Search results">
              {results.map((r) => (
                <li key={`${r.lat},${r.lon}`}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true)
                      void save({ place: r.detail ? `${r.name}, ${r.detail}` : r.name, lat: r.lat, lon: r.lon }).finally(() => setBusy(false))
                    }}
                    className="w-full rounded-lg border border-border px-3 py-2 text-left text-sm text-foreground hover:bg-surface-2 disabled:opacity-50 max-lg:min-h-11"
                  >
                    {r.name}
                    {r.detail ? ` — ${r.detail}` : ''}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {changing && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setChanging(false)} className="w-full">
              Cancel
            </Button>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" disabled={busy} onClick={() => setChanging(true)} className="w-full sm:flex-1">
            Change location
          </Button>
          <Button variant="secondary" loading={busy} onClick={() => void disconnect()} className="w-full sm:flex-1">
            Disconnect
          </Button>
        </div>
      )}
      {message && (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  )
}
