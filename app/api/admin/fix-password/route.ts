import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { userId, callerAccessToken } = await req.json()
  if (!userId || !callerAccessToken) {
    return NextResponse.json({ error: 'Missing userId or callerAccessToken', step: 'input' }, { status: 400 })
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({
      error: 'Missing NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_URL env var on the server',
      step: 'env_check',
    }, { status: 500 })
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({
      error: 'Missing SUPABASE_SERVICE_ROLE_KEY env var on the server',
      step: 'env_check',
    }, { status: 500 })
  }

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: callerData, error: callerError } = await supabaseAuth.auth.getUser(callerAccessToken)
  if (callerError || !callerData.user) {
    return NextResponse.json({ error: callerError?.message || 'Not logged in', step: 'verify_caller_session' }, { status: 401 })
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: callerProfile, error: profileError } = await supabaseAdmin
    .from('users').select('role').eq('id', callerData.user.id).single()
  if (profileError) {
    return NextResponse.json({ error: profileError.message, step: 'check_caller_role' }, { status: 500 })
  }
  if (callerProfile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admins only', step: 'role_check' }, { status: 403 })
  }

  // Confirm the target user actually exists from the admin API's own point
  // of view, before attempting to update it — this tells us definitively
  // whether the key/project is even seeing the right user table.
  const { data: lookupData, error: lookupError } = await supabaseAdmin.auth.admin.getUserById(userId)
  if (lookupError || !lookupData.user) {
    // Control test: try looking up the CALLER's own id (known to be valid,
    // since they just logged in with it) using the exact same admin
    // client. If this also fails, the service role key itself is the
    // problem — not anything specific to the target user.
    const { data: selfLookup, error: selfLookupError } = await supabaseAdmin.auth.admin.getUserById(callerData.user.id)
    return NextResponse.json({
      error: lookupError?.message || 'Target user not found via admin API',
      step: 'lookup_target_user',
      userIdSearched: userId,
      supabaseUrlUsed: process.env.NEXT_PUBLIC_SUPABASE_URL,
      controlTest: selfLookupError
        ? `FAILED too (${selfLookupError.message}) — the service role key itself is invalid`
        : `SUCCEEDED (found ${selfLookup.user?.email}) — key works fine, something specific to this user ID`,
    }, { status: 404 })
  }

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: 'Stoneline1',
  })

  if (error) {
    return NextResponse.json({ error: error.message, step: 'update_password' }, { status: 500 })
  }

  return NextResponse.json({ success: true, email: data.user.email, step: 'done' })
}
