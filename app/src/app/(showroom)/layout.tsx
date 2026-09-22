import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from '@mantine/core'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import './globals.css'

export const metadata: Metadata = {
  description: 'Every Tokiwi Payload package, rendered',
  title: 'Showroom',
}

const Layout = ({ children }: { children: ReactNode }) => (
  <html lang="en" {...mantineHtmlProps}>
    <head>
      <ColorSchemeScript />
    </head>
    <body className="antialiased">
      <MantineProvider>
        <div className="mx-auto max-w-3xl px-6 py-12">{children}</div>
      </MantineProvider>
    </body>
  </html>
)

export default Layout
