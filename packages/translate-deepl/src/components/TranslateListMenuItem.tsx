'use client'

/**
 * "Translate selected" in the list view's actions menu.
 *
 * The checkboxes and the "select all" behaviour are Payload's own. This reads
 * them through `useSelection()`, which `ListControls` is rendered inside, and
 * hands the endpoint `getQueryParams()`. That is already Payload's encoding of
 * the selection: `id: { in: [...] }` for a handful of rows, or the list's current
 * filters when the editor chose "select all across pages". Nothing here has to
 * tell the two apart, and no ids are enumerated for a selection that spans pages.
 */

import { PopupList, toast, useConfig, useLocale, useModal, useSelection } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import React, { useCallback, useState } from 'react'

import type { BulkProgressEvent, BulkTranslateResult } from '../types'
import type { TranslateProgress } from './TranslateDrawer'

import { buildBulkEndpointPath, MENU_ITEM_ID } from '../constants'
import { labels } from '../labels'
import { readNdjson } from '../ndjson'
import { baseClass, TranslateDrawer, useLabel } from './TranslateDrawer'

export type TranslateListMenuItemProps = {
  collectionSlug: string
}

export const TranslateListMenuItem: React.FC<TranslateListMenuItemProps> = ({ collectionSlug }) => {
  const { config } = useConfig()
  const { code: currentLocale } = useLocale()
  const { closeModal, openModal } = useModal()
  const { count, getQueryParams, selectAll, totalDocs } = useSelection()
  const router = useRouter()
  const t = useLabel()

  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<null | TranslateProgress>(null)

  const drawerSlug = `${baseClass}-list-${collectionSlug}`

  // "All available" means every row matching the current filters, which is more
  // than the page the editor can see, so the count comes from the query.
  const selectedCount = selectAll === 'allAvailable' ? (totalDocs ?? 0) : count

  const run = useCallback(
    async ({ overwrite, targetLocale }: { overwrite: boolean; targetLocale: string }) => {
      if (!targetLocale || selectedCount === 0) return
      setRunning(true)
      setProgress({ current: 0, total: selectedCount })

      try {
        const url = `${config.serverURL}${config.routes.api}${buildBulkEndpointPath(
          collectionSlug,
        )}${getQueryParams()}`

        const response = await fetch(url, {
          body: JSON.stringify({ overwrite, sourceLocale: currentLocale, targetLocale }),
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        })

        // Anything that fails before the stream opens is still an ordinary error
        // response: a bad locale, an empty selection, no permission.
        if (!response.ok || !response.body) {
          const failure = (await response.json().catch(() => ({}))) as {
            errors?: { message?: string }[]
          }
          toast.error(failure.errors?.[0]?.message ?? t(labels.failed))
          return
        }

        // Once the stream opens the status is already committed to 200, so the
        // outcome travels in the `done` line rather than in the status code.
        // Held in an object because TypeScript cannot follow an assignment made
        // inside the callback.
        const outcome: { done?: BulkTranslateResult } = {}

        await readNdjson<BulkProgressEvent>(response.body, (event) => {
          if (event.type === 'start') {
            setProgress({ current: 0, total: event.total })
            return
          }
          if (event.type === 'document') {
            setProgress({
              current: event.index + 1,
              label: event.document.title ?? `#${event.document.id}`,
              total: event.total,
            })
            return
          }
          outcome.done = event
        })

        const payload = outcome.done
        if (!payload) {
          toast.error(t(labels.failed))
          return
        }
        if (!payload.ok) {
          toast.error(payload.results.find((result) => result.error)?.error ?? t(labels.failed))
          return
        }

        const message = `${payload.documentsTranslated}/${payload.requested} ${t(labels.documentsTranslated)}`

        if (payload.documentsFailed > 0 || payload.partial) {
          // Name the first few that did not make it. Re-running finishes them,
          // and with "overwrite" off the ones already done cost nothing.
          const names = payload.results
            .filter((result) => !result.ok)
            .slice(0, 3)
            .map((result) => result.title ?? `#${result.id}`)
          toast.warning(`${message}. ${t(labels.rerunToFinish)} ${names.join(', ')}`)
        } else {
          toast.success(message)
        }

        closeModal(drawerSlug)
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t(labels.failed))
      } finally {
        setRunning(false)
        setProgress(null)
      }
    },
    [
      closeModal,
      collectionSlug,
      config.routes.api,
      config.serverURL,
      currentLocale,
      drawerSlug,
      getQueryParams,
      router,
      selectedCount,
      t,
    ],
  )

  return (
    <React.Fragment>
      <PopupList.Button id={`${MENU_ITEM_ID}-list`} onClick={() => openModal(drawerSlug)}>
        {selectedCount > 0
          ? `${t(labels.translateSelected)} (${selectedCount})`
          : t(labels.translateSelected)}
      </PopupList.Button>

      <TranslateDrawer
        notices={
          selectedCount === 0
            ? [{ text: t(labels.selectFirst), warning: true }]
            : [
                { text: `${selectedCount} ${t(labels.documentsSelected)}` },
                { text: t(labels.bulkNotice) },
              ]
        }
        onSubmit={run}
        progress={progress}
        running={running}
        slug={drawerSlug}
        submitDisabled={selectedCount === 0}
        title={t(labels.translateSelected)}
      />
    </React.Fragment>
  )
}
