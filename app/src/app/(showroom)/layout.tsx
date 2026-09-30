import '@mantine/core/styles.css'
import '@mantine/carousel/styles.css'

import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from '@mantine/core'
import type { ReactNode } from 'react'

/**
 * The front end is its own root layout: the admin panel under `(payload)` has one of its
 * own, and Mantine's stylesheets must not reach it.
 */
const Layout = ({ children }: { children: ReactNode }) => (
  <html lang="fr" {...mantineHtmlProps}>
    <head>
      <ColorSchemeScript />
    </head>
    <body>
      <MantineProvider>{children}</MantineProvider>
    </body>
  </html>
)

export default Layout
