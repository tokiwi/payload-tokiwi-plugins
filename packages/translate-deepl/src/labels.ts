/**
 * Bilingual strings for the admin UI.
 *
 * Inline `{ en, fr }` objects resolved with `getTranslation`. No wiring in
 * `payload.config.ts`, no key a consumer has to know about.
 */

export type Label = { en: string; fr: string }

export const labels = {
  bulkNotice: {
    en: 'Each document is translated in turn, so this can take a while. Nothing already translated is re-sent unless you tick the box above. A published document has its translation published in the target locale. One that is not published stays a draft.',
    fr: 'Chaque document est traduit à son tour, l’opération peut donc être longue. Rien de déjà traduit n’est renvoyé, sauf si vous cochez la case ci-dessus. Un document publié voit sa traduction publiée dans la langue cible. Un document non publié reste un brouillon.',
  },
  cancel: { en: 'Cancel', fr: 'Annuler' },
  documentsSelected: { en: 'documents selected', fr: 'documents sélectionnés' },
  documentsTranslated: { en: 'documents translated', fr: 'documents traduits' },
  draftNotice: {
    en: 'This document is not published, so the translation is saved as a draft. Review it, then publish.',
    fr: 'Ce document n’est pas publié : la traduction est enregistrée comme brouillon. Relisez-la, puis publiez.',
  },
  failed: { en: 'Translation failed', fr: 'La traduction a échoué' },
  immediateNotice: {
    en: 'This collection has no drafts: the translation goes live immediately.',
    fr: 'Cette collection n’a pas de brouillons : la traduction est publiée immédiatement.',
  },
  overwrite: {
    en: 'Overwrite existing translations',
    fr: 'Écraser les traductions existantes',
  },
  partial: {
    en: 'Some values could not be translated',
    fr: 'Certaines valeurs n’ont pas pu être traduites',
  },
  publishNotice: {
    en: 'This document is published, so the translation is published in the target locale as soon as it is written. The other locales keep whatever they have published.',
    fr: 'Ce document est publié : la traduction est publiée dans la langue cible dès qu’elle est écrite. Les autres langues conservent ce qu’elles ont publié.',
  },
  rerunToFinish: {
    en: 'Run it again to finish the rest, starting with:',
    fr: 'Relancez pour terminer le reste, en commençant par :',
  },
  running: { en: 'Translating…', fr: 'Traduction en cours…' },
  selectFirst: {
    en: 'Select at least one row in the list first.',
    fr: 'Sélectionnez d’abord au moins une ligne dans la liste.',
  },
  saveFirst: {
    en: 'Save your changes before translating: the translation runs on the saved document.',
    fr: 'Enregistrez vos modifications avant de traduire : la traduction porte sur le document enregistré.',
  },
  submit: { en: 'Translate', fr: 'Traduire' },
  succeeded: { en: 'Translation finished', fr: 'Traduction terminée' },
  targetLocale: { en: 'Translate into', fr: 'Traduire vers' },
  title: { en: 'Translate to new language', fr: 'Traduire vers une nouvelle langue' },
  translateSelected: { en: 'Translate selected', fr: 'Traduire la sélection' },
} satisfies Record<string, Label>
