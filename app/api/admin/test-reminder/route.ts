import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  // Confirm the caller is actually logged in before triggering anything
  const authHeader = req.headers.get('x-supabase-auth')
  if (!authHeader) return NextResponse.json({ success: false, errors: ['Not authenticated'] }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: userData } = await supabase.auth.getUser(authHeader)
  if (!userData.user) return NextResponse.json({ success: false, errors: ['Not authenticated'] }, { status: 401 })

  // Same logic as /api/todo-reminder, run directly here instead of
  // making the function call out to its own deployment URL — a
  // self-referencing fetch that can occasionally hang in Vercel's
  // serverless environment rather than failing cleanly.
  try {
    const todayStr = new Date().toISOString().split('T')[0]
    const RECIPIENTS = ['qs@stoneline.co.uk', 'pietrosacchelli17@gmail.com']

    const { data: admins, error: adminsError } = await supabase.from('users').select('id, full_name, email').eq('role', 'admin')
    if (adminsError) return NextResponse.json({ success: false, errors: [`Fetching admins: ${adminsError.message}`] }, { status: 500 })
    if (!admins || admins.length === 0) {
      return NextResponse.json({ success: true, sent: 0, note: 'No admin users found' })
    }

    const { data: todos, error: todosError } = await supabase
      .from('admin_todos')
      .select('*')
      .in('user_id', admins.map(a => a.id))
      .eq('todo_date', todayStr)
      .eq('completed', false)
      .order('created_at')
    if (todosError) return NextResponse.json({ success: false, errors: [`Fetching todos: ${todosError.message}`] }, { status: 500 })

    if (!todos || todos.length === 0) {
      return NextResponse.json({ success: true, sent: 0, note: 'Nothing outstanding today' })
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ success: false, errors: ['RESEND_API_KEY is not set in this environment'] }, { status: 500 })
    }

    const itemsHtml = todos.map(t => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #F0EEEA;font-size:14px;color:#1C1917;">${t.text}</td>
      </tr>
    `).join('')

    const html = `
      <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;">
        <div style="background:#1C1917;padding:20px 24px;border-radius:10px 10px 0 0;">
          <p style="color:#8C7F58;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin:0 0 6px;">Stoneline UK</p>
          <h1 style="color:white;font-size:18px;margin:0;">Still on your list today</h1>
          <p style="color:#A8A29E;font-size:12px;margin:6px 0 0;">${format(new Date(), 'EEEE d MMMM yyyy')} · ${todos.length} item${todos.length !== 1 ? 's' : ''} not done yet</p>
        </div>
        <table style="width:100%;border-collapse:collapse;background:white;border:1px solid #E7E5E4;border-top:none;">
          <tbody>${itemsHtml}</tbody>
        </table>
        <p style="color:#A8A29E;font-size:11px;margin:14px 4px 0;">Sent as a manual test from /admin/test-reminder.</p>
      </div>
    `

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)
    let resendRes: Response
    try {
      resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Stoneline UK <onboarding@resend.dev>',
          to: RECIPIENTS,
          subject: `${todos.length} to do item${todos.length !== 1 ? 's' : ''} left today`,
          html,
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (resendRes.ok) {
      return NextResponse.json({ success: true, sent: RECIPIENTS, itemCount: todos.length })
    } else {
      const errText = await resendRes.text()
      return NextResponse.json({ success: false, errors: [`Resend API (${resendRes.status}): ${errText}`] }, { status: 500 })
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, errors: [`Unexpected error: ${err?.message || String(err)}`] }, { status: 500 })
  }
}
