'use client'

/**
 * The package's client entry point. A consumer never imports these components by
 * path: the plugin registers them as `@tokiwi/payload-translate-deepl/client#…`,
 * and `payload generate:importmap` resolves that specifier wherever the package
 * happens to be installed.
 *
 * The stylesheet import lives here rather than in a component, so a server-side
 * import of `.` never drags CSS into a build that cannot handle it.
 */

import './styles.css'

export { TranslateDrawer } from './components/TranslateDrawer'
export type { TranslateDrawerProps, TranslateProgress } from './components/TranslateDrawer'
export { TranslateListMenuItem } from './components/TranslateListMenuItem'
export type { TranslateListMenuItemProps } from './components/TranslateListMenuItem'
export { TranslateMenuItem } from './components/TranslateMenuItem'
export type { TranslateMenuItemProps } from './components/TranslateMenuItem'
export type { Label } from './labels'
