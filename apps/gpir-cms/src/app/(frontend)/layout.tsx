import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'GPIR Editorial CMS',
  description: 'Private GPIR editorial administration service',
  robots: { index: false, follow: false },
}

export default function FrontendLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>
}
