import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('x-supabase-auth')
  if (!authHeader) return NextResponse.json({ success: false, errors: ['Not authenticated'] }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: userData } = await supabase.auth.getUser(authHeader)
  if (!userData.user) return NextResponse.json({ success: false, errors: ['Not authenticated'] }, { status: 401 })

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 45000)
    let res: Response
    try {
      res = await fetch(`${req.nextUrl.origin}/api/weekly-report`, {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }
    const text = await res.text()
    let result: any
    try { result = JSON.parse(text) } catch { result = { success: false, errors: [`Non-JSON response (${res.status}): ${text.slice(0, 500)}`] } }
    return NextResponse.json(result, { status: res.status })
  } catch (err: any) {
    const message = err?.name === 'AbortError' ? 'Timed out after 45 seconds' : (err?.message || String(err))
    return NextResponse.json({ success: false, errors: [`Request failed: ${message}`] }, { status: 500 })
  }
}
