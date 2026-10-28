'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function AboutPage() {
  return (
    <div className="min-h-full" style={{ background: '#F3EEE3' }}>
      <div className="max-w-2xl mx-auto p-6 md:p-16">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 mb-10">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>

        <svg width="88" height="84" viewBox="0 0 200 190" fill="none" className="mb-3">
          {/* Arch, voussoir by voussoir — the centre stone (sage green) is the keystone */}
          <path d="M 22.00 108.00 A 78 78 0 0 1 29.72 74.16 L 58.56 88.04 A 46 46 0 0 0 54.00 108.00 Z" fill="#D6D3D1" stroke="#F3EEE3" strokeWidth="3"/>
          <path d="M 29.72 74.16 A 78 78 0 0 1 51.37 47.02 L 71.32 72.04 A 46 46 0 0 0 58.56 88.04 Z" fill="#D6D3D1" stroke="#F3EEE3" strokeWidth="3"/>
          <path d="M 51.37 47.02 A 78 78 0 0 1 82.64 31.96 L 89.76 63.15 A 46 46 0 0 0 71.32 72.04 Z" fill="#D6D3D1" stroke="#F3EEE3" strokeWidth="3"/>
          <path d="M 82.64 31.96 A 78 78 0 0 1 117.36 31.96 L 110.24 63.15 A 46 46 0 0 0 89.76 63.15 Z" fill="#7D8C74" stroke="#F3EEE3" strokeWidth="3"/>
          <path d="M 117.36 31.96 A 78 78 0 0 1 148.63 47.02 L 128.68 72.04 A 46 46 0 0 0 110.24 63.15 Z" fill="#D6D3D1" stroke="#F3EEE3" strokeWidth="3"/>
          <path d="M 148.63 47.02 A 78 78 0 0 1 170.28 74.16 L 141.44 88.04 A 46 46 0 0 0 128.68 72.04 Z" fill="#D6D3D1" stroke="#F3EEE3" strokeWidth="3"/>
          <path d="M 170.28 74.16 A 78 78 0 0 1 178.00 108.00 L 146.00 108.00 A 46 46 0 0 0 141.44 88.04 Z" fill="#D6D3D1" stroke="#F3EEE3" strokeWidth="3"/>
          {/* Legs */}
          <rect x="22" y="108" width="32" height="62" fill="#D6D3D1" stroke="#F3EEE3" strokeWidth="3"/>
          <rect x="146" y="108" width="32" height="62" fill="#D6D3D1" stroke="#F3EEE3" strokeWidth="3"/>
        </svg>

        <p className="text-xs font-medium tracking-[0.2em] text-stone-400 mb-8">
          KEYSTONE
        </p>

        <p className="text-xs font-medium tracking-[0.15em] text-stone-500 mb-4">
          PETRUS ATELIER
        </p>

        <h1 className="text-2xl font-semibold text-stone-900 mb-4">Keystone</h1>

        <div className="w-8 h-0.5 mb-5" style={{ background: '#c1503f' }} />

        <p className="italic text-stone-500 text-xs leading-relaxed mb-6">
          As the keystone is the stone that locks an arch together —<br className="hidden md:block" />
          without it, everything else falls apart.
        </p>

        <p className="text-sm text-stone-700 leading-snug mb-4">
          One system that runs the whole business, from the first client
          enquiry through to the last snag signed off.
        </p>

        <p className="text-xs text-stone-500 leading-relaxed mb-10">
          On the sales side: leads, quotes, samples and estimates in one pipeline.
          On the project side: every job tracked from quotation through installation,
          snagging and handover — dates, documents, materials, payments and contacts
          all in one place.
        </p>

        <p className="text-xs text-stone-400">
          Prepared by Pietro Sacchelli
        </p>
      </div>
    </div>
  )
}
