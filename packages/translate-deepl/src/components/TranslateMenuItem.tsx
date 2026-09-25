'use client'

/**
 * "Translate to new language" in the document controls popup.
 *
 * Payload renders `editMenuItems` last and offers no ordering API, so
 * `styles.scss` moves it up between "Create new" and "Duplicate".
 */

import {
  PopupList,
  toast,
  useConfig,
  useDocumentInfo,
  useFormModified,
  useLocale,
  useModal,
  useRouteTransition,
} from '@payloadcms/ui'
import { usePathname, useRouter } from 'next/navigation'
import React, { useCallback, useState } from 'react'

import type { TranslateResult } from '../types'

import { buildEndpointPath, MENU_ITEM_ID } from '../constants'
import { labels } from '../labels'
import { baseClass, TranslateDrawer, useLabel } from './TranslateDrawer'

export type TranslateMenuItemProps = {
  collectionSlug: string
}

export const TranslateMenuItem: React.FC<TranslateMenuItemProps> = ({ collectionSlug }) => {
  const { config } = useConfig()
  const { code: currentLocale } = useLocale()
  const { id, collectionSlug: infoSlug, docConfig, hasPublishedDoc } = useDocumentInfo()
  const { closeModal, openModal } = useModal()
  const { startRouteTransition } = useRouteTransition()
  const modified = useFormModified()
  const router = useRouter()
  const pathname = usePathname()
  const t = useLabel()

  const [running, setRunning] = useState(false)

  const slug = collectionSlug ?? infoSlug
  // One modal slug per document, so two edit views open in the same session
  // cannot toggle each other's drawer.
  const drawerSlug = `${baseClass}-${slug}-${String(id ?? 'new')}`

  // Drafts are only a review step where the collection has them. Everywhere else
  // the translation is live the moment it is written, and the editor should know.
  const hasDrafts = Boolean(
    docConfig && 'versions' in docConfig && typeof docConfig.versions === 'object'
      ? (docConfig.versions as { drafts?: unknown }).drafts
      : false,
  )

  // What the endpoint will decide, said up front: a published document has its
  // translation published in the target locale, an unpublished one keeps it as a
  // draft, and without drafts there is nothing in between.
  const outcomeNotice = !hasDrafts
    ? labels.immediateNotice
    : hasPublishedDoc
      ? labels.publishNotice
      : labels.draftNotice

  const run = useCallback(
    async ({ overwrite, targetLocale }: { overwrite: boolean; targetLocale: string }) => {
      if (!targetLocale || !id) return
      setRunning(true)

      try {
        const response = await fetch(
          `${config.serverURL}${config.routes.api}${buildEndpointPath(slug, id)}`,
          {
            body: JSON.stringify({ overwrite, sourceLocale: currentLocale, targetLocale }),
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          },
        )

        const payload = (await response.json()) as Partial<TranslateResult> & {
          errors?: { message?: string }[]
        }

        if (!response.ok || payload.ok === false) {
          toast.error(
            payload.errors?.[0]?.message ?? payload.failures?.[0]?.reason ?? t(labels.failed),
          )
          return
        }

        const issues = [...(payload.failures ?? []), ...(payload.warnings ?? [])]
        if (issues.length > 0) {
          toast.warning(
            `${t(labels.partial)}: ${issues
              .slice(0, 3)
              .map((issue) => issue.path || issue.reason)
              .join(', ')}`,
          )
        } else {
          toast.success(t(labels.succeeded))
        }

        closeModal(drawerSlug)
        startRouteTransition(() => router.push(`${pathname}?locale=${targetLocale}`))
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t(labels.failed))
      } finally {
        setRunning(false)
      }
    },
    [
      closeModal,
      config.routes.api,
      config.serverURL,
      currentLocale,
      drawerSlug,
      id,
      pathname,
      router,
      slug,
      startRouteTransition,
      t,
    ],
  )

  // Nothing to translate into, or nothing to translate yet.
  if (!id) return null

  return (
    <React.Fragment>
      <PopupList.Button id={MENU_ITEM_ID} onClick={() => openModal(drawerSlug)}>
        {t(labels.title)}
      </PopupList.Button>

      <TranslateDrawer
        notices={[
          { text: t(outcomeNotice) },
          // The endpoint reads the saved document, and the redirect would throw
          // away anything still sitting in the form.
          ...(modified ? [{ text: t(labels.saveFirst), warning: true }] : []),
        ]}
        onSubmit={run}
        running={running}
        slug={drawerSlug}
        submitDisabled={modified}
        title={t(labels.title)}
      />
    </React.Fragment>
  )
}
