import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const todayStr = new Date().toISOString().split('T')[0]
  const RECIPIENTS = ['qs@stoneline.co.uk', 'pietrosacchelli17@gmail.com']

  // To Do List is admin-only, so this only ever looks at admin accounts —
  // merged together since the same person may be logged in under either
  // qs@stoneline.co.uk or their personal account when adding items.
  const { data: admins } = await supabase.from('users').select('id, full_name, email').eq('role', 'admin')
  if (!admins || admins.length === 0) {
    return NextResponse.json({ success: true, sent: 0, note: 'No admin users found' })
  }

  const { data: todos } = await supabase
    .from('admin_todos')
    .select('*')
    .in('user_id', admins.map(a => a.id))
    .eq('todo_date', todayStr)
    .eq('completed', false)
    .order('created_at')

  // Nothing left outstanding today — skip the email entirely rather
  // than sending an empty "you're done" notification every day.
  if (!todos || todos.length === 0) {
    return NextResponse.json({ success: true, sent: 0, note: 'Nothing outstanding today' })
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
      <p style="color:#A8A29E;font-size:11px;margin:14px 4px 0;">Sent automatically at 1:30pm — plenty of time to clear these before end of day.</p>
    </div>
  `

  const res = await fetch('https://api.resend.com/emails', {
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
  })

  if (res.ok) {
    return NextResponse.json({ success: true, sent: RECIPIENTS, itemCount: todos.length })
  } else {
    const errText = await res.text()
    return NextResponse.json({ success: false, errors: [errText] }, { status: 500 })
  }
}
