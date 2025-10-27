import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Auto Daily Commit',
  description: 'Next.js application with automatic daily commits',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}