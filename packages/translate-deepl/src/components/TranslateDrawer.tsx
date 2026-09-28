'use client'

/**
 * The drawer both menu items open: pick a target locale, decide whether to
 * overwrite, confirm.
 *
 * Sticks to the public `@payloadcms/ui` barrel: `Drawer`'s `title` prop renders
 * the same header a package-private `DrawerHeader` import would, without reaching
 * past the package boundary.
 */

import { getTranslation } from '@payloadcms/translations'
import {
  Button,
  CheckboxInput,
  Drawer,
  SelectInput,
  useConfig,
  useLocale,
  useModal,
  useTranslation,
} from '@payloadcms/ui'
import React, { useCallback, useMemo, useState } from 'react'

import type { Label } from '../labels'

import { labels } from '../labels'

export const baseClass = 'deepl-translate'

/** `SelectInput`'s onChange is typed loosely enough to hand back a bare object. */
const optionValue = (option: unknown): string => {
  const first = Array.isArray(option) ? option[0] : option
  const value = first && typeof first === 'object' ? (first as { value?: unknown }).value : first
  return typeof value === 'string' ? value : ''
}

/** Live state of a bulk run, rendered as a bar while it is going. */
export type TranslateProgress = {
  current: number
  /** The document being worked on, shown under the bar. */
  label?: string
  total: number
}

export type TranslateDrawerProps = {
  /** Lines shown above the buttons: what will happen, and any warning. */
  notices?: { text: string; warning?: boolean }[]
  onSubmit: (args: { overwrite: boolean; targetLocale: string }) => Promise<void> | void
  /** Omitted for a single document, where there is nothing to count. */
  progress?: null | TranslateProgress
  running: boolean
  slug: string
  /** Blocks the submit button, for an unsaved form or an empty selection. */
  submitDisabled?: boolean
  title: string
}

export const TranslateDrawer: React.FC<TranslateDrawerProps> = ({
  notices = [],
  onSubmit,
  progress,
  running,
  slug,
  submitDisabled,
  title,
}) => {
  const { config } = useConfig()
  const { code: currentLocale } = useLocale()
  const { i18n } = useTranslation()
  const { closeModal } = useModal()

  const [targetLocale, setTargetLocale] = useState('')
  const [overwrite, setOverwrite] = useState(false)

  const t = useCallback((label: Label) => getTranslation(label, i18n), [i18n])

  const localeOptions = useMemo(
    () =>
      (config.localization ? config.localization.locales : [])
        .filter((locale) => locale.code !== currentLocale)
        .map((locale) => ({ label: getTranslation(locale.label, i18n), value: locale.code })),
    [config.localization, currentLocale, i18n],
  )

  return (
    <Drawer className={baseClass} slug={slug} title={title}>
      <div className={`${baseClass}__content`}>
        <SelectInput
          label={t(labels.targetLocale)}
          name="targetLocale"
          onChange={(option) => setTargetLocale(optionValue(option))}
          options={localeOptions}
          path="targetLocale"
          value={targetLocale}
        />

        {/*
          `CheckboxInput`, not `CheckboxField`: the field variant registers with the
          surrounding form through `useField`, so ticking it would mark the
          *document* as modified and trip the "save before translating" guard below.
        */}
        <CheckboxInput
          checked={overwrite}
          id={`${slug}-overwrite`}
          label={t(labels.overwrite)}
          name="overwrite"
          onToggle={() => setOverwrite((previous) => !previous)}
        />

        {progress ? (
          <div className={`${baseClass}__progress`}>
            <div className={`${baseClass}__progress-track`}>
              <div
                className={`${baseClass}__progress-fill`}
                style={{
                  // `total` is known from the stream's first line, so the bar is
                  // real rather than an indeterminate spinner.
                  width: `${progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%`,
                }}
              />
            </div>
            <p className={`${baseClass}__progress-label`}>
              {progress.current} / {progress.total}
              {progress.label ? ` (${progress.label})` : ''}
            </p>
          </div>
        ) : null}

        {notices.map((notice) => (
          <p
            className={`${baseClass}__notice${notice.warning ? ` ${baseClass}__warning` : ''}`}
            key={notice.text}
          >
            {notice.text}
          </p>
        ))}

        <div className={`${baseClass}__actions`}>
          <Button buttonStyle="secondary" onClick={() => closeModal(slug)} size="medium">
            {t(labels.cancel)}
          </Button>
          <Button
            buttonStyle="primary"
            disabled={!targetLocale || running || submitDisabled}
            onClick={() => onSubmit({ overwrite, targetLocale })}
            size="medium"
          >
            {running ? t(labels.running) : t(labels.submit)}
          </Button>
        </div>
      </div>
    </Drawer>
  )
}

/** Shared by both menu items: resolve a `{ en, fr }` label for the admin language. */
export const useLabel = (): ((label: Label) => string) => {
  const { i18n } = useTranslation()
  return useCallback((label: Label) => getTranslation(label, i18n), [i18n])
}
