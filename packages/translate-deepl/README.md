# @tokiwi/payload-translate-deepl

Adds a **Translate to new language** action to the document edit view. It reads the
document in the locale you are editing, sends every localized string and rich-text
run to [DeepL](https://www.deepl.com/docs-api), and writes the result into the
locale you pick, on the **same** document, which is how Payload stores locales.

```
Pages/42?locale=fr   (source)
        │  DeepL FR→EN
        ▼
Pages/42?locale=en   (filled in place)
```

## Install

```bash
bun add @tokiwi/payload-translate-deepl
```

```ts
import { deeplTranslatePlugin } from '@tokiwi/payload-translate-deepl'

export default buildConfig({
  plugins: [deeplTranslatePlugin()],
})
```

Then, in your project:

```bash
bunx payload generate:importmap
```

This is not optional and it fails silently: without it the menu items are simply
absent, with no error. Run it again after updating or removing the package.

```bash
DEEPL_API_BASE=https://api-free.deepl.com   # api.deepl.com for a paid key
DEEPL_API_KEY=...                           # a free key ends in ":fx"
```

The plugin removes itself, with one line on stderr, when the credentials are
missing. It also removes itself, silently, when the config has no localization or
has a single locale: there is nothing to translate between.

## Translating several documents

From the list view, tick rows (or use "select all") and pick **Translate selected**
from the actions menu. The selection travels as Payload's own `Where`, so ticking
three rows and selecting everything across every page are the same request, and a
cross-page selection never has to enumerate ids.

There is no cap on how many documents a run accepts. They are translated one at a
time against a single shared deadline, and the response is newline-delimited JSON,
one line as each document finishes, so the drawer shows a real progress bar and
names the document it is on. A run cut short by `bulkBudgetMs` reports exactly which
documents it reached. Running it again finishes the rest, and with **Overwrite** off
the finished ones cost nothing the second time.

Because the stream's headers go out before any work starts, the bulk endpoint always
answers `200` once it opens: the outcome is in the final `done` line, not the status
code. Only failures that happen _first_ (a bad locale, an empty selection, no
permission) are ordinary error responses.

## Options

| option                    | default                                                                 |                                                            |
| ------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| `collections`             | every collection with a localized field                                 | which collections get the action                           |
| `slugMode`                | `'translate'`                                                           | what to write when a slug may be replaced (see below)      |
| `placeholderSlug`         | `/^untitled(-\d+)?$/i`                                                  | which existing slugs count as replaceable                  |
| `normalizeSlug`           | built-in slugifier                                                      | how a translated slug is normalised                        |
| `skipFieldNames`          | `id`, `blockName`, `slug`, `anchor`, `url`, `mailto`, `width`, `height` | replaces the list of field names never sent to DeepL       |
| `addSkipFieldNames`       | none                                                                    | adds to the list in effect rather than replacing it        |
| `localeMap`               | fr, en, de, es, it, nl, pt                                              | Payload locale → DeepL `source_lang` / `target_lang`       |
| `formality`, `glossaryId` | none                                                                    | passed straight through to DeepL                           |
| `budgetMs`                | `90_000`                                                                | per document: after this, stop and save what is translated |
| `bulkBudgetMs`            | `1_800_000`                                                             | whole bulk run, shared across its documents                |
| `maxDocuments`            | `0` (no cap)                                                            | set a positive number to refuse larger selections          |
| `apiBase`, `apiKey`       | the env vars                                                            | for tests, or several DeepL accounts                       |
| `disabled`                | `false`                                                                 | keep it registered but inert                               |

### Slugs

A slug is a live URL, so it follows a narrower rule than everything else. It is
rewritten only when the target locale has nothing real there: an empty value, or a
placeholder like the `untitled-<id>` a migration leaves behind to satisfy a
`required, unique` column. A slug an editor chose is kept, unless **Overwrite** is
ticked.

When it is rewritten, `slugMode` decides what goes in:

| mode                    | `about-us/management`, EN → FR                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `'translate'` (default) | `a-propos-de-nous/equipe-de-direction`: sent to DeepL, then normalised, path depth survives          |
| `'preserve-or-derive'`  | the key is omitted, so a collection whose own `beforeValidate` derives a slug from the title does it |
| `'copy'`                | `about-us/management`                                                                                |

`placeholderSlug` changes what counts as replaceable, and `normalizeSlug` replaces
the built-in slugifier. The plugin carries its own rather than importing the
installing project's, so it stays self-contained. If the two ever disagree, the
collection's `beforeValidate` wins because it runs last.

## What it translates

Every `text`, `textarea` and `richText` field that is localized is covered,
including the ones nested inside groups, tabs, arrays and blocks. Which fields those
are comes from the collection's own field schema, so a new block is covered without
touching this plugin. Localized fields of other types (a select, a number) are
copied across rather than translated.

Rich text keeps its formatting: only a text node's `text` is replaced, and the runs
of one paragraph are sent as a single tagged string so DeepL can reorder bold and
linked words with the sentence. Code blocks, uploads, relationships and autolinks
are never touched.

Existing target-locale content is kept unless the editor ticks **Overwrite existing
translations**.

## Publishing

The translation of a **published** document is published: in the target locale
only. The write carries `_status: 'published'` and Payload's own
`publishSpecificLocale`, so it is merged into the last published version for that
locale alone: the other locales keep what they had published, and unpublished work
in the source locale stays unpublished, carried on into a snapshot version.

A document that has never been published stays a draft. Translating a page should
not be the act that puts it on the site, and there is no published version to merge
a locale into. A collection without drafts has nothing to publish either way. Its
write is live the moment it lands. The drawer says which of the three applies
before the editor runs anything.

Publishing validates the whole document. A draft write does not, unless the
collection turns `drafts.validate` on. When that validation fails (a translated
slug another document already holds, a required field nobody ever filled), the
translation is saved as a draft instead and the result carries a warning saying so,
rather than the run being thrown away.

## What it does not do

- **Globals.** Payload 3.90 has no `editMenuItems` slot on globals.
- **Queue.** Both endpoints are synchronous and bounded by their budgets. Anything
  too large to finish is saved as far as it got, and the response names what was
  left, so re-running completes it.
- **A localized field of any other type.** `text`, `textarea` and `richText` are
  the three the plugin knows how to take a string out of and put one back into. A
  localized `json` field is copied across untranslated. That is a missing feature,
  not a missing option: there is no general way to find the prose inside a blob.

## Layout

| file                    |                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `index.ts`              | the plugin: collection detection, menu item, endpoint                                              |
| `endpoint.ts`           | `POST /api/translate/deepl/:collection[/:id]`                                                      |
| `translateDocument.ts`  | read both locales → collect → translate → write                                                    |
| `translateDocuments.ts` | a list selection, one document at a time, one deadline                                             |
| `ndjson.ts`             | reads the progress stream a line at a time (pure)                                                  |
| `collect.ts`            | schema walk that finds localized values (pure)                                                     |
| `lexical.ts`            | Lexical state ↔ translatable runs (pure)                                                           |
| `xml.ts`                | the `<s i="N">` tag protocol (pure)                                                                |
| `path.ts`               | immutable writes that clone only the spine (pure)                                                  |
| `slugify.ts`            | slug normalisation and placeholder detection (pure)                                                |
| `deepl.ts`              | the HTTP client: batching, retry, limits                                                           |
| `components/`           | both menu items and their shared drawer                                                            |
| `client.ts`             | the client entry point: re-exports the components and is the only place the stylesheet is imported |
| `styles.scss`           | the CSS that orders the menu items in the document controls popup                                  |

## Tests

`test/*.spec.ts`, no database, no network. Three of them are worth reading before
changing anything, because they pin behaviour that fails _silently_ if broken:

- reads must pass `fallbackLocale: false`. Payload treats an omitted _or_ `null`
  fallback as "use the configured one", so a plain read of the target locale hands
  back the source text for anything untranslated.
- `_status` must never round-trip. Payload computes
  `isSavingDraft = draft && hasDrafts && data._status !== 'published'`, so the
  _source_ document's status would otherwise decide whether the write publishes. It
  is stripped with the other server-managed keys and set again deliberately, for a
  document that is already published.
- block and array row `id`s must survive the write byte-identical. Payload matches
  rows back to storage by `id` alone. A rebuilt row drops the other locale's
  content inside it.
